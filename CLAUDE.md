# Intelligent Model Selector - Developer Guide for Claude

**Last Updated:** 2025-11-19
**Purpose:** AI assistant context for development work

---

## Project Overview

**intelligent-model-selector** is a microservice that dynamically selects optimal AI models from the ai_models_main Supabase table based on query characteristics, performance metrics, rate limits, and geographic considerations.

**Core Purpose:** Replace hardcoded model selection in askme_v2 with intelligent, data-driven routing.

---

## Architecture Summary

```
Client (askme_v2)
    ↓ POST /select-model
Selector Service
    ├─→ Supabase (ai_models_main table)
    ├─→ Cache Layer (30-min TTL)
    ├─→ Artificial Analysis API (Intelligence Index)
    └─→ Rate Limit Tracker (in-memory)
```

**Key Components:**
1. **modelSelector.js** - Core selection algorithm
2. **intelligenceIndex.js** - Artificial Analysis API integration
3. **rateLimitTracker.js** - Provider usage tracking
4. **supabase.js** - Database queries

---

## Codebase Structure

```
selector-service/
├── src/
│   ├── index.js                     # Express server entry point
│   ├── config/
│   │   └── constants.js             # Selection criteria, scoring weights
│   ├── services/
│   │   ├── modelSelector.js         # Main selection logic
│   │   ├── intelligenceIndex.js     # Performance metrics API
│   │   └── rateLimitTracker.js      # Usage tracking
│   ├── utils/
│   │   └── supabase.js              # Database queries
│   └── __tests__/
│       ├── modelSelector.test.js
│       ├── intelligenceIndex.test.js
│       └── rateLimitTracker.test.js
├── .env.example                     # Environment template
├── package.json                     # Dependencies
└── jest.config.js                   # Test configuration
```

---

## Common Development Commands

```bash
# Development
npm run dev          # Start with hot reload (--watch mode)
npm start            # Production mode

# Testing
npm test             # Run all tests with coverage
npm run test:watch   # Watch mode for TDD

# Code Quality
npm run lint         # Check code style
npm run lint:fix     # Auto-fix style issues
```

---

## Data Flows

### Model Selection Flow

```
1. Client Request
   POST /select-model
   {queryType, queryText, modalities, complexityScore}

2. Cache Check
   IF cache expired:
     → Query ai_models_main (Supabase)
     → Fetch Intelligence Index scores
     → Update cache (30-min TTL)
   ELSE:
     → Use cached model list

3. Filtering
   → Filter by modality requirements
   → Exclude unavailable models

4. Scoring
   FOR each model:
     score = (
       intelligenceIndex * 0.35 +
       latencyScore * 0.25 +
       headroomScore * 0.25 +
       geographyScore * 0.10 +
       licenseScore * 0.05
     )

5. Headroom Matching
   IF complexityScore > 0.7:
     → Require headroom > 0.6
   ELSE IF complexityScore > 0.4:
     → Require headroom > 0.3
   ELSE:
     → Any headroom acceptable

6. Selection
   → Sort by score (descending)
   → Return top model

7. Response
   {provider, modelName, score, rateLimitHeadroom, ...}
```

### Rate Limit Tracking Flow

```
1. Initialize Counters
   {
     groq: {count: 0, limit: 30, window: 60000},
     google: {count: 0, limit: 60, window: 60000},
     openrouter: {count: 0, limit: 200, window: 60000}
   }

2. On Model Selection
   → Increment provider counter
   → Calculate headroom = (limit - count) / limit

3. Window Reset
   → Every 60 seconds: reset all counters to 0

4. Headroom Calculation
   → Used in selection scoring
   → Prevents overloading single provider
```

---

## Configuration & Secrets

### Environment Variables

**Required:**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

**Optional:**
```env
ARTIFICIAL_ANALYSIS_API_KEY=your-api-key
PORT=3001
CACHE_TTL=1800000
NODE_ENV=development
LOG_LEVEL=debug
```

### Constants Configuration

**File:** `src/config/constants.js`

```javascript
export const SELECTION_WEIGHTS = {
  intelligenceIndex: 0.35,
  latency: 0.25,
  rateLimitHeadroom: 0.25,
  geography: 0.10,
  license: 0.05
};

export const LATENCY_SCORES = {
  groq: 1.0,      // Fastest
  google: 0.8,    // Fast
  openrouter: 0.6 // Moderate
};

export const COMPLEXITY_THRESHOLDS = {
  high: 0.7,      // Requires headroom > 0.6
  medium: 0.4     // Requires headroom > 0.3
};
```

---

## API Contract

### POST /select-model

