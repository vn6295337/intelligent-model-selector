-- Migration: Replace human_readable_name with provider_slug in ims."10_model_aa_mapping"
-- Date: 2025-11-28
-- Purpose: Use provider_slug for 1-1 matching instead of human_readable_name

-- Step 1: Add provider_slug column
ALTER TABLE ims."10_model_aa_mapping"
ADD COLUMN IF NOT EXISTS provider_slug TEXT;

-- Step 2: Add inference_provider column if it doesn't exist (for multi-provider support)
ALTER TABLE ims."10_model_aa_mapping"
ADD COLUMN IF NOT EXISTS inference_provider TEXT;

-- Step 3: Create index on provider_slug
CREATE INDEX IF NOT EXISTS idx_model_aa_mapping_provider_slug
ON ims."10_model_aa_mapping"(provider_slug);

-- Step 4: Add comment
COMMENT ON COLUMN ims."10_model_aa_mapping".provider_slug IS
'Provider-specific model slug from working_version.provider_slug for exact 1-1 matching';

-- Step 5: Drop old index on human_readable_name (optional - only if migrating fully)
-- DROP INDEX IF EXISTS idx_model_aa_mapping_human_readable_name;

-- Step 6: Remove human_readable_name column (optional - only after data migration)
-- ALTER TABLE ims."10_model_aa_mapping" DROP COLUMN IF EXISTS human_readable_name;

-- Note: Before dropping human_readable_name:
-- 1. Migrate existing mappings from human_readable_name to provider_slug
-- 2. Update selector service code to use provider_slug instead of human_readable_name
