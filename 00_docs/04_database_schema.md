# Database Schema

**Last Updated:** 2025-11-24
**Purpose:** Database schema and query patterns

---

## 4-Table Architecture

### Overview

```
public.working_version ──┬──> ims.10_model_aa_mapping ──> ims.20_aa_performance_metrics
                         │
                         └──> ims.30_rate_limits
                              ↓
                         API Response (JSON)
```

**Schema:** `ims` (intelligent model selector)
**Tables:** 3 tables in `ims` schema + 1 in `public`
**Output:** JSON response via HTTP (not a table)

---

## Table Schemas

### 1. working_version

**Purpose:** Authoritative source of all discovered AI models (pipeline-managed)
**Link:** None (source table)
**Source:** Populated by ai-models-discoverer_v3 pipeline (daily updates)
**Access:** Read-only (selector service never modifies)

| Column | Type | Description |
|--------|------|-------------|
| id | integer | Primary key |
| inference_provider | text | groq, google, openrouter |
| model_provider | text | Meta, Google, DeepSeek, etc. |
| human_readable_name | text | Display name (used for mapping lookup) |
| model_provider_country | text | Provider company country |
| official_url | text | Official model/provider URL |
| input_modalities | text | Comma-separated modalities |
| output_modalities | text | Comma-separated modalities |
| license_name | text | Standardized license |
| rate_limits | text | API rate limit information (raw text) |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

### 2. ims.10_model_aa_mapping

**Purpose:** Maps model names to Artificial Analysis API slugs
**Link:** `human_readable_name` column stores the same value as working_version.`human_readable_name` (used to match records); `aa_slug` column stores the same value as ims.20_aa_performance_metrics.`aa_slug` (used to match records)
**Source:** Managed by selector service
**Coverage:** 35/71 models (49%)

| Column | Type | Description |
|--------|------|-------------|
| id | integer | Primary key |
| human_readable_name | text | Matches working_version.human_readable_name |
| aa_slug | text | Artificial Analysis API model slug |
| inference_provider | text | groq, google, openrouter |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

**Indexes:**
- `idx_model_aa_mapping_human_readable_name` on `human_readable_name`
- `idx_model_aa_mapping_slug` on `aa_slug`

**RLS Policies:**
- Public read access (SELECT)
- Anon insert for setup (INSERT)

### 3. ims.20_aa_performance_metrics

**Purpose:** Stores Intelligence Index and performance benchmarks
**Link:** `aa_slug` column matches the value from ims.10_model_aa_mapping.`aa_slug` (used to match records)
**Source:** Cached from Artificial Analysis API
**Coverage:** 337 models

| Column | Type | Description |
|--------|------|-------------|
| aa_slug | text | Primary key (AA API model slug) |
| name | text | Model name from AA API |
| intelligence_index | float | Overall performance score (0-100) |
| coding_index | float | Coding performance score |
| math_index | float | Math performance score |
| updated_at | timestamp | Last cache update |

### 4. ims.30_rate_limits

**Purpose:** Normalized rate limit data (rpm, rpd, tpm, tpd) for tracking
**Link:** `human_readable_name` column stores the same value as working_version.`human_readable_name` (used to match records)
**Source:** Managed by selector service, parsed from working_version.rate_limits
**Coverage:** 56 models (text-generation only)

| Column | Type | Description |
|--------|------|-------------|
| id | integer | Primary key |
| human_readable_name | text | Matches working_version.human_readable_name |
| inference_provider | text | groq, google, openrouter |
| rpm | integer | Requests per minute |
| rpd | integer | Requests per day |
| tpm | bigint | Tokens per minute |
| tpd | bigint | Tokens per day |
| raw_string | text | Original rate_limits text (for debugging) |
| parseable | boolean | Whether format was successfully parsed |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

**Indexes:**
- `idx_rate_limits_human_readable_name` on `human_readable_name`
- `idx_rate_limits_provider` on `inference_provider`
- `idx_rate_limits_rpm` on `rpm`

**RLS Policies:**
- Public read access (SELECT)
- Anon insert/update for setup (INSERT, UPDATE)

### 5. API Response (Output)

