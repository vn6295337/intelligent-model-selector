/**
 * Intelligence Index Service - Artificial Analysis API Integration
 *
 * Fetches model performance scores from Artificial Analysis API
 * Caches results for 7 days to minimize API calls
 * Provides fallback scoring when API unavailable
 */

import cacheManager from './cacheManager.js';
import { MODEL_SIZE_SCORES, CACHE_TTLS } from '../config/constants.js';

const API_BASE_URL = 'https://artificialanalysis.ai/api/v2';

/**
 * Get API key from environment variables
 * @returns {string|undefined} API key
 * @private
 */
function getApiKey() {
  return process.env.ARTIFICIALANALYSIS_API_KEY || process.env.ARTIFICIAL_ANALYSIS_API_KEY;
}

/**
 * Fetch Intelligence Index scores for all models
 * @returns {Promise<Object>} Map of model names to intelligence scores
 */
export async function fetchIntelligenceScores() {
  // Check cache first
  const cached = await cacheManager.get('intelligenceIndex');
  if (cached) {
    console.log('Intelligence Index: Using cached scores');
    return cached;
  }

  // Fetch from API if key available
  const apiKey = getApiKey();
  if (apiKey && apiKey !== 'your-api-key-here') {
    try {
      const scores = await fetchFromAPI();

      // Cache for 7 days
      await cacheManager.set('intelligenceIndex', scores, CACHE_TTLS.intelligenceIndex);

      console.log(`Intelligence Index: Fetched ${Object.keys(scores).length} model scores from API`);
      return scores;
    } catch (error) {
      console.warn('Intelligence Index: API fetch failed, using fallback', error.message);
      // Fall through to empty map (will use fallback scoring)
    }
  } else {
    console.log('Intelligence Index: No API key configured, using fallback scoring');
  }

  // Return empty map if no API key or fetch failed
  return {};
}

/**
 * Fetch scores from Artificial Analysis API
 * @returns {Promise<Object>} Map of model names to scores
 * @private
 */
async function fetchFromAPI() {
  const url = `${API_BASE_URL}/data/llms/models`;

  const apiKey = getApiKey();
  const response = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  // Check rate limit headers
  const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
  if (rateLimitRemaining) {
    console.log(`Artificial Analysis API: ${rateLimitRemaining} requests remaining`);
  }

  const data = await response.json();

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid API response format');
  }

  // Parse scores into map
  return parseScores(data.data);
}

/**
 * Parse API response into model name -> score map
 * @param {Array} models - Array of model data from API
 * @returns {Object} Map of model names to normalized scores
 * @private
 */
function parseScores(models) {
  const scores = {};

  models.forEach(model => {
    // Use slug as the key (exact format from API)
    const slug = model.slug;

    if (!slug) return;

    // Get Intelligence Index score (primary metric)
    let score = model.artificial_analysis_intelligence_index;

    // If Intelligence Index not available, try other metrics
    if (score === null || score === undefined) {
      // Use average of available benchmarks
      const benchmarks = [
        model.mmlu_pro,
        model.gpqa,
        model.artificial_analysis_coding_index,
        model.artificial_analysis_math_index
      ].filter(v => v !== null && v !== undefined);

      if (benchmarks.length > 0) {
        score = benchmarks.reduce((sum, v) => sum + v, 0) / benchmarks.length;
      }
    }

    // Normalize score to 0-1 range
    // Intelligence Index is typically 0-100
    if (score !== null && score !== undefined) {
      // Store with exact slug as key (e.g., "gemini-2-5-flash", "gemma-3-27b")
      scores[slug] = normalizeScore(score);
    }
  });

  return scores;
}

/**
 * Normalize score to 0-1 range
 * @param {number} score - Raw score (typically 0-100)
 * @returns {number} Normalized score (0-1)
 * @private
 */
function normalizeScore(score) {
  // Intelligence Index is typically 0-100
  if (score >= 0 && score <= 1) {
    // Already normalized
    return score;
  }

  if (score > 1 && score <= 100) {
    // Normalize from 0-100 to 0-1
    return score / 100;
  }

  // Cap at 1.0
  return Math.min(1.0, score);
}

