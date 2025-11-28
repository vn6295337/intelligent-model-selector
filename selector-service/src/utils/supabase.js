/**
 * Supabase database utilities for querying ai_models_main table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Fetch all models from working_version table with AA performance metrics and rate limits
 * Uses 4-table lookup: working_version → model_aa_mapping → aa_performance_metrics
 *                                      → rate_limits
 * @returns {Promise<Array>} Array of model objects
 */
export async function fetchLatestModels() {
  try {
    // Fetch all models from working_version
    const { data: models, error: modelsError } = await supabase
      .from('working_version')
      .select('*')
      .order('updated_at', { ascending: false });

    if (modelsError) {
      throw new Error(`Supabase query error: ${modelsError.message}`);
    }

    // Fetch model provider_slug → AA slug mappings
    const { data: mappings, error: mappingsError } = await supabase
      .from('ims_10_model_aa_mapping')
      .select('provider_slug, aa_slug, inference_provider');

    if (mappingsError) {
      throw new Error(`Supabase query error: ${mappingsError.message}`);
    }

    // Fetch all AA performance metrics
    const { data: metrics, error: metricsError } = await supabase
      .schema('ims')
      .from('20_aa_performance_metrics')
      .select('aa_slug, intelligence_index, coding_index, math_index, name');

    if (metricsError) {
      throw new Error(`Supabase query error: ${metricsError.message}`);
    }

    // Fetch all rate limits
    const { data: rateLimits, error: rateLimitsError } = await supabase
      .schema('ims')
      .from('30_rate_limits')
      .select('human_readable_name, rpm, rpd, tpm, tpd, parseable');

    if (rateLimitsError) {
      throw new Error(`Supabase query error: ${rateLimitsError.message}`);
    }

    // Create lookup maps using provider_slug + inference_provider as composite key
    const mappingMap = {};
    (mappings || []).forEach(m => {
      const key = `${m.inference_provider}:${m.provider_slug}`;
      mappingMap[key] = m.aa_slug;
    });

    const metricsMap = {};
    (metrics || []).forEach(m => {
      metricsMap[m.aa_slug] = m;
    });

    const rateLimitsMap = {};
    (rateLimits || []).forEach(r => {
      rateLimitsMap[r.human_readable_name] = r;
    });

    // 4-table join: working_version → model_aa_mapping → aa_performance_metrics
    //                               → rate_limits
    const modelsWithMetrics = (models || []).map(model => {
      const lookupKey = `${model.inference_provider}:${model.provider_slug}`;
      const aaSlug = mappingMap[lookupKey];
      const aaMetrics = aaSlug ? metricsMap[aaSlug] : null;
      const rateLimitsData = rateLimitsMap[model.human_readable_name] || null;

      return {
        ...model,
        aa_performance_metrics: aaMetrics || null,
        rate_limits_normalized: rateLimitsData
      };
    });

    return modelsWithMetrics;
  } catch (error) {
    console.error('Error fetching models from Supabase:', error);
    throw error;
  }
}

/**
 * Fetch models filtered by inference provider
 * @param {string} provider - Provider name (groq, google, openrouter)
 * @returns {Promise<Array>} Array of model objects
 */
export async function getModelsByProvider(provider) {
  try {
    const { data, error } = await supabase
      .from('ai_models_main')
      .select('*')
      .eq('inference_provider', provider)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error(`Error fetching models for provider ${provider}:`, error);
    throw error;
  }
}

/**
 * Fetch models filtered by modalities
 * @param {Array<string>} inputModalities - Required input modalities
 * @param {Array<string>} outputModalities - Required output modalities
 * @returns {Promise<Array>} Array of model objects
 */
export async function getModelsByModalities(inputModalities = [], outputModalities = []) {
  try {
    let query = supabase
      .from('ai_models_main')
      .select('*');

    // Apply input modality filters
    inputModalities.forEach(modality => {
      query = query.ilike('input_modalities', `%${modality}%`);
    });

    // Apply output modality filters
    outputModalities.forEach(modality => {
      query = query.ilike('output_modalities', `%${modality}%`);
    });

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching models by modalities:', error);
    throw error;
  }
}

/**
 * Fetch models filtered by license
 * @param {Array<string>} licenses - License names to filter by
 * @returns {Promise<Array>} Array of model objects
 */
export async function getModelsByLicense(licenses) {
  try {
    const { data, error } = await supabase
      .from('ai_models_main')
      .select('*')
      .in('license_name', licenses)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching models by license:', error);
    throw error;
  }
}

/**
 * Test Supabase connection
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('working_version')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Supabase connection test failed:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Supabase connection test error:', error);
    return false;
  }
}

export default supabase;
