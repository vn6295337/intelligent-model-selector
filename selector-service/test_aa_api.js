#!/usr/bin/env node
/**
 * Test Artificial Analysis API Response
 * Directly calls the API to see what data is returned
 */

import 'dotenv/config';

const API_BASE_URL = 'https://artificialanalysis.ai/api/v2';
const apiKey = process.env.ARTIFICIALANALYSIS_API_KEY;

console.log('Testing Artificial Analysis API...');
console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT FOUND');
console.log();

async function testAPI() {
  try {
    const url = `${API_BASE_URL}/data/llms/models`;

    console.log(`Calling: ${url}`);
    console.log();

    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      }
    });

    console.log(`Response Status: ${response.status} ${response.statusText}`);

    // Check rate limit headers
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
    if (rateLimitRemaining) {
      console.log(`Rate Limit: ${rateLimitRemaining}/${rateLimitLimit} requests remaining`);
    }
    console.log();

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ API Error: ${error}`);
      return;
    }

    const data = await response.json();

    console.log('Response structure:');
    console.log(`- Has 'data' property: ${!!data.data}`);
    console.log(`- Type of 'data': ${Array.isArray(data.data) ? 'Array' : typeof data.data}`);
    console.log(`- Number of models: ${data.data?.length || 0}`);
    console.log();

    if (data.data && Array.isArray(data.data)) {
      console.log('Sample model (first entry):');
      console.log(JSON.stringify(data.data[0], null, 2));
      console.log();

      console.log('All available slugs:');
      data.data.forEach((model, idx) => {
        console.log(`${idx + 1}. ${model.slug || 'NO SLUG'} - ${model.name || 'NO NAME'}`);
      });
      console.log();

      console.log('Models with Intelligence Index:');
      const withIndex = data.data.filter(m => m.artificial_analysis_intelligence_index !== null && m.artificial_analysis_intelligence_index !== undefined);
      console.log(`Found: ${withIndex.length}/${data.data.length}`);
      withIndex.slice(0, 10).forEach(m => {
        console.log(`  - ${m.slug}: ${m.artificial_analysis_intelligence_index}`);
      });
    } else {
      console.log('Full response:');
      console.log(JSON.stringify(data, null, 2));
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testAPI();