**Format:** JSON over HTTP
**Endpoint:** `POST /select-model`
**Consumer:** askme_v2 backend
**Purpose:** Selected model with scoring details

| Field | Type | Description |
|-------|------|-------------|
| provider | string | groq, google, openrouter |
| modelName | string | Model slug for API calls |
| humanReadableName | string | Display name |
| score | float | Overall selection score (0-1) |
| rateLimitHeadroom | float | Available capacity (0-1) |
| intelligenceIndex | float | Performance score |
| estimatedLatency | string | low, medium, high |
| selectionDuration | integer | Selection time in ms |

---

## Query Patterns

### Fetch Models with All Data (4-Table JOIN)

**Application-Level 4-Table JOIN:**

```javascript
// Step 1: Fetch working_version models
const {data: models} = await supabase
  .from('working_version')
  .select('*')
  .order('updated_at', {ascending: false});

// Step 2: Fetch ims.10_model_aa_mapping
const {data: mappings} = await supabase
  .schema('ims')
  .from('10_model_aa_mapping')
  .select('human_readable_name, aa_slug');

// Step 3: Fetch ims.20_aa_performance_metrics
const {data: metrics} = await supabase
  .schema('ims')
  .from('20_aa_performance_metrics')
  .select('aa_slug, intelligence_index, coding_index, math_index, name');

// Step 4: Fetch ims.30_rate_limits
const {data: rateLimits} = await supabase
  .schema('ims')
  .from('30_rate_limits')
  .select('human_readable_name, rpm, rpd, tpm, tpd, parseable');

// Step 5: JOIN in JavaScript
const mappingMap = Object.fromEntries(
  mappings.map(m => [m.human_readable_name, m.aa_slug])
);

const metricsMap = Object.fromEntries(
  metrics.map(m => [m.aa_slug, m])
);

const rateLimitsMap = Object.fromEntries(
  rateLimits.map(r => [r.human_readable_name, r])
);

const enrichedModels = models.map(model => ({
  ...model,
  aa_performance_metrics: metricsMap[mappingMap[model.human_readable_name]],
  rate_limits_normalized: rateLimitsMap[model.human_readable_name]
}));
```

### Filter by Provider

```javascript
const {data} = await supabase
  .from('working_version')
  .select('*')
  .eq('inference_provider', 'groq');
```

### Filter by Modalities

```javascript
const {data} = await supabase
  .from('working_version')
  .select('*')
  .ilike('input_modalities', '%Text%')
  .ilike('output_modalities', '%Text%');
```

### Get Best Model by Intelligence Index

```javascript
// Application-level filtering and sorting
const enrichedModels = await fetchLatestModels(); // 4-table JOIN

const validModels = enrichedModels
  .filter(m => m.aa_performance_metrics?.intelligence_index != null)
  .sort((a, b) =>
    b.aa_performance_metrics.intelligence_index -
    a.aa_performance_metrics.intelligence_index
  );

const bestModel = validModels[0];
```

---

## Data Examples

### 1. working_version Entry

```json
{
  "id": 123,
  "inference_provider": "groq",
  "model_provider": "Meta",
  "human_readable_name": "GPT OSS 20B",
  "model_provider_country": "United States",
  "input_modalities": "Text",
  "output_modalities": "Text",
  "license_name": "Apache-2.0",
  "rate_limits": "RPM: 30, TPM: 15K, RPD: 14.4K, TPD: 500K",
  "updated_at": "2025-11-24T..."
}
```

### 2. model_aa_mapping Entry

```json
{
  "id": 1,
  "human_readable_name": "GPT OSS 20B",
  "aa_slug": "gpt-oss-20b",
  "inference_provider": "groq",
  "created_at": "2025-11-24T...",
  "updated_at": "2025-11-24T..."
}
```

### 3. aa_performance_metrics Entry

```json
{
  "aa_slug": "gpt-oss-20b",
  "name": "GPT OSS 20B",
  "intelligence_index": 52.4,
  "coding_index": 48.2,
  "math_index": 45.1,
  "updated_at": "2025-11-24T..."
}
```

### 4. rate_limits Entry

