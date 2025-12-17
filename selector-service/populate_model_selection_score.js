/**
 * Populate Model Selection Score Table
 *
 * Script to populate ims.40_model_selection_score with consolidated data
 * from working_version, model_aa_mapping, aa_performance_metrics, and rate_limits
 *
 * Only includes models that exist in ims.10_model_aa_mapping (i.e., have AA metrics)
 *
 * Usage: node populate_model_selection_score.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Scoring constants (from src/config/constants.js)
const SELECTION_WEIGHTS = {
  intelligenceIndex: 0.35,
  latency: 0.25,
  rateLimitHeadroom: 0.25,
  geography: 0.10,
  license: 0.05
};

const LATENCY_SCORES = {
  groq: 1.0,
  gemini: 0.8,
  google: 0.8,
  openrouter: 0.6
};

const GEOGRAPHY_SCORES = {
  'United States': 1.0,
  'default': 0.9
};

const OPEN_SOURCE_LICENSES = [
  'MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause',
  'Llama-2', 'Llama-3', 'Llama-3.1', 'Llama-3.2', 'Llama-3.3', 'Llama-4',
  'Gemma', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0'
];

/**
 * Normalize provider_slug to match ims.10_model_aa_mapping format
 * Matches normalization in ai-models-discoverer_v3/model_aa_mapping_utils.py
 */
function normalizeProviderSlug(slug) {
  if (!slug) return slug;

  // Replace periods, spaces, underscores with hyphens
  let normalized = slug.replace(/[.\s_]+/g, '-');

  // Remove consecutive hyphens
  normalized = normalized.replace(/-+/g, '-');

  // Strip leading/trailing hyphens
  normalized = normalized.replace(/^-+|-+$/g, '');

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  // Strip ONE common suffix (longest first)
  const suffixes = ['-instruct', '-chat', '-it', '-turbo', '-preview', '-exp'];
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }

  return normalized;
}

/**
 * Calculate geography score based on country
 */
function calculateGeographyScore(country) {
  return GEOGRAPHY_SCORES[country] || GEOGRAPHY_SCORES['default'];
}

/**
 * Calculate license score based on license name
 */
function calculateLicenseScore(licenseName) {
  if (!licenseName) return 0.8; // Default for unknown

  const normalized = licenseName.trim();
  const isOpenSource = OPEN_SOURCE_LICENSES.some(lic =>
    normalized.toLowerCase().includes(lic.toLowerCase())
  );

  return isOpenSource ? 1.0 : 0.8;
}

/**
 * Calculate latency score based on provider
 */
function calculateLatencyScore(provider) {
  return LATENCY_SCORES[provider] || 0.5;
}

/**
 * Calculate headroom (0-1)
 */
function calculateHeadroom(limit, usage) {
  if (!limit || limit === 0) return 1.0; // Unlimited
  return Math.max(0, (limit - usage) / limit);
}

/**
 * Calculate overall headroom (average of RPM and TPM)
 */
function calculateOverallHeadroom(rpmHeadroom, tpmHeadroom) {
  // Use RPM headroom if TPM is unlimited (1.0)
  if (tpmHeadroom === 1.0 && rpmHeadroom < 1.0) {
    return rpmHeadroom;
  }
  // Use TPM headroom if RPM is unlimited (1.0)
  if (rpmHeadroom === 1.0 && tpmHeadroom < 1.0) {
    return tpmHeadroom;
  }
  // Average both if both are limited
  return (rpmHeadroom + tpmHeadroom) / 2;
}

/**
 * Calculate final selection score
 */
function calculateSelectionScore(intelligenceIndex, latencyScore, overallHeadroom, geographyScore, licenseScore) {
  // Normalize intelligence index to 0-1 scale (assume max is 100)
  const normalizedIntelligence = intelligenceIndex ? intelligenceIndex / 100 : 0;

  return (
    normalizedIntelligence * SELECTION_WEIGHTS.intelligenceIndex +
    latencyScore * SELECTION_WEIGHTS.latency +
    overallHeadroom * SELECTION_WEIGHTS.rateLimitHeadroom +
    geographyScore * SELECTION_WEIGHTS.geography +
    licenseScore * SELECTION_WEIGHTS.license
  );
}

