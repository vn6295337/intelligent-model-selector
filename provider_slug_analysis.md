# Provider Slug Analysis

## 1. How provider_slug is created in each pipeline

### OpenRouter Pipeline
**Stage P** (`P_enrich_provider_info.py` line 151-152)
```python
provider_slug = canonical_slug.split('/', 1)[1] if '/' in canonical_slug else canonical_slug
```
- Input: `"nvidia/nemotron-3-nano-30b-a3b"`
- Output: `"nemotron-3-nano-30b-a3b"`
- Method: Split on first `/`, take everything after

### Google Pipeline
**Stage D** (`D_enrich_modalities.py` line 408-531)
```python
provider_slug = full_name.split('models/', 1)[1] if 'models/' in full_name else full_name
```
- Input: `"models/gemini-2.5-flash"`
- Output: `"gemini-2.5-flash"`
- Method: Split on `models/` prefix, take everything after

### Groq Pipeline
**Stage F** (`F_normalize_data.py` using `groq_data_processor.py` line 40-77)
```python
# Step 1: Strip Groq-specific prefix using regex ^(\d+[B]?|[A-Z][A-Za-z]*)([a-z].*$)
# Step 2: Split on '/' and take last part
```
- Input: `"8Bllama-3.1-8b-instant"` or `"meta-llama/llama-3.1-8b-instant"`
- Output: `"llama-3.1-8b-instant"`
- Method: Regex strip prefix, then split on `/` and take last part

## 2. Format differences between provider_slug and aa_slug

### Common Differences

| provider_slug | aa_slug | Difference |
|---------------|---------|------------|
| `gemma-3-1b-it` | `gemma-3-1b` | Suffix `-it` present/absent |
| `gemma-3-4b-it` | `gemma-3-4b` | Suffix `-it` present/absent |
| `gemma-3-12b-it` | `gemma-3-12b` | Suffix `-it` present/absent |
| `gemma-3n-e4b-it` | `gemma-3n-e4b` | Suffix `-it` present/absent |
| `gemini-2.5-flash` | `gemini-2-5-flash` | Period vs hyphen |
| `llama-3.1-8b-instant` | `llama-3-1-8b-instant` | Period vs hyphen |

### Format Characteristics

**provider_slug:**
- Lowercase with hyphens
- May include suffixes: `-it`, `-instruct`, `-chat`, `-turbo`
- May use periods for versions: `3.1`, `2.5`

**aa_slug:**
- Lowercase with hyphens
- Usually no suffixes
- Uses hyphens for versions: `3-1`, `2-5`

## 3. How provider_slug and aa_slug are compared

### NOT 1-1 exact match. Uses 3-tier fuzzy matching:

**Tier 1: Exact Match (after normalization)**
```python
if aa_slug.lower() == normalized_slug:
    return aa_slug
```

**Tier 2: Suffix Match**
```python
if aa_slug.lower().endswith(normalized_slug):
    return aa_slug
```
- Example: `llama-3-1-8b-instant` matches `meta-llama-3-1-8b-instant`

**Tier 3: Contains Match**
```python
if normalized_slug in aa_slug.lower():
    return aa_slug
```
- Example: `gpt-4o` matches `gpt-4o-2024-05-13`

### Normalization Applied (`normalize_slug()` function):
1. Replace periods/spaces/underscores with hyphens: `3.1` → `3-1`
2. Remove consecutive hyphens
3. Strip leading/trailing hyphens
4. Convert to lowercase
5. Strip ONE common suffix (priority order):
   - `-instruct` → removed
   - `-chat` → removed
   - `-it` → removed
   - `-turbo` → removed
   - `-preview` → removed
   - `-exp` → removed

### Example Match Process:
```
provider_slug: "gemma-3-1b-it"
    ↓ normalize
normalized: "gemma-3-1b" (suffix -it stripped)
    ↓ compare with
aa_slug: "gemma-3-1b"
    ↓
EXACT MATCH ✓
```

### Fallback:
If no match found, uses `SequenceMatcher` similarity scoring to suggest top 5 candidates.
