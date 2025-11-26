/**
 * Populate Rate Limits Table
 *
 * One-time script to populate rate_limits table with normalized data
 * from working_version.rate_limits column for text-generation models
 *
 * Usage: node populate_rate_limits.js
 */

import { createClient } from '@supabase/supabase-js';
import { batchParseRateLimits } from './src/utils/rateLimitParser.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function populateRateLimits() {
  console.log('🚀 Starting rate limits population...\n');

  try {
    // Step 1: Fetch text-generation models from working_version
    console.log('📊 Fetching text-generation models from working_version...');
    const { data: models, error: fetchError } = await supabase
      .from('working_version')
      .select('human_readable_name, inference_provider, rate_limits, output_modalities')
      .ilike('output_modalities', '%Text%')
      .not('output_modalities', 'ilike', '%Embedding%');

    if (fetchError) {
      throw new Error(`Failed to fetch models: ${fetchError.message}`);
    }

    console.log(`✅ Found ${models.length} text-generation models\n`);

    // Step 2: Parse rate limits for each model
    console.log('🔍 Parsing rate limits...');
    const rateLimitsData = batchParseRateLimits(models);

    // Count parseable vs unparseable
    const parseableCount = rateLimitsData.filter(r => r.parseable).length;
    const unparseableCount = rateLimitsData.length - parseableCount;

    console.log(`✅ Parsed ${parseableCount} models successfully`);
    console.log(`⚠️  ${unparseableCount} models using fallback values\n`);

    // Step 3: Check for duplicates
    const seenModelNames = new Set();
    const duplicates = [];
    const uniqueData = [];

    for (const data of rateLimitsData) {
      if (seenModelNames.has(data.human_readable_name)) {
        duplicates.push(data.human_readable_name);
      } else {
        seenModelNames.add(data.human_readable_name);
        uniqueData.push(data);
      }
    }

    if (duplicates.length > 0) {
      console.log(`⚠️  Skipping ${duplicates.length} duplicate model names:`);
      duplicates.forEach(name => console.log(`   - ${name}`));
      console.log();
    }

    // Step 4: Upsert into ims.30_rate_limits table
    console.log(`💾 Upserting ${uniqueData.length} models into ims.30_rate_limits table...`);
    const { data: inserted, error: upsertError} = await supabase
      .schema('ims')
      .from('30_rate_limits')
      .upsert(uniqueData, {
        onConflict: 'human_readable_name',
        ignoreDuplicates: false
      })
      .select();

    if (upsertError) {
      throw new Error(`Failed to upsert data: ${upsertError.message}`);
    }

    console.log(`✅ Successfully populated ${inserted?.length || uniqueData.length} models\n`);

    // Step 5: Display sample data
    console.log('📋 Sample rate limits (first 5 models):');
    console.log('─'.repeat(100));

    const sampleData = uniqueData.slice(0, 5);
    sampleData.forEach(model => {
      console.log(`Model: ${model.human_readable_name} (${model.inference_provider})`);
      console.log(`  RPM: ${model.rpm || 'N/A'}  |  RPD: ${model.rpd || 'N/A'}  |  TPM: ${model.tpm || 'N/A'}  |  TPD: ${model.tpd || 'N/A'}`);
      console.log(`  Raw: ${model.raw_string || 'N/A'}`);
      console.log(`  Parseable: ${model.parseable ? '✅' : '❌ (using fallback)'}`);
      console.log();
    });

    // Step 6: Display statistics by provider
    console.log('📊 Statistics by provider:');
    console.log('─'.repeat(100));

    const providerStats = {};
    uniqueData.forEach(model => {
      const provider = model.inference_provider;
      if (!providerStats[provider]) {
        providerStats[provider] = {
          count: 0,
          parseable: 0,
          avgRpm: [],
          avgRpd: [],
          avgTpm: [],
          avgTpd: []
        };
      }
      providerStats[provider].count++;
      if (model.parseable) providerStats[provider].parseable++;
      if (model.rpm) providerStats[provider].avgRpm.push(model.rpm);
      if (model.rpd) providerStats[provider].avgRpd.push(model.rpd);
      if (model.tpm) providerStats[provider].avgTpm.push(model.tpm);
      if (model.tpd) providerStats[provider].avgTpd.push(model.tpd);
    });

    Object.entries(providerStats).forEach(([provider, stats]) => {
      // Calculate median RPM
      let medianRpm = 'N/A';
      if (stats.avgRpm.length > 0) {
        const sorted = stats.avgRpm.sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        medianRpm = sorted.length % 2 === 0
          ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
          : sorted[mid];
      }

      console.log(`${provider}:`);
      console.log(`  Total models: ${stats.count}`);
      console.log(`  Parseable: ${stats.parseable} (${Math.round(stats.parseable / stats.count * 100)}%)`);
      console.log(`  Median RPM: ${medianRpm}`);
      console.log();
    });

    console.log('✅ Rate limits population complete!');

  } catch (error) {
    console.error('❌ Error populating rate limits:');
    console.error(error.message);
    process.exit(1);
  }
}

// Run the population
populateRateLimits();
