-- Model Selection Score Table
-- Purpose: Consolidated view of all models with performance metrics, rate limits, and selection scores
-- Pattern: Selector-managed, computed from working_version + model_aa_mapping + aa_performance_metrics + rate_limits
-- Created: 2025-12-16

CREATE TABLE IF NOT EXISTS ims."40_model_selection_score" (
  id SERIAL PRIMARY KEY,

  -- Model identifiers
  model_name TEXT NOT NULL UNIQUE,
  model_provider TEXT,                     -- Meta, Google, DeepSeek, etc.
  inference_provider TEXT NOT NULL,        -- groq, google, openrouter
  provider_slug TEXT,                      -- API endpoint slug
  aa_slug TEXT,                            -- Artificial Analysis slug

  -- Performance metrics
  intelligence_index FLOAT,                -- Overall performance score (0-100)

  -- Rate limits - RPM (Requests Per Minute)
  rpm_limit INTEGER,
  rpm_usage INTEGER DEFAULT 0,
  rpm_headroom FLOAT DEFAULT 1.0,          -- (rpm_limit - rpm_usage) / rpm_limit

  -- Rate limits - RPD (Requests Per Day)
  rpd_limit INTEGER,
  rpd_usage INTEGER DEFAULT 0,
  rpd_headroom FLOAT DEFAULT 1.0,          -- (rpd_limit - rpd_usage) / rpd_limit

  -- Rate limits - TPM (Tokens Per Minute)
  tpm_limit BIGINT,
  tpm_usage BIGINT DEFAULT 0,
  tpm_headroom FLOAT DEFAULT 1.0,          -- (tpm_limit - tpm_usage) / tpm_limit

  -- Rate limits - TPD (Tokens Per Day)
  tpd_limit BIGINT,
  tpd_usage BIGINT DEFAULT 0,
  tpd_headroom FLOAT DEFAULT 1.0,          -- (tpd_limit - tpd_usage) / tpd_limit

  -- Scoring factors
  overall_headroom FLOAT DEFAULT 1.0,      -- Average of rpm_headroom and tpm_headroom
  latency_score FLOAT,                     -- 1.0 (groq), 0.8 (google), 0.6 (openrouter)
  geography_score FLOAT,                   -- Based on model_provider_country
  license_score FLOAT,                     -- Based on license_name
  selection_score FLOAT,                   -- Weighted final score

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_model_selection_score_model_name ON ims."40_model_selection_score"(model_name);
CREATE INDEX IF NOT EXISTS idx_model_selection_score_inference_provider ON ims."40_model_selection_score"(inference_provider);
CREATE INDEX IF NOT EXISTS idx_model_selection_score_intelligence_index ON ims."40_model_selection_score"(intelligence_index);
CREATE INDEX IF NOT EXISTS idx_model_selection_score_selection_score ON ims."40_model_selection_score"(selection_score);
CREATE INDEX IF NOT EXISTS idx_model_selection_score_aa_slug ON ims."40_model_selection_score"(aa_slug);

-- Enable Row Level Security
ALTER TABLE ims."40_model_selection_score" ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow public read access
CREATE POLICY "Allow public read access"
ON ims."40_model_selection_score" FOR SELECT
TO public
USING (true);

-- RLS Policy: Allow anon insert for setup scripts
CREATE POLICY "Allow anon insert for setup"
ON ims."40_model_selection_score" FOR INSERT
TO anon
WITH CHECK (true);

-- RLS Policy: Allow anon update for usage tracking
CREATE POLICY "Allow anon update for usage tracking"
ON ims."40_model_selection_score" FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE ims."40_model_selection_score" IS 'Consolidated model scores combining performance metrics, rate limits, and selection scores. Only includes models with AA mapping.';

-- Comments on columns
COMMENT ON COLUMN ims."40_model_selection_score".model_name IS 'Model name from working_version.human_readable_name';
COMMENT ON COLUMN ims."40_model_selection_score".model_provider IS 'Provider company (Meta, Google, etc.) from working_version.model_provider';
COMMENT ON COLUMN ims."40_model_selection_score".inference_provider IS 'API provider (groq, google, openrouter) from working_version.inference_provider';
COMMENT ON COLUMN ims."40_model_selection_score".provider_slug IS 'API endpoint slug for model calls';
COMMENT ON COLUMN ims."40_model_selection_score".aa_slug IS 'Artificial Analysis API slug from model_aa_mapping';
COMMENT ON COLUMN ims."40_model_selection_score".intelligence_index IS 'Overall performance score from aa_performance_metrics (0-100)';
COMMENT ON COLUMN ims."40_model_selection_score".rpm_limit IS 'Requests per minute limit from rate_limits';
COMMENT ON COLUMN ims."40_model_selection_score".rpm_usage IS 'Current requests per minute usage (tracked by service)';
COMMENT ON COLUMN ims."40_model_selection_score".rpm_headroom IS 'Available RPM capacity (0-1)';
COMMENT ON COLUMN ims."40_model_selection_score".overall_headroom IS 'Average headroom across RPM and TPM';
COMMENT ON COLUMN ims."40_model_selection_score".latency_score IS 'Provider latency score: 1.0 (groq), 0.8 (google), 0.6 (openrouter)';
COMMENT ON COLUMN ims."40_model_selection_score".geography_score IS 'Geographic compliance score based on model_provider_country';
COMMENT ON COLUMN ims."40_model_selection_score".license_score IS 'License openness score based on license_name';
COMMENT ON COLUMN ims."40_model_selection_score".selection_score IS 'Final weighted selection score (intelligence×0.35 + latency×0.25 + headroom×0.25 + geography×0.10 + license×0.05)';
