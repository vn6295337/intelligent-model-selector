# Configuration Reference

**Last Updated:** 2025-11-24
**Purpose:** Environment variables and configuration options

---

## Environment Variables

### Required

**SUPABASE_URL**
- Supabase project URL
- Format: `https://your-project.supabase.co`
- Example: `https://atilxlecbaqcksnrgzav.supabase.co`

**SUPABASE_KEY**
- Supabase anon/public API key
- Note: Use anon key, NOT service_role key
- Format: Long JWT string

### Optional

**ARTIFICIAL_ANALYSIS_API_KEY**
- API key for Intelligence Index data
- Fallback: Heuristic scoring if not provided

**PORT**
- HTTP server port
- Default: `3001`

**NODE_ENV**
- Node environment: `development` | `production` | `test`
- Default: `development`

**LOG_LEVEL**
- Logging verbosity: `error` | `warn` | `info` | `debug`
- Default: `info`
- Development: `debug`
- Production: `warn`

---

## Configuration Constants

### Selection Weights

**File:** `src/config/constants.js`

```javascript
export const SELECTION_WEIGHTS = {
  intelligenceIndex: 0.35,
  latency: 0.25,
  rateLimitHeadroom: 0.25,
  geography: 0.10,
  license: 0.05
}
```

**Note:** Weights must sum to 1.0

### Latency Scores

```javascript
export const LATENCY_SCORES = {
  groq: 1.0,      // Fastest
  google: 0.8,    // Fast
  openrouter: 0.6 // Moderate
}
```

### Complexity Thresholds

```javascript
export const COMPLEXITY_THRESHOLDS = {
  high: 0.7,      // Requires headroom > 0.6
  medium: 0.4     // Requires headroom > 0.3
}
```

### Rate Limit Defaults

```javascript
export const RATE_LIMIT_DEFAULTS = {
  groq: {limit: 30, window: 60000},
  google: {limit: 60, window: 60000},
  openrouter: {limit: 200, window: 60000}
}
```

### Cache TTLs

```javascript
export const CACHE_TTLS = {
  models: 86400000,      // 24 hours (matches daily DB updates)
  intelligenceIndex: 604800000  // 7 days
}
```

---

## Runtime Configuration

### Modifying Selection Weights

1. Edit `src/config/constants.js`
2. Ensure weights sum to 1.0
3. Restart service
4. Test selection behavior

Example:
```javascript
// Prioritize latency over intelligence
export const SELECTION_WEIGHTS = {
  intelligenceIndex: 0.25,
  latency: 0.35,
  rateLimitHeadroom: 0.25,
  geography: 0.10,
  license: 0.05
}
```

### Adjusting Rate Limits

Update `RATE_LIMIT_DEFAULTS` to match actual provider limits:

```javascript
export const RATE_LIMIT_DEFAULTS = {
  groq: {limit: 50, window: 60000}  // Updated from 30
}
```

---

## Deployment Configuration

### Render

**render.yaml:**
```yaml
services:
  - type: web
    name: intelligent-model-selector
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3001
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_KEY
        sync: false
      - key: ARTIFICIAL_ANALYSIS_API_KEY
        sync: false
```

### Docker

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src ./src

EXPOSE 3001

CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  selector:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
      - PORT=3001
```

---

## Monitoring

### Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-24T...",
  "cache": {
    "modelsCount": 71,
    "lastRefresh": "2025-11-24T..."
  },
  "rateLimits": {
    "groq": {"headroom": 1.0},
    "google": {"headroom": 1.0},
    "openrouter": {"headroom": 1.0}
  }
}
```

### Logging Format

```javascript
{
  "timestamp": "2025-11-24T...",
  "level": "info",
  "message": "Model selected",
  "provider": "groq",
  "modelName": "gpt-oss-20b",
  "score": 0.89,
  "headroom": 0.85,
  "duration": 5
}
```

---

## Troubleshooting

### Configuration Issues

**Missing Environment Variables:**
```bash
env | grep SUPABASE
```

**Port Conflicts:**
```bash
PORT=3002 npm start
```

### Performance Tuning

**High Cache Miss Rate:**
- CACHE_TTL is 24 hours (matches DB update frequency)
- Check refresh logic
- Monitor working_version update frequency

**Slow Selection Times:**
- Verify Supabase query performance
- Check network latency
- Enable caching
- Review log level (debug adds overhead)

**Rate Limit Tracking Inaccurate:**
- Verify RATE_LIMIT_DEFAULTS match provider limits
- Check counter reset logic
- Consider Redis for persistent tracking

---

## Configuration Checklist

Before deployment:
- [ ] SUPABASE_URL configured
- [ ] SUPABASE_KEY configured (anon key)
- [ ] PORT available and accessible
- [ ] NODE_ENV set to production
- [ ] LOG_LEVEL set to warn or error
- [ ] Selection weights reviewed
- [ ] Rate limit defaults verified
- [ ] Health check responding

---

**Document Owner:** Development Team
