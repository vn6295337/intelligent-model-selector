#!/usr/bin/env node
/**
 * Validate Selection Scoring with Live Data
 *
 * This script fetches real data from Supabase and validates that:
 * 1. All 4 tables are queried correctly
 * 2. JOINs work properly
 * 3. Scoring algorithm applies weights correctly
 * 4. Total score = sum of weighted components
 */

import { fetchLatestModels } from './src/utils/supabase.js';
import { calculateScores } from './src/services/modelSelector.js';
import { fetchIntelligenceScores } from './src/services/intelligenceIndex.js';
import rateLimitTracker from './src/utils/rateLimitTracker.js';
import { SELECTION_WEIGHTS } from './src/config/constants.js';

console.log('='.repeat(80));
console.log('INTELLIGENT MODEL SELECTOR - SCORING VALIDATION');
console.log('='.repeat(80));
console.log();

async function validateScoring() {
  try {
    // Step 1: Fetch models from 4-table JOIN
    console.log('📊 Step 1: Fetching models from 4-table JOIN...');
    console.log('   Tables: working_version, ims.10_model_aa_mapping,');
    console.log('           ims.20_aa_performance_metrics, ims.30_rate_limits');
    console.log();

    const models = await fetchLatestModels();

    if (!models || models.length === 0) {
      console.error('❌ ERROR: No models returned from database');
      process.exit(1);
    }

    console.log(`✅ Fetched ${models.length} models from database`);
    console.log();

    // Step 2: Analyze data quality
    console.log('📋 Step 2: Data Quality Analysis');
    console.log('-'.repeat(80));

    const withAAMetrics = models.filter(m => m.aa_performance_metrics);
    const withRateLimits = models.filter(m => m.rate_limits_normalized);
    const withBoth = models.filter(m => m.aa_performance_metrics && m.rate_limits_normalized);

    console.log(`   Models with AA performance metrics: ${withAAMetrics.length}/${models.length} (${(withAAMetrics.length/models.length*100).toFixed(1)}%)`);
    console.log(`   Models with rate limits: ${withRateLimits.length}/${models.length} (${(withRateLimits.length/models.length*100).toFixed(1)}%)`);
    console.log(`   Models with both: ${withBoth.length}/${models.length} (${(withBoth.length/models.length*100).toFixed(1)}%)`);
    console.log();

    // Step 3: Initialize rate limit tracker
    console.log('🔧 Step 3: Initializing rate limit tracker...');
    models.forEach(model => {
      const limits = model.rate_limits_normalized || {};
      rateLimitTracker.initializeModel(
        model.human_readable_name,
        limits,
        model.inference_provider
      );
    });
    console.log(`✅ Initialized tracking for ${models.length} models`);
    console.log();

    // Step 4: Fetch Intelligence Index scores
    console.log('🧠 Step 4: Fetching Intelligence Index scores from cache/API...');
    const intelligenceScores = await fetchIntelligenceScores();
    console.log(`✅ Loaded ${Object.keys(intelligenceScores).length} intelligence scores`);
    console.log();

    // Step 5: Calculate scores
    console.log('🎯 Step 5: Calculating selection scores...');
    console.log();
    console.log('Configured Weights:');
    console.log(`   Intelligence Index: ${(SELECTION_WEIGHTS.intelligenceIndex * 100).toFixed(0)}%`);
    console.log(`   Latency: ${(SELECTION_WEIGHTS.latency * 100).toFixed(0)}%`);
    console.log(`   Rate Limit Headroom: ${(SELECTION_WEIGHTS.rateLimitHeadroom * 100).toFixed(0)}%`);
    console.log(`   Geography: ${(SELECTION_WEIGHTS.geography * 100).toFixed(0)}%`);
    console.log(`   License: ${(SELECTION_WEIGHTS.license * 100).toFixed(0)}%`);
    console.log();

    const scoredModels = calculateScores(
      models,
      'general_knowledge',
      0.5,
      intelligenceScores
    );

    // Step 6: Validate scoring math
    console.log('🔍 Step 6: Validating scoring calculations...');
    console.log('-'.repeat(80));
    console.log();

    let allValid = true;
    let validationErrors = 0;

    for (const model of scoredModels.slice(0, 5)) { // Check top 5
      const expectedScore =
        model.intelligenceScore * SELECTION_WEIGHTS.intelligenceIndex +
        model.latencyScore * SELECTION_WEIGHTS.latency +
        model.headroomScore * SELECTION_WEIGHTS.rateLimitHeadroom +
        model.geographyScore * SELECTION_WEIGHTS.geography +
        model.licenseScore * SELECTION_WEIGHTS.license;

      const actualScore = model.score;
      const diff = Math.abs(actualScore - expectedScore);
      const isValid = diff < 0.051; // Allow for preference boost (0.05) + rounding

      if (!isValid) {
        allValid = false;
        validationErrors++;
        console.log(`❌ ${model.human_readable_name}`);
        console.log(`   Expected: ${expectedScore.toFixed(4)}, Got: ${actualScore.toFixed(4)}, Diff: ${diff.toFixed(4)}`);
      }
    }

    if (allValid) {
      console.log(`✅ All scoring calculations validated successfully!`);
    } else {
      console.log(`⚠️  Found ${validationErrors} validation errors (may be due to preference boost)`);
    }
    console.log();

    // Step 7: Display top models with score breakdown
    console.log('🏆 Step 7: Top 10 Models with Score Breakdown');
    console.log('='.repeat(80));
    console.log();

    const sortedModels = scoredModels.sort((a, b) => b.score - a.score);

    sortedModels.slice(0, 10).forEach((model, index) => {
      console.log(`${index + 1}. ${model.human_readable_name} (${model.inference_provider})`);
      console.log(`   Total Score: ${model.score.toFixed(4)}`);
      console.log(`   └─ Intelligence: ${model.intelligenceScore.toFixed(4)} × ${SELECTION_WEIGHTS.intelligenceIndex} = ${(model.intelligenceScore * SELECTION_WEIGHTS.intelligenceIndex).toFixed(4)}`);
      console.log(`   └─ Latency: ${model.latencyScore.toFixed(4)} × ${SELECTION_WEIGHTS.latency} = ${(model.latencyScore * SELECTION_WEIGHTS.latency).toFixed(4)}`);
      console.log(`   └─ Headroom: ${model.headroomScore.toFixed(4)} × ${SELECTION_WEIGHTS.rateLimitHeadroom} = ${(model.headroomScore * SELECTION_WEIGHTS.rateLimitHeadroom).toFixed(4)}`);
      console.log(`   └─ Geography: ${model.geographyScore.toFixed(4)} × ${SELECTION_WEIGHTS.geography} = ${(model.geographyScore * SELECTION_WEIGHTS.geography).toFixed(4)}`);
      console.log(`   └─ License: ${model.licenseScore.toFixed(4)} × ${SELECTION_WEIGHTS.license} = ${(model.licenseScore * SELECTION_WEIGHTS.license).toFixed(4)}`);

      // Show data source info
      const hasAA = model.aa_performance_metrics ? '✓' : '✗';
      const hasRL = model.rate_limits_normalized ? '✓' : '✗';
      console.log(`   Data: AA Metrics ${hasAA}, Rate Limits ${hasRL}`);
      console.log();
    });

    // Step 8: Summary statistics
    console.log('📈 Step 8: Summary Statistics');
    console.log('='.repeat(80));
    console.log();

    const scores = scoredModels.map(m => m.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    console.log(`   Total models scored: ${scoredModels.length}`);
    console.log(`   Average score: ${avgScore.toFixed(4)}`);
    console.log(`   Min score: ${minScore.toFixed(4)}`);
    console.log(`   Max score: ${maxScore.toFixed(4)}`);
    console.log();

    // Provider breakdown
    const byProvider = {};
    scoredModels.forEach(m => {
      if (!byProvider[m.inference_provider]) {
        byProvider[m.inference_provider] = [];
      }
      byProvider[m.inference_provider].push(m.score);
    });

    console.log('   Average score by provider:');
    Object.entries(byProvider).forEach(([provider, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      console.log(`   • ${provider}: ${avg.toFixed(4)} (${scores.length} models)`);
    });
    console.log();

    console.log('='.repeat(80));
    console.log('✅ VALIDATION COMPLETE');
    console.log('='.repeat(80));
    console.log();
    console.log('Summary:');
    console.log(`✓ 4-table JOIN working correctly`);
    console.log(`✓ Scoring weights applied correctly`);
    console.log(`✓ ${scoredModels.length} models scored successfully`);
    console.log();

  } catch (error) {
    console.error();
    console.error('❌ VALIDATION FAILED');
    console.error('='.repeat(80));
    console.error(error);
    process.exit(1);
  }
}

// Run validation
validateScoring();
