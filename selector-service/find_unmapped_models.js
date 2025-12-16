#!/usr/bin/env node
/**
 * Find models in working_version that don't have mappings
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function findUnmappedModels() {
  // Get all models from working_version
  const { data: models } = await supabase
    .from('working_version')
    .select('human_readable_name, inference_provider, provider_slug')
    .order('inference_provider');

  // Get model-aa mapping
  const { data: mappings } = await supabase
    .schema('ims')
    .from('10_model_aa_mapping')
    .select('provider_slug, aa_slug, inference_provider');

  // Create lookup map
  const mappingMap = {};
  mappings.forEach(m => {
    const key = `${m.inference_provider}:${m.provider_slug}`;
    mappingMap[key] = m.aa_slug;
  });

  // Find unmapped models
  const unmapped = [];
  const mapped = [];

  models.forEach(model => {
    const key = `${model.inference_provider}:${model.provider_slug}`;
    if (mappingMap[key]) {
      mapped.push(model);
    } else {
      unmapped.push(model);
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Total models in working_version: ${models.length}`);
  console.log(`   Models WITH mappings: ${mapped.length}`);
  console.log(`   Models WITHOUT mappings: ${unmapped.length}`);
  console.log();

  console.log(`\n❌ Models in working_version WITHOUT mappings (${unmapped.length}):`);
  console.log('='.repeat(80));

  // Group by provider
  const byProvider = {};
  unmapped.forEach(m => {
    if (!byProvider[m.inference_provider]) {
      byProvider[m.inference_provider] = [];
    }
    byProvider[m.inference_provider].push(m);
  });

  Object.entries(byProvider).forEach(([provider, models]) => {
    console.log(`\n${provider} (${models.length} unmapped):`);
    models.forEach((m, idx) => {
      console.log(`  ${idx + 1}. ${m.human_readable_name}`);
      console.log(`     provider_slug: ${m.provider_slug}`);
    });
  });

  console.log(`\n\n✅ Models in working_version WITH mappings (${mapped.length}):`);
  console.log('='.repeat(80));

  const mappedByProvider = {};
  mapped.forEach(m => {
    if (!mappedByProvider[m.inference_provider]) {
      mappedByProvider[m.inference_provider] = [];
    }
    mappedByProvider[m.inference_provider].push(m);
  });

  Object.entries(mappedByProvider).forEach(([provider, models]) => {
    console.log(`\n${provider} (${models.length} mapped):`);
    models.forEach((m, idx) => {
      const key = `${m.inference_provider}:${m.provider_slug}`;
      console.log(`  ${idx + 1}. ${m.human_readable_name} → ${mappingMap[key]}`);
    });
  });
}

findUnmappedModels();
