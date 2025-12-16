# Critical Bug: provider_slug Normalization Mismatch

## Problem

**Mapping table stores NORMALIZED slugs, but JOIN uses RAW slugs from working_version**

### Example Mismatches

| working_version | mapping table | Result |
|----------------|---------------|---------|
| `Google:gemini-2.5-flash` | `Google:gemini-2-5-flash` | ❌ NO MATCH |
| `Google:gemma-3-1b-it` | `Google:gemma-3-1b` | ❌ NO MATCH |
| `Google:gemini-2.0-flash-001` | `Google:gemini-2-0-flash` | ❌ NO MATCH |

### Current Status

- **Total models in working_version:** 60
- **Total mappings in ims.10_model_aa_mapping:** 28
- **Models WITH AA metrics (after JOIN):** 9  ❌
- **Expected models with AA metrics:** 28  ✓

### Why This Happens

**Step 1: model_aa_mapping_utils.py normalizes before storing**
```python
# Line 34-84 in model_aa_mapping_utils.py
def normalize_slug(slug: str) -> str:
    normalized = re.sub(r'[.\s_]+', '-', slug)  # Periods → hyphens
    # ... strip suffixes
    return normalized
```

**Step 2: Mapping table INSERT uses normalized slug**
```python
# Line 259 model_aa_mapping_utils.py
INSERT INTO ims."10_model_aa_mapping" (inference_provider, provider_slug, aa_slug)
VALUES (%s, %s, %s)
ON CONFLICT (inference_provider, provider_slug) DO UPDATE ...
```
- Stores: `provider_slug = "gemini-2-5-flash"` (normalized)
- Original from working_version: `"gemini-2.5-flash"`

**Step 3: intelligent-model-selector tries exact match**
```javascript
// supabase.js line 88-89
const lookupKey = `${model.inference_provider}:${model.provider_slug}`;
const aaSlug = mappingMap[lookupKey];
```
- Looks for: `Google:gemini-2.5-flash` (raw from working_version)
- Mapping has: `Google:gemini-2-5-flash` (normalized)
- Result: `undefined` ❌

## Solutions

### Option 1: Normalize provider_slug before JOIN (RECOMMENDED)
```javascript
// In supabase.js fetchLatestModels()
function normalizeSlug(slug) {
  return slug.replace(/[.\s_]+/g, '-')
             .replace(/-+/g, '-')
             .replace(/^-+|-+$/g, '')
             .toLowerCase()
             .replace(/-(instruct|chat|it|turbo|preview|exp)$/, '');
}

const lookupKey = `${model.inference_provider}:${normalizeSlug(model.provider_slug)}`;
```

### Option 2: Store both original AND normalized slugs
```sql
ALTER TABLE ims."10_model_aa_mapping"
ADD COLUMN provider_slug_original TEXT;

-- Store both:
provider_slug_original = "gemini-2.5-flash"  (from working_version)
provider_slug = "gemini-2-5-flash"  (normalized for matching)
```

### Option 3: Don't normalize in mapping table
```python
# Change model_aa_mapping_utils.py to NOT normalize provider_slug
# Only normalize temporarily for MATCHING, but store original
```

## Impact

**Before fix:**
- 28 mappings exist but only 9 are usable
- 68% of mappings wasted
- Models missing intelligence scores unnecessarily

**After fix:**
- All 28 mappings will work
- 46.7% coverage (28/60) instead of 15% (9/60)
- Proper intelligence scoring for Google models