/**
 * Extract normalized model name from various formats
 * Handles formats like:
 * - "models/gemini-2.5-flash" -> "gemini-2-5-flash"
 * - "Gemini 2.5 Flash" -> "gemini-2-5-flash"
 * - "Llama 3.3 70B Versatile" -> "llama-3-3-70b-versatile"
 *
 * @param {string} name - Model name in any format
 * @returns {string} Normalized slug format
 * @private
 */
function normalizeModelName(name) {
  if (!name) return '';

  // Remove "models/" prefix (common in Gemini API)
  let normalized = name.replace(/^models?\//i, '');

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  // Replace dots with hyphens (2.5 -> 2-5)
  normalized = normalized.replace(/\./g, '-');

  // Replace spaces with hyphens
  normalized = normalized.replace(/\s+/g, '-');

  // Remove parentheses and their contents
  normalized = normalized.replace(/\([^)]*\)/g, '');

  // Remove special characters except hyphens
  normalized = normalized.replace(/[^a-z0-9-]/g, '');

  // Remove consecutive hyphens
  normalized = normalized.replace(/-+/g, '-');

  // Remove leading/trailing hyphens
  normalized = normalized.replace(/^-+|-+$/g, '');

  return normalized;
}

/**
 * Calculate fuzzy match score between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Match score (0-1, higher is better match)
 * @private
 */
function fuzzyMatchScore(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  // Exact match
  if (s1 === s2) return 1.0;

  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const longer = Math.max(s1.length, s2.length);
    const shorter = Math.min(s1.length, s2.length);
    return shorter / longer;
  }

  // Token-based matching (split by hyphens)
  const tokens1 = s1.split('-');
  const tokens2 = s2.split('-');
  const matchingTokens = tokens1.filter(t => tokens2.includes(t)).length;
  const totalTokens = Math.max(tokens1.length, tokens2.length);

  return matchingTokens / totalTokens;
}

/**
 * Get intelligence score for a specific model
 * @param {Object} model - Model object from database
 * @param {Object} scoresMap - Map of slugs to scores from Artificial Analysis API
 * @returns {number} Intelligence score (0-1)
 */
export function getModelScore(model, scoresMap) {
  if (!model || !model.human_readable_name) {
    return calculateFallbackScore(model);
  }

  // Direct 1-to-1 matching using human_readable_name field from database
  // human_readable_name should be stored in exact Artificial Analysis slug format
  // Examples: "gemini-2-5-flash", "gemma-3-27b", "llama-3-3-70b-versatile"
  const modelName = model.human_readable_name;

  if (scoresMap[modelName]) {
    return scoresMap[modelName];
  }

  // Fallback to size-based scoring if no exact match
  return calculateFallbackScore(model);
}

/**
 * Calculate fallback score based on model size
 * @param {Object} model - Model object
 * @returns {number} Fallback score (0-1)
 */
export function calculateFallbackScore(model) {
  if (!model || !model.human_readable_name) {
    return 0.6; // Default moderate score
  }

  const modelName = model.human_readable_name.toLowerCase();

  // Try to extract model size from name
  for (const [size, score] of Object.entries(MODEL_SIZE_SCORES)) {
    if (modelName.includes(size)) {
      return score;
    }
  }

  // Default moderate score
  return 0.6;
}

/**
 * Initialize intelligence index scores on service startup
 * @returns {Promise<void>}
 */
export async function initializeScores() {
  try {
    const scores = await fetchIntelligenceScores();
    console.log(`Intelligence Index: Initialized with ${Object.keys(scores).length} model scores`);
  } catch (error) {
    console.error('Intelligence Index: Initialization failed', error.message);
    // Continue with fallback scoring
  }
}

export default {
  fetchIntelligenceScores,
  getModelScore,
  calculateFallbackScore,
  initializeScores
};
