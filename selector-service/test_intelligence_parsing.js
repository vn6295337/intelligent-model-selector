#!/usr/bin/env node
/**
 * Test Intelligence Index Parsing with Fixed Code
 */

import 'dotenv/config';
import { fetchIntelligenceScores } from './src/services/intelligenceIndex.js';

console.log('Testing Intelligence Index parsing with fixed code...\n');

async function test() {
  try {
    const scores = await fetchIntelligenceScores();

    console.log(`✅ Loaded ${Object.keys(scores).length} intelligence scores\n`);

    if (Object.keys(scores).length > 0) {
      console.log('Sample scores (first 20):');
      Object.entries(scores).slice(0, 20).forEach(([slug, score]) => {
        console.log(`  ${slug}: ${score.toFixed(4)}`);
      });

      console.log(`\n... and ${Object.keys(scores).length - 20} more models`);
    } else {
      console.log('⚠️  No scores loaded - check API response parsing');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test();
