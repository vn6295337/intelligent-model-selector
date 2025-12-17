# ims.10_model_aa_mapping - Table Ownership

**Owner:** ai-models-discoverer_v3 pipeline
**Last Updated:** 2025-12-17

---

## Table Purpose

Maps models from `working_version` to Artificial Analysis performance metrics by linking:
- `working_version.provider_slug` (normalized) → `ims.20_aa_performance_metrics.aa_slug`

---

## Ownership Rules

### ✅ WRITE ACCESS - Pipeline Only

**Authoritative Script:**
```
ai-models-discoverer_v3/model_aa_mapping_utils.py
```

**Called by:**
- `google_pipeline/refresh_model_aa_mapping.py`
- `groq_pipeline/refresh_model_aa_mapping.py`
- `openrouter_pipeline/refresh_model_aa_mapping.py`

**Refresh Trigger:**
- Runs after working_version updates (daily)
- Uses UPSERT pattern (safe, idempotent)

### ❌ DO NOT - Manual Refresh

**Previously existed (now deleted):**
- ~~`intelligent-model-selector/refresh_model_aa_mapping.py`~~

**Why deleted:**
- Redundant with pipeline script
- Did not normalize provider_slug correctly
- Risk of data corruption

---

## Data Format

### Provider Slug Normalization

**Input (working_version.provider_slug):**
- Original format: `gemini-2.5-flash`, `gemma-3-1b-it`
- May contain: periods, suffixes (-it, -instruct, -chat)

**Output (ims.10_model_aa_mapping.provider_slug):**
- Normalized format: `gemini-2-5-flash`, `gemma-3-1b`
- Periods → hyphens
- Suffixes stripped

**Normalization Function:**
```python
# From model_aa_mapping_utils.py
def normalize_slug(slug: str) -> str:
    normalized = re.sub(r'[.\s_]+', '-', slug)  # Periods → hyphens
    normalized = re.sub(r'-+', '-', normalized)  # Remove duplicates
    normalized = normalized.strip('-').lower()   # Clean up

    # Strip ONE suffix only
    for suffix in ['-instruct', '-chat', '-it', '-turbo', '-preview', '-exp']:
        if normalized.endswith(suffix):
            return normalized[:-len(suffix)]

    return normalized
```

---

## Matching Logic

### 3-Tier Matching Strategy

**Tier 1: Exact Match**
```
normalized_provider_slug == aa_slug
Example: "gemini-2-5-flash" == "gemini-2-5-flash" ✓
```

**Tier 2: Suffix Match**
```
aa_slug ends with normalized_provider_slug
Example: "meta-llama-3-1-8b" ends with "llama-3-1-8b" ✓
```

**Tier 3: Contains Match**
```
normalized_provider_slug in aa_slug
Example: "gpt-4o" in "gpt-4o-2024-05-13" ✓
```

**Fallback:**
- SequenceMatcher similarity scoring
- Returns top 5 candidates for manual review

---

## Integration with Selector Service

### READ-ONLY Access

**File:** `intelligent-model-selector/selector-service/src/utils/supabase.js`

**Query Pattern:**
```javascript
// Fetch mappings
const mappings = await supabase
  .schema('ims')
  .from('10_model_aa_mapping')
  .select('provider_slug, aa_slug, inference_provider');

// Join with working_version (requires normalization at runtime)
const normalizedSlug = normalizeProviderSlug(model.provider_slug);
const lookupKey = `${model.inference_provider}:${normalizedSlug}`;
const aaSlug = mappingMap[lookupKey];
```

**Critical:** Selector service must normalize provider_slug at query time to match mapping table format.

---

## Troubleshooting

### Models Not Matching

**Symptom:**
- Models exist in both tables but no mapping created
- "Skipped X models" in populate logs

**Cause:**
- Normalization mismatch between scripts
- New model slug format not handled

**Solution:**
1. Check pipeline logs for unmatched models
2. Verify normalize_slug() handles new format
3. Re-run pipeline refresh script

### Duplicate Mappings

**Symptom:**
- Same model appears twice with different providers

**Cause:**
- Model exists in multiple provider catalogs
- Expected behavior (not a bug)

**Solution:**
- Use (inference_provider, provider_slug) as composite key
- Table has unique constraint on this pair

---

## Maintenance

### When Pipeline Updates working_version

**Automatic:**
1. Pipeline inserts/updates working_version
2. Pipeline runs model_aa_mapping_utils.py
3. Mappings refreshed via UPSERT
4. No manual intervention needed

### When Artificial Analysis Adds New Models

**Manual:**
1. Fetch latest aa_performance_metrics (via API)
2. Run pipeline refresh scripts
3. New mappings created automatically
4. Check logs for unmatched models

---

## Related Documentation

- **Database Schema:** `04_database_schema.md`
- **Migration History:** `08_migration_history.md`
- **Normalization Bug:** `../MAPPING_BUG_ANALYSIS.md`
- **Provider Slug Analysis:** `../provider_slug_analysis.md`

---

**Document Owner:** Development Team
