# Selector Service

Microservice for intelligent AI model selection from ai_models_main Supabase table.

---

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Run development server
npm run dev

# Run tests
npm test
```

---

## API Endpoints

### POST /select-model

Select optimal model based on query characteristics.

**Request:**
```json
{
  "queryType": "general_knowledge",
  "queryText": "What is the capital of France?",
  "modalities": ["text"],
  "complexityScore": 0.3
}
```

**Response:**
```json
{
  "provider": "groq",
  "modelName": "llama-3.1-8b-instant",
  "humanReadableName": "Llama 3.1 8B Instant",
  "score": 0.87,
  "rateLimitHeadroom": 0.95,
  "estimatedLatency": "low",
  "intelligenceIndex": 0.75,
  "selectionReason": "High rate limit headroom, low complexity query"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-19T12:00:00.000Z",
  "uptime": 3600.5
}
```

### GET /models

List all available models from cache.

**Response:**
```json
{
  "models": [...],
  "count": 75,
  "cached": true,
  "lastUpdate": "2025-11-19T12:00:00.000Z"
}
```

### POST /cache/refresh

Manually refresh cache.

**Response:**
```json
{
  "message": "Cache refreshed",
  "timestamp": "2025-11-19T12:00:00.000Z"
}
```

---

## Project Structure

```
src/
├── index.js                 # Express server entry point
├── config/
│   └── constants.js         # Configuration constants
├── services/
│   ├── modelSelector.js     # Core selection logic
│   ├── cacheManager.js      # Caching layer
│   ├── intelligenceIndex.js # Performance metrics API
│   └── rateLimitTracker.js  # Usage tracking
├── utils/
│   └── supabase.js          # Database queries
└── __tests__/
    ├── modelSelector.test.js
    ├── cacheManager.test.js
    └── ...
```

---

## Environment Variables

**Required:**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase anon key

**Optional:**
- `ARTIFICIAL_ANALYSIS_API_KEY` - Intelligence Index API key
- `PORT` - Server port (default: 3001)
- `CACHE_TTL` - Cache duration in ms (default: 1800000)
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)

---

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm test -- --coverage
```

**Coverage Target:** 80% (branches, functions, lines, statements)

---

## Development

```bash
# Start with hot reload
npm run dev

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

---

## Documentation

For comprehensive documentation, see parent directory:
- [Project Overview](../README.md)
- [Documentation Index](../INDEX.md)
- [System Architecture](../03_architecture/01_system_architecture.md)
- [Development Checklist](../00_project/04_dev_checklist.md)

---

## License

MIT License - see [LICENSE](../LICENSE) file for details.