**Request Schema:**
```typescript
{
  queryType: 'business_news' | 'financial_analysis' | 'creative' | 'general_knowledge',
  queryText: string,
  modalities: ('text' | 'image' | 'audio' | 'video')[],
  complexityScore: number  // 0.0 to 1.0
}
```

**Response Schema:**
```typescript
{
  provider: 'groq' | 'google' | 'openrouter',
  modelName: string,
  humanReadableName: string,
  score: number,
  rateLimitHeadroom: number,
  estimatedLatency: 'low' | 'medium' | 'high',
  intelligenceIndex: number,
  selectionReason: string
}
```

**Error Response:**
```typescript
{
  error: string,
  code: 'NO_MODELS_AVAILABLE' | 'DATABASE_ERROR' | 'INVALID_REQUEST',
  details?: object
}
```

---

## Testing Strategy

### Unit Tests
- `modelSelector.test.js` - Selection algorithm logic
- `intelligenceIndex.test.js` - API integration mocking
- `rateLimitTracker.test.js` - Counter logic

### Integration Tests
- Supabase query functionality
- Cache behavior
- End-to-end selection flow

### Coverage Requirements
- Branches: 80%
- Functions: 80%
- Lines: 80%
- Statements: 80%

---

## Known Constraints & Trade-offs

**Rate Limit Tracking:**
- ⚠️ In-memory counters reset on service restart
- Trade-off: Simplicity vs persistence
- Consider Redis for production if critical

**Caching:**
- ⚠️ 30-minute cache may serve stale data
- Trade-off: Performance vs freshness
- Background refresh minimizes staleness

**Intelligence Index:**
- ⚠️ External API dependency
- Trade-off: Performance data vs latency/reliability
- Graceful degradation if API unavailable

**Complexity Scoring:**
- ⚠️ Must be calculated by client (askme_v2)
- Trade-off: Intelligence vs coupling
- Consider query length, keywords as heuristics

---

## Debugging Guide

### Common Issues

**Selection returns empty:**
```bash
# Check Supabase connection
curl https://your-project.supabase.co/rest/v1/ai_models_main \
  -H "apikey: your-key"

# Verify modality filters
# Review logs for filter criteria
```

**Slow response times:**
```bash
# Check cache status
# Verify Supabase query performance
# Review network latency

# Enable debug logging
LOG_LEVEL=debug npm run dev
```

**Rate limit tracker incorrect:**
```bash
# Verify counter reset logic
# Check time window calculations
# Review provider rate limit values in constants.js
```

### Logging

```javascript
// Use structured logging
logger.info('Model selected', {
  provider,
  modelName,
  score,
  headroom,
  duration: Date.now() - startTime
});
```

---

## Integration with askme_v2

### Modified Files

**askme-backend/src/routing/router.js:**
```javascript
// Before
const provider = selectPrimaryProvider(category);

// After
const selection = await selectModel({
  queryType: category,
  queryText: query,
  modalities: ['text'],
  complexityScore: calculateComplexity(query)
});
```

**askme-backend/src/failover/failover.js:**
```javascript
// Before
const model = MODELS[provider];

// After
const model = selection.modelName;
```

### New Utility Function

**askme-backend/src/utils/modelSelectorClient.js:**
```javascript
export async function selectModel(criteria) {
  const response = await fetch('http://localhost:3001/select-model', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(criteria)
  });
  return response.json();
}
```

---

## References

**External Documentation:**
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Jest Testing](https://jestjs.io/docs/getting-started)
- [Artificial Analysis API](https://artificialanalysis.ai/) (Intelligence Index)

**Internal Documentation:**
- `00_project/02_project_charter.md` - Project goals and metrics
- `03_architecture/01_system_architecture.md` - Detailed architecture
- `05_database/01_ai_models_main_schema.md` - Database schema
- `06_testing/01_testing_strategy.md` - Testing approach

**Related Projects:**
- `ai-models-discoverer_v3/` - Populates ai_models_main table
- `askme_v2/` - Consumer of selector service

---

## Development Workflow

1. **Check checklist:** Review `00_project/04_dev_checklist.md`
2. **Write test:** Create test in `__tests__/`
3. **Implement:** Write code in `src/`
4. **Run tests:** `npm test`
5. **Update docs:** Update relevant documentation
6. **Mark complete:** Check off task in checklist

---

## Naming Conventions

- **Files:** camelCase.js (utils) or PascalCase.js (classes)
- **Functions:** camelCase
- **Constants:** SCREAMING_SNAKE_CASE
- **Classes:** PascalCase
- **Tests:** `*.test.js` in `__tests__/` folders
