#!/usr/bin/env node
/**
 * Check ims.20_aa_performance_metrics table status
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

console.log('Checking ims.20_aa_performance_metrics table...\n');

async function checkTable() {
  try {
    // Get all records
    const { data: metrics, error } = await supabase
      .schema('ims')
      .from('20_aa_performance_metrics')
      .select('*');

    if (error) {
      console.error('❌ Error querying table:', error.message);
      return;
    }

    console.log(`📊 Total records in table: ${metrics.length}`);
    console.log();

    if (metrics.length === 0) {
      console.log('⚠️  Table is empty!');
      return;
    }

    // Check for last_updated or created_at field
    const sampleRecord = metrics[0];
    console.log('Sample record structure:');
    console.log(JSON.stringify(sampleRecord, null, 2));
    console.log();

    // List all aa_slugs
    console.log('All aa_slugs in table:');
    metrics.forEach((m, idx) => {
      console.log(`${idx + 1}. ${m.aa_slug} - Intelligence: ${m.intelligence_index || 'N/A'}`);
    });
    console.log();

    // Statistics
    const withIntelligence = metrics.filter(m => m.intelligence_index !== null);
    const withCoding = metrics.filter(m => m.coding_index !== null);
    const withMath = metrics.filter(m => m.math_index !== null);

    console.log('Data completeness:');
    console.log(`  Intelligence Index: ${withIntelligence.length}/${metrics.length} (${(withIntelligence.length/metrics.length*100).toFixed(1)}%)`);
    console.log(`  Coding Index: ${withCoding.length}/${metrics.length} (${(withCoding.length/metrics.length*100).toFixed(1)}%)`);
    console.log(`  Math Index: ${withMath.length}/${metrics.length} (${(withMath.length/metrics.length*100).toFixed(1)}%)`);
    console.log();

    // Check if there's a timestamp field
    const hasTimestamp = sampleRecord.updated_at || sampleRecord.created_at || sampleRecord.last_updated;
    if (hasTimestamp) {
      console.log('Last update info available:');
      if (sampleRecord.updated_at) console.log(`  updated_at: ${sampleRecord.updated_at}`);
      if (sampleRecord.created_at) console.log(`  created_at: ${sampleRecord.created_at}`);
      if (sampleRecord.last_updated) console.log(`  last_updated: ${sampleRecord.last_updated}`);
    } else {
      console.log('⚠️  No timestamp fields found in table');
    }

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkTable();