```json
{
  "id": 1,
  "human_readable_name": "GPT OSS 20B",
  "inference_provider": "groq",
  "rpm": 30,
  "rpd": 14400,
  "tpm": 15000,
  "tpd": 500000,
  "raw_string": "RPM: 30, TPM: 15K, RPD: 14.4K, TPD: 500K",
  "parseable": true,
  "created_at": "2025-11-24T...",
  "updated_at": "2025-11-24T..."
}
```

### 5. API Response Example

```json
{
  "provider": "groq",
  "modelName": "llama-3.1-70b-versatile",
  "humanReadableName": "Llama 3.1 70B Versatile",
  "score": 0.87,
  "rateLimitHeadroom": 0.65,
  "intelligenceIndex": 52.4,
  "estimatedLatency": "low",
  "selectionDuration": 6
}
```

---

## Maintenance

### Adding New Models

When ai-models-discoverer_v3 adds new models to working_version:

1. **Automatic:** working_version updated by pipeline
2. **Manual:** Run mapping scripts to add new mappings:
   ```bash
   node populate_model_aa_mapping.js
   node populate_rate_limits.js
   ```
3. **Automatic:** Service picks up new models on next cache refresh (24 hours)

### Updating Mappings

To fix or update model_aa_mapping entries:

1. Update mapping script with corrections
2. Re-run script (uses upsert, safe to re-run)
3. Verify with query:
   ```sql
   SELECT * FROM model_aa_mapping WHERE human_readable_name = 'Model Name';
   ```

### Updating Rate Limits

To refresh rate_limits table:

1. Re-run populate script (safe to re-run, uses upsert):
   ```bash
   node populate_rate_limits.js
   ```
2. Verify with query:
   ```sql
   SELECT * FROM rate_limits WHERE human_readable_name = 'Model Name';
   ```

### Coverage Stats

Current coverage (as of 2025-11-24):
- working_version: 71 models (62 text-generation)
- model_aa_mapping: 35 mappings (49% of all models)
- rate_limits: 56 models (90% of text-generation models)
- Models without AA mapping: 30 (won't appear in /best-model results)
- Duplicates skipped: 6

---

## RLS Policies

### working_version

```sql
CREATE POLICY "Allow public read access"
ON working_version FOR SELECT TO public
USING (true);
```

### model_aa_mapping

```sql
CREATE POLICY "Allow public read access"
ON model_aa_mapping FOR SELECT TO public
USING (true);

CREATE POLICY "Allow anon insert for setup"
ON model_aa_mapping FOR INSERT TO anon
WITH CHECK (true);
```

### aa_performance_metrics

```sql
CREATE POLICY "Allow public read access"
ON aa_performance_metrics FOR SELECT TO public
USING (true);
```

### rate_limits

```sql
CREATE POLICY "Allow public read access"
ON rate_limits FOR SELECT TO public
USING (true);

CREATE POLICY "Allow anon insert for setup"
ON rate_limits FOR INSERT TO anon
WITH CHECK (true);

CREATE POLICY "Allow anon update for maintenance"
ON rate_limits FOR UPDATE TO anon
USING (true) WITH CHECK (true);
```

---

## Notes

**Update Frequency:**
- working_version: Daily (via pipeline)
- model_aa_mapping: As needed (manual script)
- aa_performance_metrics: Weekly (from AA API)
- rate_limits: As needed (manual script, parsed from working_version)

**Missing Fields:**
- pricing (all models are free)
- context_window (not captured)

**Modality Format:**
- Comma-separated strings
- Use LIKE/ILIKE for matching
- Example: "Text, Image, Audio"

**Why 4-Table Architecture:**
- working_version stays clean (pipeline-managed)
- model_aa_mapping provides AA API glue layer
- rate_limits provides normalized rate limit data
- No database foreign keys needed (application-level JOINs)
- Clear separation of concerns

**Rate Limit Parsing:**
- 3 text formats parsed (Google, OpenRouter, Groq)
- 100% parse success rate for text-generation models
- Token estimation: `Math.ceil(queryLength * 0.75)` for TPM/TPD tracking

---

**Document Owner:** Development Team
