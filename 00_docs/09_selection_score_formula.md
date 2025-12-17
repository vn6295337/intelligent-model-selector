# Selection Score Formula

## Formula

```
score = (
  intelligenceIndex × 0.35 +
  latencyScore × 0.25 +
  headroomScore × 0.25 +
  geographyScore × 0.10 +
  licenseScore × 0.05
)
```

## Variables

### intelligenceIndex
- **Range:** 0.0 to 1.0
- **Source:** Artificial Analysis API
- **Weight:** 35%

### latencyScore
- **Range:** 0.6 to 1.0
- **Values:**
  - groq: 1.0
  - google: 0.8
  - openrouter: 0.6
- **Weight:** 25%

### headroomScore
- **Formula:** min(rpmHeadroom, rpdHeadroom, tpmHeadroom, tpdHeadroom)
- **Range:** 0.0 to 1.0
- **Source:** In-memory rate limit tracker (per-model, 4-metric tracking)
- **Weight:** 25%

#### Per-Metric Headroom Calculation
Each metric headroom = (limit - usage) / limit

**RPM (Requests Per Minute):**
- : requests_per_minute from ims.30_rate_limits table
- usage: count of requests in last 60 seconds
- window: 60-second rolling window

**RPD (Requests Per Day):**
- limit: requests_per_day from ims.30_rate_limits table
- usage: count of requests in last 24 hours
- window: 24-hour rolling window

**TPM (Tokens Per Minute):**
- limit: tokens_per_minute from ims.30_rate_limits table
- usage: sum of estimated tokens in last 60 seconds
- window: 60-second rolling window
- token estimation: Math.ceil(queryText.length × 0.75)

**TPD (Tokens Per Day):**
- limit: tokens_per_day from ims.30_rate_limits table
- usage: sum of estimated tokens in last 24 hours
- window: 24-hour rolling window
- token estimation: Math.ceil(queryText.length × 0.75)

#### Overall Headroom
Overall headroom = min(rpm, rpd, tpm, tpd) — most restrictive metric determines availability

#### Example
```
Model: Llama 3.1 70B Versatile
Limits: RPM=30, RPD=14400, TPM=15000, TPD=500000

Tracked Events (in-memory arrays):
requests = [
  {timestamp: now - 45s},
  {timestamp: now - 30s},
  {timestamp: now - 20s},
  {timestamp: now - 10s},
  {timestamp: now - 5s},
  {timestamp: now - 3h},
  {timestamp: now - 8h},
  ... (1995 more entries within 24h)
]

tokens = [
  {timestamp: now - 45s, count: 800},
  {timestamp: now - 30s, count: 600},
  {timestamp: now - 20s, count: 500},
  {timestamp: now - 10s, count: 700},
  {timestamp: now - 5s, count: 400},
  {timestamp: now - 3h, count: 1200},
  {timestamp: now - 8h, count: 950},
  ... (1995 more entries within 24h)
]

Usage Calculations:
- Requests in last 60s: count where (now - timestamp) ≤ 60s = 5
- Requests in last 24h: count where (now - timestamp) ≤ 86400s = 2000
- Tokens in last 60s: sum of count where (now - timestamp) ≤ 60s = 3000
- Tokens in last 24h: sum of count where (now - timestamp) ≤ 86400s = 150000

Token Estimation Per Request:
- Query: "Explain quantum computing in detail"
- Length: 37 characters
- Estimated tokens: Math.ceil(37 × 0.75) = 28 tokens

Headroom Calculations:
- rpmHeadroom = (30 - 5) / 30 = 0.833
- rpdHeadroom = (14400 - 2000) / 14400 = 0.861
- tpmHeadroom = (15000 - 3000) / 15000 = 0.800
- tpdHeadroom = (500000 - 150000) / 500000 = 0.700

headroomScore = min(0.833, 0.861, 0.800, 0.700) = 0.700
```

### geographyScore
- **Range:** 0.0 to 1.0
- **Default:** 1.0 (all providers)
- **Weight:** 10%

### licenseScore
- **Range:** 0.8 to 1.0
- **Values:**
  - Open-source: 1.0
  - Proprietary: 0.8
- **Weight:** 5%
