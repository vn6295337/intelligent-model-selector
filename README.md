# Intelligent Model Selector

**Status:** ✅ 98% Complete - Fully Integrated with askme_v2
**Version:** 1.0.0

Dynamic, intelligent model selection service that selects optimal AI models from Supabase based on query characteristics, performance metrics, rate limits, and geographic considerations.

---

## Quick Start

```bash
cd selector-service
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
npm run dev
```

**Endpoints:**
- `http://localhost:3001/health` - Health check
- `http://localhost:3001/best-model` - Get best model by Intelligence Index
- `http://localhost:3001/select-model` - Full selection algorithm (POST)

**Full setup guide:** [00_docs/02_getting_started.md](00_docs/02_getting_started.md)

---

## System Architecture

```
┌─────────────────┐
│   askme_v2      │
│   Backend       │
└────────┬────────┘
         │ POST /select-model
         ↓
┌─────────────────────────────┐
│ Intelligent Model Selector  │
│  - Multi-factor scoring     │
│  - Rate limit tracking      │
│  - Intelligence Index       │
└────────┬────────────────────┘
         │
         ├─→ Supabase (3 tables)
         │   - working_version (71 models)
         │   - model_aa_mapping (35 mappings)
         │   - aa_performance_metrics
         │
         └─→ Artificial Analysis API
             - Intelligence Index scores
```

**Detailed architecture:** [00_docs/03_architecture.md](00_docs/03_architecture.md)

---

## Key Features

### Intelligent Selection
- **Multi-factor scoring:** Intelligence Index (35%), Latency (25%), Rate Limit Headroom (25%), Geography (10%), License (5%)
- **Complexity matching:** Routes complex queries to providers with high headroom
- **Performance optimized:** 5-6ms selection latency with caching

### Data-Driven
- **3-table architecture:** working_version (pipeline-managed) + model_aa_mapping + aa_performance_metrics
- **Daily updates:** Automatic refresh from ai-models-discoverer_v3 pipeline
- **24-hour cache:** Matches database update frequency

### Rate Limit Intelligence
- **Smart distribution:** Simple queries → low headroom, complex queries → high headroom
- **Provider tracking:** In-memory counters for groq (30/min), google (60/min), openrouter (200/min)
- **Load balancing:** Prevents single provider overload

---

## Project Goals

- ✅ Real-time model selection from daily-updated database (71 models)
- ✅ Multi-factor scoring algorithm (5 weighted factors)
- ✅ Smart rate limit distribution across providers
- ✅ Modality-aware routing (text, image, audio, video)
- ✅ Geographic compliance filtering
- ✅ Sub-100ms selection latency (achieved 5-6ms)
- ✅ Seamless integration with askme_v2 backend

**Progress:** 98% complete (109/111 tasks)

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Node.js 18+ LTS | ES Modules, native watch mode |
| Framework | Express 4.18+ | Lightweight HTTP API |
| Database | Supabase (PostgreSQL) | 3-table architecture |
| Caching | Node.js in-memory | 24-hour TTL, background refresh |
| Testing | Jest 29 | 69 tests, ~80% coverage |
| External API | Artificial Analysis | Intelligence Index data |

---

## API Endpoints

### GET /best-model

Get best model by Intelligence Index (optionally filtered by provider).

```bash
curl "http://localhost:3001/best-model?provider=groq"
```

**Response:**
```json
{
  "model": {
    "provider": "groq",
    "modelSlug": "gpt-oss-20b",
    "humanReadableName": "GPT OSS 20B",
    "intelligenceIndex": 52.4
  }
}
```

### POST /select-model

Full selection algorithm with multi-factor scoring.

```bash
curl -X POST http://localhost:3001/select-model \
  -H "Content-Type: application/json" \
  -d '{
    "queryType": "general_knowledge",
    "queryText": "What is the capital of France?",
    "modalities": ["text"],
    "complexityScore": 0.3
  }'
```

**Response:**
```json
{
  "provider": "groq",
  "modelName": "gpt-oss-20b",
  "score": 0.87,
  "rateLimitHeadroom": 1.0,
  "intelligenceIndex": 52.4,
  "selectionDuration": 5
}
```

---

## Integration with askme_v2

The selector service integrates at the routing layer:

**Before (hardcoded):**
```javascript
const model = MODELS.groq; // 'llama-3.1-8b-instant'
```

**After (dynamic):**
```javascript
const selection = await selectModel({
  queryType: category,
  queryText: query,
  modalities: ['text'],
  complexityScore: calculateComplexity(query)
});
const {provider, modelName} = selection;
```

**Integration points:**
- `askme-backend/src/routing/router.js` - Primary selection
- `askme-backend/src/failover/failover.js` - Uses dynamic model names
- `askme-backend/src/utils/modelSelectorClient.js` - HTTP client

---

## Documentation

All documentation consolidated in **`00_docs/`** directory:

1. **[01_project_overview.md](00_docs/01_project_overview.md)** - Mission, goals, technical decisions
2. **[02_getting_started.md](00_docs/02_getting_started.md)** - Installation and setup
3. **[03_architecture.md](00_docs/03_architecture.md)** - System design and algorithms
4. **[04_database_schema.md](00_docs/04_database_schema.md)** - 3-table architecture
5. **[05_testing_strategy.md](00_docs/05_testing_strategy.md)** - Testing approach
6. **[06_configuration.md](00_docs/06_configuration.md)** - Environment variables and config
7. **[07_implementation_status.md](00_docs/07_implementation_status.md)** - Progress tracking
8. **[08_migration_history.md](00_docs/08_migration_history.md)** - Migration to working_version

**Navigation:** See [INDEX.md](INDEX.md) for complete documentation map

---

## Development

```bash
npm run dev          # Start with hot reload
npm start            # Production mode
npm test             # Run tests with coverage
npm run test:watch   # Watch mode for TDD
```

### Environment Variables

**Required:**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase anon key

**Optional:**
- `ARTIFICIAL_ANALYSIS_API_KEY` - Intelligence Index API key
- `PORT` - Service port (default: 3001)
- `NODE_ENV` - Environment (default: development)
- `LOG_LEVEL` - Logging verbosity (default: info)

---

## Current Status

**Deployment:**
- Selector service running on port 3001 ✅
- askme_v2 backend integrated on port 3000 ✅
- 71 models cached from Supabase ✅
- 35 models mapped to Intelligence Index (49% coverage) ✅

**Performance:**
- Selection latency: 5-6ms (20x better than 100ms target) ⚡
- Cache hit rate: > 95% ✅
- Rate limit tracking: Active ✅

**Testing:**
- 69 unit tests across 4 suites ✅
- Coverage: ~80% ✅
- Integration: End-to-end tested ✅

**Remaining Work:**
- Deployment configuration (render.yaml) ⏳
- OpenAPI/Swagger documentation ⏳

---

## License

MIT License - see [LICENSE](LICENSE) file for details

---

**For detailed information, see [00_docs/](00_docs/) directory**
**AI Assistant Guide:** [CLAUDE.md](CLAUDE.md)
