-- Rate Limits Table
-- Purpose: Store normalized rate limit data for text-generation models
-- Pattern: Same as model_aa_mapping (selector-managed, not pipeline-managed)
-- Created: 2025-11-24

CREATE TABLE IF NOT EXISTS rate_limits (
  id SERIAL PRIMARY KEY,
  model_name TEXT NOT NULL UNIQUE,
  inference_provider TEXT NOT NULL,
  rpm INTEGER,                          -- Requests per minute
  rpd INTEGER,                          -- Requests per day
  tpm BIGINT,                           -- Tokens per minute
  tpd BIGINT,                           -- Tokens per day
  raw_string TEXT,                      -- Original rate_limits text from working_version
  parseable BOOLEAN DEFAULT TRUE,       -- Whether the format was successfully parsed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rate_limits_model_name ON rate_limits(model_name);
CREATE INDEX IF NOT EXISTS idx_rate_limits_provider ON rate_limits(inference_provider);
CREATE INDEX IF NOT EXISTS idx_rate_limits_rpm ON rate_limits(rpm);

-- Enable Row Level Security
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow public read access
CREATE POLICY "Allow public read access"
ON rate_limits FOR SELECT
TO public
USING (true);

-- RLS Policy: Allow anon insert for setup scripts
CREATE POLICY "Allow anon insert for setup"
ON rate_limits FOR INSERT
TO anon
WITH CHECK (true);

-- RLS Policy: Allow anon update for maintenance
CREATE POLICY "Allow anon update for maintenance"
ON rate_limits FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE rate_limits IS 'Normalized rate limit data for text-generation models. Populated from working_version.rate_limits column.';

-- Comments on columns
COMMENT ON COLUMN rate_limits.model_name IS 'Model name from working_version.human_readable_name';
COMMENT ON COLUMN rate_limits.inference_provider IS 'Provider from working_version.inference_provider';
COMMENT ON COLUMN rate_limits.rpm IS 'Requests per minute (parsed from rate_limits string)';
COMMENT ON COLUMN rate_limits.rpd IS 'Requests per day (parsed from rate_limits string)';
COMMENT ON COLUMN rate_limits.tpm IS 'Tokens per minute (parsed from rate_limits string)';
COMMENT ON COLUMN rate_limits.tpd IS 'Tokens per day (parsed from rate_limits string)';
COMMENT ON COLUMN rate_limits.raw_string IS 'Original rate_limits value from working_version for debugging';
COMMENT ON COLUMN rate_limits.parseable IS 'Whether the rate_limits string was successfully parsed';
