# System Architecture

**Last Updated:** 2025-11-24
**Purpose:** System design, algorithms, and data flows

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Component Design](#component-design)
3. [Selection Algorithm](#selection-algorithm)
4. [Data Architecture](#data-architecture)
5. [Caching Strategy](#caching-strategy)
6. [Rate Limit Intelligence](#rate-limit-intelligence)
7. [Integration Points](#integration-points)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       askme_v2 Backend                       │
│  ┌────────────────────┐         ┌──────────────────────┐   │
│  │  Query Classifier  │────────→│  Model Selector      │   │
│  │  - Categorize      │         │  Client              │   │
│  │  - Calculate       │         │  - HTTP calls        │   │
│  │    complexity      │         │  - Error handling    │   │
│  └────────────────────┘         └──────────┬───────────┘   │
└─────────────────────────────────────────────┼───────────────┘
                                              │
                                              │ HTTP POST
                                              ↓
┌───────────────────────────────────────────────────────────────┐
│            Intelligent Model Selector Service                 │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Model Selector Service                   │   │
│  │  1. Fetch models from cache                          │   │
│  │  2. Perform 3-table JOIN in application              │   │
│  │  3. Filter by modalities                             │   │
│  │  4. Calculate multi-factor scores                    │   │
│  │  5. Match complexity to headroom                     │   │
│  │  6. Select top-ranked model                          │   │
│  └─────┬────────────────────────────────────────────────────┘│
│        │                                                      │
│    ┌───┴───┐      ┌──────────────┐      ┌────────────────┐ │
│    │ Cache │      │ Intelligence │      │ Rate Limit     │ │
│    │ 24hr  │      │ Index        │      │ Tracker        │ │
│    └───┬───┘      └──────┬───────┘      └────────┬───────┘ │
└────────┼──────────────────┼──────────────────────┼─────────┘
         │                  │                      │
         ↓                  ↓                      │
  ┌──────────────┐   ┌──────────────────┐         │
  │  Supabase    │   │  Artificial      │         │
  │  3 Tables:   │   │  Analysis API    │         │
  │  - working_  │   │  (Intelligence   │         │
  │    version   │   │   Index)         │         │
  │  - model_aa_ │   └──────────────────┘         │
  │    mapping   │                                 │
  │  - aa_perf.  │       (In-Memory) ←───────────┘
  └──────────────┘
```

---

## Component Design

### Model Selector (Core)

**File:** `src/services/modelSelector.js`

**Key Functions:**
```javascript
async selectModel({queryType, queryText, modalities, complexityScore})
filterByModalities(models, requiredModalities)
calculateScores(models, queryType, complexityScore, headroomData)
matchComplexityToHeadroom(models, complexityScore, headroomData)
selectBestModel(scoredModels)
```

### Cache Manager

**File:** `src/services/cacheManager.js`

**Data Structure:**
```javascript
cache = {
  models: {
    data: [],
    timestamp: Date.now(),
    ttl: 86400000  // 24 hours (matches daily DB updates)
  },
  intelligenceIndex: {
    data: {},
    timestamp: Date.now(),
    ttl: 604800000  // 7 days
  }
}
```

**Key Functions:**
```javascript
get(key)                    // Retrieve from cache
set(key, value, ttl)        // Store with TTL
isExpired(key)              // Check if expired
refresh(key, fetchFn)       // Background refresh
invalidate(key)             // Force refresh
```

### Intelligence Index

**File:** `src/services/intelligenceIndex.js`

**Responsibilities:**
- Fetch performance scores from Artificial Analysis API
- Cache scores (7-day TTL)
- Provide fallback scoring based on model size

**Fallback Scoring:**
```javascript
// Extract model size from name
const sizeToScore = {
  '70b': 0.9,
  '27b': 0.7,
  '8b': 0.5,
  '4b': 0.4,
  '1b': 0.3
}
```

### Rate Limit Tracker

**File:** `src/services/rateLimitTracker.js`

**Data Structure:**
```javascript
counters = {
  groq: {count: 0, limit: 30, window: 60000},
  google: {count: 0, limit: 60, window: 60000},
  openrouter: {count: 0, limit: 200, window: 60000}
}
```

**Key Functions:**
```javascript
incrementUsage(provider)
getHeadroom(provider)        // (limit - count) / limit
resetIfExpired(provider)
getAllHeadroom()
```

### Supabase Utility

**File:** `src/utils/supabase.js`

**Key Functions:**
```javascript
async fetchLatestModels()    // 3-table JOIN in application
```

**3-Table Lookup:**
```javascript
// Step 1: Fetch working_version models
// Step 2: Fetch model_aa_mapping (name → AA slug)
// Step 3: Fetch aa_performance_metrics (Intelligence Index)
// Step 4: JOIN in JavaScript using lookup maps
```

---

## Selection Algorithm

### Algorithm Overview

```
INPUT:
  - queryType: string
  - queryText: string
  - modalities: string[]
  - complexityScore: float (0.0-1.0)

OUTPUT:
  - provider, modelName, score, rateLimitHeadroom, intelligenceIndex

STEPS:
  1. Fetch models from cache
  2. Filter by modality requirements
  3. Calculate multi-factor scores
  4. Apply complexity-headroom matching
  5. Sort by score (descending)
  6. Return top-ranked model
```

### Scoring Formula

```javascript
score = (
  intelligenceIndex * 0.35 +
  latencyScore * 0.25 +
  headroomScore * 0.25 +
  geographyScore * 0.10 +
  licenseScore * 0.05
)
```

**Factor Definitions:**

1. **Intelligence Index (35%)** - From Artificial Analysis API (0.0-1.0)
2. **Latency Score (25%)** - groq: 1.0, google: 0.8, openrouter: 0.6
3. **Headroom Score (25%)** - (limit - count) / limit
4. **Geography Score (10%)** - Configurable preference (default: 1.0)
5. **License Score (5%)** - Open-source: 1.0, Proprietary: 0.8

### Complexity-Headroom Matching

**Thresholds:**
- **High complexity (> 0.7):** Requires 60%+ headroom
- **Medium complexity (0.4-0.7):** Requires 30%+ headroom
- **Low complexity (< 0.4):** Any headroom acceptable

```javascript
function matchComplexityToHeadroom(models, complexityScore, headroomData) {
  if (complexityScore > 0.7) {
    return models.filter(m => headroomData[m.inference_provider] > 0.6)
  } else if (complexityScore > 0.4) {
    return models.filter(m => headroomData[m.inference_provider] > 0.3)
  } else {
    return models
  }
}
```

---

## Data Architecture

### 3-Table Design

```
┌──────────────────────┐
│  working_version     │  (71 models)
│  ├─ inference_provider│
│  ├─ human_readable_name│
│  └─ (other metadata) │
└──────────┬───────────┘
           │
           ↓ (human_readable_name lookup)
┌──────────────────────┐
│  model_aa_mapping    │  (35 mappings)
│  ├─ model_name       │
│  └─ aa_slug          │
└──────────┬───────────┘
           │
           ↓ (aa_slug lookup)
┌──────────────────────┐
│ aa_performance_metrics│ (337 models)
│  ├─ slug             │
│  ├─ intelligence_index│
│  ├─ coding_index     │
│  └─ math_index       │
└──────────────────────┘
```

**Key Principles:**
- **working_version:** Read-only, managed by ai-models-discoverer_v3 pipeline
- **model_aa_mapping:** Glue layer, managed by selector service
- **aa_performance_metrics:** Intelligence Index cache
- **Application-level JOIN:** No database foreign keys, JOIN in code

**Data Flow:**
1. Pipeline updates working_version daily
2. Selector service reads working_version
3. Looks up AA slug in model_aa_mapping
4. Fetches Intelligence Index from aa_performance_metrics
5. Returns enriched model data

---

## Caching Strategy

### Cache Layers

**Layer 1: Models Cache (24-hour TTL)**
```javascript
{
  key: 'ai_models_main',
  data: [...],  // 71 models with 3-table JOIN
  timestamp: Date.now(),
  ttl: 86400000  // 24 hours (matches daily DB updates)
}
```

**Layer 2: Intelligence Index Cache (7-day TTL)**
```javascript
{
  key: 'intelligence_index',
  data: {
    'llama-3.3-70b': 0.89,
    'gemini-2.0-flash': 0.78
  },
  timestamp: Date.now(),
  ttl: 604800000  // 7 days
}
```

### Refresh Strategy

**Background Refresh:**
```javascript
if (isExpired(key)) {
  const staleData = get(key)              // Return stale data immediately
  refresh(key, fetchLatestModels)         // Trigger async refresh
  return staleData                        // No latency for user
}
```

**Benefits:**
- No cache-miss latency
- Always returns data
- Refresh happens asynchronously

**Manual Refresh:**
```http
POST /cache/refresh
```

---

## Rate Limit Intelligence

### Tracking Mechanism

**In-Memory Counters:**
```javascript
const rateLimits = {
  groq: {count: 15, limit: 30, window: 60000, lastReset: Date.now()},
  google: {count: 25, limit: 60, window: 60000},
  openrouter: {count: 100, limit: 200, window: 60000}
}
```

**Update Flow:**
1. Selection made → `incrementUsage(provider)`
2. Every 60 seconds → `resetIfExpired(provider)`
3. On query → `getHeadroom(provider)` for scoring

### Load Distribution

**Simple Queries (complexity < 0.4):**
- Can use providers with low headroom
- Optimizes resource utilization

**Complex Queries (complexity > 0.7):**
- Requires providers with high headroom
- Ensures capacity for intensive tasks

**Example:**
```
Current state:
  groq:       headroom = 0.9 (27/30 available)
  google:     headroom = 0.3 (18/60 available)
  openrouter: headroom = 0.6 (120/200 available)

Simple query (0.3): Can select any → likely google
Complex query (0.8): Filters out google → chooses groq/openrouter
```

---

## Integration Points

### askme_v2 Integration

**File:** `askme-backend/src/utils/modelSelectorClient.js`

```javascript
export async function selectModel(criteria) {
  try {
    const response = await fetch(SELECTOR_URL + '/select-model', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(criteria),
      timeout: 5000
    })
    return await response.json()
  } catch (error) {
    logger.error('Model selection failed', {error})
    return fallbackSelection(criteria.queryType)
  }
}
```

**Usage in router.js:**
```javascript
// Before: Hardcoded
const model = MODELS.groq

// After: Dynamic
const selection = await selectModel({
  queryType: category,
  queryText: query,
  modalities: ['text'],
  complexityScore: calculateComplexity(query)
})
const {provider, modelName} = selection
```

### Fallback Strategy

```javascript
function fallbackSelection(queryType) {
  const fallbackMap = {
    business_news: {provider: 'groq', modelName: 'llama-3.1-8b-instant'},
    financial_analysis: {provider: 'groq', modelName: 'llama-3.3-70b-versatile'},
    general_knowledge: {provider: 'google', modelName: 'gemini-2.0-flash'}
  }
  return fallbackMap[queryType] || fallbackMap.general_knowledge
}
```

---

## Performance

### Latency Targets

| Operation | Target | Achieved |
|-----------|--------|----------|
| Cached selection | < 100ms | 5-6ms ✅ |
| Uncached selection | < 500ms | ~50ms ✅ |
| Background refresh | N/A | Non-blocking |
| Rate limit lookup | < 10ms | < 1ms ✅ |

### Scalability

**Current (MVP):**
- Single instance
- In-memory cache and counters
- Suitable for moderate load (< 100 req/s)

**Future (Production):**
- Redis for shared cache
- Redis for persistent rate limit counters
- Load balancer for horizontal scaling

---

**Document Owner:** Development Team
