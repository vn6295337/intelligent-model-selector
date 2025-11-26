# Testing Strategy

**Last Updated:** 2025-11-24
**Purpose:** Testing approach and guidelines

---

## Coverage Requirements

**Minimum Coverage: 80%**
- Branch coverage: 80%
- Function coverage: 80%
- Line coverage: 80%
- Statement coverage: 80%

---

## Testing Pyramid

```
        ┌─────────────┐
        │   E2E/API   │  ~10% (Integration)
        │   Tests     │
        └─────────────┘
       ┌───────────────┐
       │  Integration  │   ~30% (Component Integration)
       │    Tests      │
       └───────────────┘
      ┌─────────────────┐
      │   Unit Tests    │    ~60% (Individual Functions)
      └─────────────────┘
```

---

## Unit Testing

### Files to Test

**src/services/modelSelector.js:**
```javascript
describe('modelSelector', () => {
  describe('filterByModalities', () => {
    it('should filter models by required input modalities')
    it('should handle missing modality fields gracefully')
  })

  describe('calculateScores', () => {
    it('should calculate scores with all factors')
    it('should handle missing Intelligence Index gracefully')
    it('should apply correct weights')
  })

  describe('matchComplexityToHeadroom', () => {
    it('should filter high complexity queries to high headroom')
    it('should allow low complexity queries any headroom')
  })

  describe('selectBestModel', () => {
    it('should return top-scored model')
    it('should return null if no models available')
  })
})
```

**src/services/cacheManager.js:**
```javascript
describe('cacheManager', () => {
  it('should store and retrieve data')
  it('should expire data after TTL')
  it('should trigger background refresh on expiration')
  it('should invalidate cache manually')
})
```

**src/services/intelligenceIndex.js:**
```javascript
describe('intelligenceIndex', () => {
  it('should fetch scores from API')
  it('should cache scores with 7-day TTL')
  it('should provide fallback scores when API unavailable')
  it('should calculate fallback from model size')
})
```

**src/services/rateLimitTracker.js:**
```javascript
describe('rateLimitTracker', () => {
  it('should increment usage counter')
  it('should calculate headroom correctly')
  it('should reset counters after window expires')
  it('should return all provider headroom')
})
```

**src/utils/supabase.js:**
```javascript
describe('supabase', () => {
  it('should fetch models from working_version')
  it('should perform 3-table JOIN')
  it('should filter by provider')
  it('should handle database errors gracefully')
})
```

---

## Integration Testing

### Test Scenarios

**Selection Flow:**
```javascript
describe('Model Selection Flow', () => {
  it('should select model from cached data')
  it('should fetch from DB when cache expired')
  it('should apply complexity-headroom matching')
})
```

**Cache Behavior:**
```javascript
describe('Cache Refresh', () => {
  it('should return stale data on expiration')
  it('should trigger background refresh')
  it('should handle refresh failures gracefully')
})
```

**Rate Limit Tracking:**
```javascript
describe('Rate Limit Integration', () => {
  it('should track usage across multiple selections')
  it('should prevent selection when headroom too low')
  it('should reset counters after window')
})
```

---

## API Testing

### Endpoints

**POST /select-model:**
```javascript
describe('POST /select-model', () => {
  it('should return 200 with valid request')
  it('should return 400 with missing fields')
  it('should return 500 when no models available')
})
```

**GET /best-model:**
```javascript
describe('GET /best-model', () => {
  it('should return best model overall')
  it('should filter by provider when specified')
  it('should return 404 when no models have Intelligence Index')
})
```

**GET /health:**
```javascript
describe('GET /health', () => {
  it('should return 200 with health status')
})
```

**POST /cache/refresh:**
```javascript
describe('POST /cache/refresh', () => {
  it('should invalidate and refresh cache')
})
```

---

## Mocking Strategy

### Supabase

```javascript
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: mockModels,
          error: null
        }))
      }))
    }))
  }))
}))
```

### Artificial Analysis API

```javascript
jest.mock('node-fetch', () => jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockIntelligenceScores)
  })
))
```

### Time-Dependent Tests

```javascript
jest.useFakeTimers()

it('should expire cache after TTL', () => {
  const cache = new CacheManager()
  cache.set('key', 'value', 1000)

  jest.advanceTimersByTime(1001)

  expect(cache.isExpired('key')).toBe(true)
})
```

---

## Test Data

### Sample Models

```javascript
const mockModels = [
  {
    inference_provider: 'groq',
    model_provider: 'Meta',
    human_readable_name: 'GPT OSS 20B',
    input_modalities: 'Text',
    output_modalities: 'Text',
    license_name: 'Apache-2.0',
    rate_limits: '30 requests per minute',
    aa_performance_metrics: {
      intelligence_index: 52.4,
      coding_index: 48.2,
      math_index: 45.1
    }
  }
]
```

---

## Running Tests

```bash
npm test              # All tests with coverage
npm run test:watch    # Watch mode for TDD
npm test -- --coverage    # Coverage report
npm test -- modelSelector.test.js    # Specific file
```

Coverage report generated in `coverage/` directory.

---

## Test Checklist

Before marking a feature complete:
- [ ] Unit tests written (80%+ coverage)
- [ ] Integration tests for critical paths
- [ ] API endpoint tests
- [ ] Error handling tested
- [ ] Edge cases covered
- [ ] Mocks properly isolated
- [ ] Tests pass consistently
- [ ] Coverage report reviewed

---

**Document Owner:** Development Team
