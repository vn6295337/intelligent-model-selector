# Migration History

**Last Updated:** 2025-11-24
**Status:** ✅ COMPLETE

---

## Overview

Successfully migrated intelligent-model-selector from using a custom `models` table to using the `working_version` table (output from ai-models-discoverer_v3) as the authoritative source for model metadata.

**Key Decision:** Create separate `model_aa_mapping` table to link models to Artificial Analysis API slugs, keeping `working_version` read-only (pipeline-managed).

---

## Final Architecture

```
┌──────────────────────────────────┐
│  ai-models-discoverer_v3 pipeline│
│  (runs daily)                    │
└───────────────┬──────────────────┘
                ↓
┌──────────────────────────────────┐
│  working_version (71 models)     │
│  - inference_provider            │
│  - human_readable_name           │
│  - (other metadata)              │
│  READ-ONLY (never modified)      │
└───────────────┬──────────────────┘
                ↓ human_readable_name lookup
┌──────────────────────────────────┐
│  model_aa_mapping (35 mappings)  │
│  - model_name                    │
│  - aa_slug                       │
│  Managed by selector service     │
└───────────────┬──────────────────┘
                ↓ aa_slug lookup
┌──────────────────────────────────┐
│ aa_performance_metrics (337)     │
│  - slug                          │
│  - intelligence_index            │
│  - coding_index, math_index      │
└──────────────────────────────────┘
```

---

## Key Migrations

### 1. Cache TTL Change

**From:** 30 minutes
**To:** 24 hours
**Rationale:** Match database update frequency from ai-models-discoverer_v3 (daily updates)
**File:** `src/services/cacheManager.js`

### 2. Data Source Migration

**From:** Custom `models` table
**To:** `working_version` table (pipeline-managed)
**Rationale:** Use authoritative source from ai-models-discoverer_v3 pipeline
**Impact:** Automatic updates when pipeline adds new models

### 3. 3-Table Architecture

**Challenge:** working_version has no Intelligence Index data, and user requirement was "do not modify working_version"

**Solution:** Create separate `model_aa_mapping` table

**Files Created:**
- `create_model_aa_mapping.sql` - Table + RLS + indexes
- `populate_model_aa_mapping.js` - Fuzzy matching script
- `add_insert_policy.sql` - RLS policy for inserts

**Files Updated:**
- `src/utils/supabase.js` - 3-table JOIN in application code
- `src/index.js` - Updated /best-model endpoint

**Files Removed:**
- `add_aa_slug_column.sql` - No longer adding column to working_version
- `populate_working_version_aa_slugs.js` - Replaced by populate_model_aa_mapping.js
- `copy_to_working_version.js` - Not needed
- `fix_working_version_rls.sql` - Temporary, no longer needed

---

## Implementation Details

### Model Name Matching Strategy

**Fuzzy Matching Algorithm:**
1. **Direct match:** Check if AA API slug or name matches exactly
2. **Partial match:** Extract keywords from model name and match against AA API
3. **Provider-specific heuristics:** Handle Groq, Google, OpenRouter naming conventions

**Result:** 35/71 models mapped (49% coverage)

**Script:** `populate_model_aa_mapping.js`

### 3-Table JOIN Implementation

**Approach:** Application-level JOIN (no database foreign keys)

```javascript
// Step 1: Fetch all three tables
const {data: models} = await supabase.from('working_version').select('*');
const {data: mappings} = await supabase.from('model_aa_mapping').select('*');
const {data: metrics} = await supabase.from('aa_performance_metrics').select('*');

// Step 2: Create lookup maps
const mappingMap = Object.fromEntries(
  mappings.map(m => [m.model_name, m.aa_slug])
);
const metricsMap = Object.fromEntries(
  metrics.map(m => [m.slug, m])
);

// Step 3: JOIN in JavaScript
const enrichedModels = models.map(model => ({
  ...model,
  aa_performance_metrics: metricsMap[mappingMap[model.human_readable_name]]
}));
```

---

## Migration Challenges & Solutions

### Challenge 1: RLS Policies Blocking Access

**Error:** "Could not find a relationship between 'working_version' and 'aa_performance_metrics'"

**Root Cause:** No foreign key relationship between tables

**Solution:** Changed from database JOIN to application-level JOIN

### Challenge 2: INSERT Policy Missing

**Error:** "new row violates row-level security policy"

**Root Cause:** model_aa_mapping had read policy but no INSERT policy

**Solution:** Created `add_insert_policy.sql` with INSERT policy for anon role

### Challenge 3: Duplicate Model Names

**Error:** "ON CONFLICT DO UPDATE command cannot affect row a second time"

**Root Cause:** working_version had duplicate entries (e.g., "Gemma 3 4B IT" appeared twice)

**Solution:** Added duplicate detection using Set to track seen model names

```javascript
const seenModelNames = new Set();
for (const model of models) {
  if (seenModelNames.has(model.human_readable_name)) {
    skipCount++;
    continue;
  }
  seenModelNames.add(model.human_readable_name);
  // ... continue with mapping
}
```

---

## Test Results

**Overall Best Model:** Grok 4.1 Fast (Intelligence Index: 64.1)
**Best Groq Model:** GPT OSS 20B (Intelligence Index: 52.4)
**Best Google Model:** Gemini 2.5 Pro (Intelligence Index: 59.6)

**Coverage Stats:**
- Total models in working_version: 71
- Models with AA mapping: 35 (49%)
- Models without AA mapping: 30 (42%)
- Duplicate names skipped: 6 (8%)

---

## Benefits Achieved

✅ **Read-only source:** working_version never modified
✅ **Clean separation:** Pipeline owns working_version, selector owns mappings
✅ **Flexible mapping:** Easy to update/fix mappings independently
✅ **Automatic updates:** New pipeline data flows through automatically
✅ **No coupling:** Pipeline and selector are independent

---

## Future Maintenance

### When New Models Added

1. **Automatic:** working_version updated by pipeline
2. **Manual:** Run mapping script:
   ```bash
   node populate_model_aa_mapping.js
   ```
3. **Automatic:** Service picks up new models on next cache refresh (24 hours)

### Updating Mappings

To fix or update mappings:
1. Update mapping script with corrections
2. Re-run script (uses upsert, safe to re-run)
3. Verify:
   ```sql
   SELECT * FROM model_aa_mapping WHERE model_name = 'Model Name';
   ```

### Improving Coverage

To increase the 49% coverage rate:
1. Improve fuzzy matching algorithm in `populate_model_aa_mapping.js`
2. Add manual mappings for models that can't be auto-matched
3. Contact Artificial Analysis to add missing models to their API

---

## Key Learnings

1. **Read-only constraints are valuable:** Keeping working_version read-only prevents accidental modifications and maintains clear ownership
2. **Separate mapping layers work well:** model_aa_mapping provides clean glue between systems without tight coupling
3. **Application-level JOINs are acceptable:** When database FK constraints aren't feasible, joining in code works fine for moderate data sizes
4. **Fuzzy matching requires iteration:** Initial matching only got 49% coverage; improvements possible with better heuristics
5. **RLS policies matter:** Always check both read AND write policies when working with Supabase

---

## Related Files

**SQL Scripts:**
- `create_model_aa_mapping.sql` - Table creation
- `add_insert_policy.sql` - RLS INSERT policy

**JavaScript Scripts:**
- `populate_model_aa_mapping.js` - Mapping population

**Documentation:**
- `04_database_schema.md` - 3-table architecture details
- `03_architecture.md` - Updated system design

---

**Document Owner:** Development Team
