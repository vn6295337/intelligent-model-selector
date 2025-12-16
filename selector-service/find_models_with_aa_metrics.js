#!/usr/bin/env node
/**
 * Find which models have AA performance metrics
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function findModelsWithMetrics() {
  // Get all models from working_version
  const { data: models } = await supabase
    .from('working_version')
    .select('human_readable_name, inference_provider, provider_slug');

  // Get model-aa mapping
  const { data: mappings } = await supabase
    .schema('ims')
    .from('10_model_aa_mapping')
    .select('provider_slug, aa_slug, inference_provider');

  // Get all AA performance metrics
  const { data: metrics } = await supabase
    .schema('ims')
    .from('20_aa_performance_metrics')
    .select('aa_slug, intelligence_index, name');

  // Create lookup maps
  const mappingMap = {};
  mappings.forEach(m => {
    const key = `${m.inference_provider}:${m.provider_slug}`;
    mappingMap[key] = m.aa_slug;
  });

  const metricsMap = {};
  metrics.forEach(m => {
    metricsMap[m.aa_slug] = m;
  });

  // Find models with AA metrics
  const modelsWithMetrics = [];
  const modelsWithoutMetrics = [];

  models.forEach(model => {
    const key = `${model.inference_provider}:${model.provider_slug}`;
    const aa_slug = mappingMap[key];

    if (aa_slug && metricsMap[aa_slug]) {
      modelsWithMetrics.push({
        human_readable_name: model.human_readable_name,
        provider: model.inference_provider,
        provider_slug: model.provider_slug,
        aa_slug: aa_slug,
        intelligence_index: metricsMap[aa_slug].intelligence_index,
        aa_name: metricsMap[aa_slug].name
      });
    } else {
      modelsWithoutMetrics.push({
        human_readable_name: model.human_readable_name,
        provider: model.inference_provider,
        provider_slug: model.provider_slug,
        aa_slug: aa_slug || 'NO MAPPING',
        reason: !aa_slug ? 'No mapping to AA slug' : 'AA slug not in metrics table'
      });
    }
  });

  console.log(`\n✅ Models WITH AA Performance Metrics (${modelsWithMetrics.length}):`);
  console.log('='.repeat(80));
  modelsWithMetrics.forEach((m, idx) => {
    console.log(`${idx + 1}. ${m.human_readable_name} (${m.provider})`);
    console.log(`   Provider Slug: ${m.provider_slug}`);
    console.log(`   AA Slug: ${m.aa_slug}`);
    console.log(`   AA Name: ${m.aa_name}`);
    console.log(`   Intelligence Index: ${m.intelligence_index}`);
    console.log();
  });

  console.log(`\n❌ Models WITHOUT AA Performance Metrics (${modelsWithoutMetrics.length}):`);
  console.log('='.repeat(80));
  modelsWithoutMetrics.slice(0, 10).forEach((m, idx) => {
    console.log(`${idx + 1}. ${m.human_readable_name} (${m.provider})`);
    console.log(`   Provider Slug: ${m.provider_slug}`);
    console.log(`   AA Slug: ${m.aa_slug}`);
    console.log(`   Reason: ${m.reason}`);
    console.log();
  });
  if (modelsWithoutMetrics.length > 10) {
    console.log(`... and ${modelsWithoutMetrics.length - 10} more models without metrics\n`);
  }
}

findModelsWithMetrics();