async function populateModelSelectionScore() {
  console.log('🚀 Starting model selection score population...\n');

  try {
    // Step 1: Fetch models from ims.10_model_aa_mapping (only mapped models)
    console.log('📊 Fetching mapped models from ims.10_model_aa_mapping...');
    const { data: mappings, error: mappingsError } = await supabase
      .schema('ims')
      .from('10_model_aa_mapping')
      .select('provider_slug, aa_slug, inference_provider');

    if (mappingsError) {
      throw new Error(`Failed to fetch mappings: ${mappingsError.message}`);
    }

    console.log(`✅ Found ${mappings.length} mapped models\n`);

    // Step 2: Fetch working_version data
    console.log('📊 Fetching model details from working_version...');
    const { data: workingModels, error: workingError } = await supabase
      .from('working_version')
      .select('provider_slug, human_readable_name, model_provider, inference_provider, model_provider_country, license_name');

    if (workingError) {
      throw new Error(`Failed to fetch working_version: ${workingError.message}`);
    }

    // Create lookup map by BOTH original and normalized provider_slug
    // This handles mismatch between normalized slugs in mapping table and original slugs in working_version
    const workingMap = {};
    workingModels.forEach(m => {
      // Store by original slug
      workingMap[m.provider_slug] = m;

      // Also store by normalized slug
      const normalized = normalizeProviderSlug(m.provider_slug);
      if (normalized !== m.provider_slug) {
        workingMap[normalized] = m;
      }
    });

    console.log(`✅ Fetched ${workingModels.length} models from working_version\n`);

    // Step 3: Fetch aa_performance_metrics
    console.log('📊 Fetching performance metrics from ims.20_aa_performance_metrics...');
    const { data: metrics, error: metricsError } = await supabase
      .schema('ims')
      .from('20_aa_performance_metrics')
      .select('aa_slug, intelligence_index');

    if (metricsError) {
      throw new Error(`Failed to fetch metrics: ${metricsError.message}`);
    }

    // Create lookup map
    const metricsMap = {};
    metrics.forEach(m => {
      metricsMap[m.aa_slug] = m;
    });

    console.log(`✅ Fetched ${metrics.length} performance metrics\n`);

    // Step 4: Fetch rate_limits
    console.log('📊 Fetching rate limits from ims.30_rate_limits...');
    const { data: rateLimits, error: rateLimitsError } = await supabase
      .schema('ims')
      .from('30_rate_limits')
      .select('human_readable_name, rpm, rpd, tpm, tpd');

    if (rateLimitsError) {
      throw new Error(`Failed to fetch rate limits: ${rateLimitsError.message}`);
    }

    // Create lookup map
    const rateLimitsMap = {};
    rateLimits.forEach(r => {
      rateLimitsMap[r.human_readable_name] = r;
    });

    console.log(`✅ Fetched ${rateLimits.length} rate limit entries\n`);

    // Step 5: Build consolidated records
    console.log('🔨 Building consolidated records with scores...');
    const records = [];
    let skippedCount = 0;
    const skippedModels = [];
    const matchStats = {
      directMatch: 0,
      normalizedMatch: 0,
      noMatch: 0
    };

    for (const mapping of mappings) {
      const providerSlug = mapping.provider_slug;
      const workingData = workingMap[providerSlug];
      const metricsData = metricsMap[mapping.aa_slug];

      // Skip if missing critical data
      if (!workingData) {
        console.warn(`⚠️  Skipping ${mapping.inference_provider}:${providerSlug}: Not found in working_version`);
        skippedCount++;
        skippedModels.push({
          provider: mapping.inference_provider,
          slug: providerSlug,
          aa_slug: mapping.aa_slug
        });
        matchStats.noMatch++;
        continue;
      }

      // Track match type for monitoring
      if (workingData.provider_slug === providerSlug) {
        matchStats.directMatch++;
      } else {
        matchStats.normalizedMatch++;
      }

      const modelName = workingData.human_readable_name;
      const rateLimitData = rateLimitsMap[modelName];

      // Calculate scores
      const intelligenceIndex = metricsData?.intelligence_index || null;
      const latencyScore = calculateLatencyScore(mapping.inference_provider);
      const geographyScore = calculateGeographyScore(workingData.model_provider_country);
      const licenseScore = calculateLicenseScore(workingData.license_name);

      // Rate limit headrooms (start at 1.0 = full capacity)
      const rpmLimit = rateLimitData?.rpm || null;
      const rpdLimit = rateLimitData?.rpd || null;
      const tpmLimit = rateLimitData?.tpm || null;
      const tpdLimit = rateLimitData?.tpd || null;

      const rpmUsage = 0;
      const rpdUsage = 0;
      const tpmUsage = 0;
      const tpdUsage = 0;

      const rpmHeadroom = calculateHeadroom(rpmLimit, rpmUsage);
      const rpdHeadroom = calculateHeadroom(rpdLimit, rpdUsage);
      const tpmHeadroom = calculateHeadroom(tpmLimit, tpmUsage);
      const tpdHeadroom = calculateHeadroom(tpdLimit, tpdUsage);

      const overallHeadroom = calculateOverallHeadroom(rpmHeadroom, tpmHeadroom);

      // Calculate final selection score
      const selectionScore = calculateSelectionScore(
        intelligenceIndex,
        latencyScore,
        overallHeadroom,
        geographyScore,
        licenseScore
      );

      records.push({
        model_name: modelName,
        model_provider: workingData.model_provider,
        inference_provider: mapping.inference_provider,
        provider_slug: mapping.provider_slug,
        aa_slug: mapping.aa_slug,
        intelligence_index: intelligenceIndex,
        rpm_limit: rpmLimit,
        rpm_usage: rpmUsage,
        rpm_headroom: rpmHeadroom,
        rpd_limit: rpdLimit,
        rpd_usage: rpdUsage,
        rpd_headroom: rpdHeadroom,
        tpm_limit: tpmLimit,
        tpm_usage: tpmUsage,
        tpm_headroom: tpmHeadroom,
        tpd_limit: tpdLimit,
        tpd_usage: tpdUsage,
        tpd_headroom: tpdHeadroom,
        overall_headroom: overallHeadroom,
        latency_score: latencyScore,
        geography_score: geographyScore,
        license_score: licenseScore,
        selection_score: selectionScore
      });
    }

    console.log(`✅ Built ${records.length} records (skipped ${skippedCount})\n`);

    // Step 5.5: Display match statistics (monitoring)
    console.log('📊 Match Statistics:');
    console.log('─'.repeat(120));
    console.log(`Direct matches:      ${matchStats.directMatch} (provider_slug exact match)`);
    console.log(`Normalized matches:  ${matchStats.normalizedMatch} (required normalization)`);
    console.log(`Failed matches:      ${matchStats.noMatch} (not found in working_version)`);
    console.log(`Total processed:     ${mappings.length}`);
    console.log(`Success rate:        ${((matchStats.directMatch + matchStats.normalizedMatch) / mappings.length * 100).toFixed(1)}%\n`);

    // Display skipped models for debugging
    if (skippedModels.length > 0) {
      console.log('⚠️  Skipped Models (require investigation):');
      console.log('─'.repeat(120));
      skippedModels.forEach(m => {
        console.log(`   ${m.provider}:${m.slug} (aa_slug: ${m.aa_slug})`);
        // Suggest possible original slug
        const denormalized = m.slug.replace(/-(\d)/g, '.$1'); // Try converting hyphens back to periods for version numbers
        console.log(`      → Try checking working_version for: ${denormalized}`);
      });
      console.log();
    }

    // Step 5.6: Deduplicate records by model_name (keep highest selection score)
    console.log('🔍 Deduplicating records by model_name...');
    const deduplicatedMap = {};
    for (const record of records) {
      const existing = deduplicatedMap[record.model_name];
      if (!existing || record.selection_score > existing.selection_score) {
        deduplicatedMap[record.model_name] = record;
      }
    }
    const uniqueRecords = Object.values(deduplicatedMap);
    const duplicatesRemoved = records.length - uniqueRecords.length;
    console.log(`✅ Removed ${duplicatesRemoved} duplicates, ${uniqueRecords.length} unique records remain\n`);

    // Step 6: Upsert into ims."40_model_selection_score"
    console.log(`💾 Upserting ${uniqueRecords.length} records into ims."40_model_selection_score"...`);
    const { data: inserted, error: upsertError } = await supabase
      .schema('ims')
      .from('40_model_selection_score')
      .upsert(uniqueRecords, {
        onConflict: 'model_name',
        ignoreDuplicates: false
      })
      .select();

    if (upsertError) {
      throw new Error(`Failed to upsert data: ${upsertError.message}`);
    }

    console.log(`✅ Successfully populated ${inserted?.length || uniqueRecords.length} records\n`);

    // Step 7: Display top 5 models by selection score
    console.log('🏆 Top 5 models by selection score:');
    console.log('─'.repeat(120));

    const topModels = uniqueRecords
      .sort((a, b) => b.selection_score - a.selection_score)
      .slice(0, 5);

    topModels.forEach((model, index) => {
      console.log(`${index + 1}. ${model.model_name} (${model.inference_provider})`);
      console.log(`   Intelligence: ${model.intelligence_index?.toFixed(1) || 'N/A'} | Selection Score: ${model.selection_score.toFixed(3)}`);
      console.log(`   Latency: ${model.latency_score.toFixed(2)} | Headroom: ${model.overall_headroom.toFixed(2)} | Geography: ${model.geography_score.toFixed(2)} | License: ${model.license_score.toFixed(2)}`);
      console.log(`   RPM: ${model.rpm_limit || 'N/A'} | TPM: ${model.tpm_limit || 'N/A'}`);
      console.log();
    });

    // Step 8: Display statistics by provider
    console.log('📊 Statistics by inference provider:');
    console.log('─'.repeat(120));

    const providerStats = {};
    uniqueRecords.forEach(model => {
      const provider = model.inference_provider;
      if (!providerStats[provider]) {
        providerStats[provider] = {
          count: 0,
          avgSelectionScore: [],
          avgIntelligence: [],
          withRateLimits: 0
        };
      }
      providerStats[provider].count++;
      providerStats[provider].avgSelectionScore.push(model.selection_score);
      if (model.intelligence_index) {
        providerStats[provider].avgIntelligence.push(model.intelligence_index);
      }
      if (model.rpm_limit || model.tpm_limit) {
        providerStats[provider].withRateLimits++;
      }
    });

    Object.entries(providerStats).forEach(([provider, stats]) => {
      const avgScore = stats.avgSelectionScore.reduce((a, b) => a + b, 0) / stats.avgSelectionScore.length;
      const avgIntel = stats.avgIntelligence.length > 0
        ? stats.avgIntelligence.reduce((a, b) => a + b, 0) / stats.avgIntelligence.length
        : null;

      console.log(`${provider}:`);
      console.log(`  Total models: ${stats.count}`);
      console.log(`  Avg selection score: ${avgScore.toFixed(3)}`);
      console.log(`  Avg intelligence index: ${avgIntel ? avgIntel.toFixed(1) : 'N/A'}`);
      console.log(`  Models with rate limits: ${stats.withRateLimits} (${Math.round(stats.withRateLimits / stats.count * 100)}%)`);
      console.log();
    });

    console.log('✅ Model selection score population complete!');

  } catch (error) {
    console.error('❌ Error populating model selection scores:');
    console.error(error.message);
    process.exit(1);
  }
}

// Run the population
populateModelSelectionScore();
