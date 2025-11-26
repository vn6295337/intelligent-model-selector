/**
 * Rate Limit Parser
 * Parses various rate limit text formats from working_version.rate_limits column
 * Supports 3 primary formats covering 100% of text-generation models
 */

/**
 * Parse token value with K/M suffixes
 * Examples: "15K" → 15000, "1M" → 1000000, "500" → 500
 */
function parseTokenValue(str) {
  if (!str) return null;

  const match = str.match(/([\d.]+)([KkMm]?)/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();

  if (suffix === 'K') return Math.round(value * 1000);
  if (suffix === 'M') return Math.round(value * 1000000);
  return Math.round(value);
}

/**
 * Apply provider-based fallback values when parsing fails
 */
function applyProviderFallback(result, provider) {
  const fallbacks = {
    groq: { rpm: 30, rpd: null, tpm: 15000, tpd: null },
    google: { rpm: 15, rpd: null, tpm: null, tpd: null },
    openrouter: { rpm: 20, rpd: 50, tpm: null, tpd: null }
  };

  const providerLower = provider?.toLowerCase() || '';
  let fallback = null;

  if (providerLower.includes('groq')) {
    fallback = fallbacks.groq;
  } else if (providerLower.includes('google') || providerLower.includes('gemini')) {
    fallback = fallbacks.google;
  } else if (providerLower.includes('openrouter')) {
    fallback = fallbacks.openrouter;
  }

  if (fallback) {
    result.rpm = fallback.rpm;
    result.rpd = fallback.rpd;
    result.tpm = fallback.tpm;
    result.tpd = fallback.tpd;
    result.parseable = false;
  }

  return result;
}

/**
 * Parse rate limits from various text formats
 *
 * Format 1 (Google/Gemini): "15 requests/min, 1M tokens/min, 200 requests/day"
 * Format 2 (OpenRouter): "20 requests/min 50/day"
 * Format 3 (Groq): "RPM: 30, TPM: 15K, RPD: 14.4K, TPD: 500K"
 *
 * @param {string} rateLimitsStr - Raw rate_limits string from working_version
 * @param {string} provider - inference_provider for fallback
 * @returns {Object} Parsed rate limits with rpm, rpd, tpm, tpd
 */
export function parseRateLimits(rateLimitsStr, provider) {
  const result = {
    rpm: null,
    rpd: null,
    tpm: null,
    tpd: null,
    raw_string: rateLimitsStr,
    parseable: true
  };

  // Handle null/empty strings
  if (!rateLimitsStr || rateLimitsStr.trim() === '') {
    return applyProviderFallback(result, provider);
  }

  const lower = rateLimitsStr.toLowerCase();

  // Format 1: "15 requests/min, 1M tokens/min, 200 requests/day"
  // Characteristics: Contains "requests/min" and comma separator
  if (lower.includes('requests/min') && lower.includes(',')) {
    const rpmMatch = rateLimitsStr.match(/(\d+)\s*requests\/min/i);
    const tpmMatch = rateLimitsStr.match(/([\d.]+[KkMm]?)\s*tokens\/min/i);
    const rpdMatch = rateLimitsStr.match(/([\d,]+)\s*requests\/day/i);

    if (rpmMatch) result.rpm = parseInt(rpmMatch[1]);
    if (tpmMatch) result.tpm = parseTokenValue(tpmMatch[1]);
    if (rpdMatch) result.rpd = parseInt(rpdMatch[1].replace(/,/g, ''));

    // If we got at least RPM, consider it parsed
    if (result.rpm !== null) {
      return result;
    }
  }

  // Format 2: "20 requests/min 50/day"
  // Characteristics: Contains "requests/min" and "/day" but no comma
  else if (lower.includes('requests/min') && lower.includes('/day')) {
    const rpmMatch = rateLimitsStr.match(/(\d+)\s*requests\/min/i);
    const rpdMatch = rateLimitsStr.match(/(\d+)\/day/i);

    if (rpmMatch) result.rpm = parseInt(rpmMatch[1]);
    if (rpdMatch) result.rpd = parseInt(rpdMatch[1]);

    if (result.rpm !== null) {
      return result;
    }
  }

  // Format 3: "RPM: 30, TPM: 15K, RPD: 14.4K, TPD: 500K"
  // Characteristics: Contains "RPM:" prefix
  else if (lower.includes('rpm:')) {
    const rpmMatch = rateLimitsStr.match(/rpm:\s*(\d+)/i);
    const tpmMatch = rateLimitsStr.match(/tpm:\s*([\d.]+[KkMm]?)/i);
    const rpdMatch = rateLimitsStr.match(/rpd:\s*([\d.]+[KkMm]?)/i);
    const tpdMatch = rateLimitsStr.match(/tpd:\s*([\d.]+[KkMm]?)/i);

    if (rpmMatch) result.rpm = parseInt(rpmMatch[1]);
    if (tpmMatch) result.tpm = parseTokenValue(tpmMatch[1]);
    if (rpdMatch) result.rpd = parseTokenValue(rpdMatch[1]);
    if (tpdMatch) result.tpd = parseTokenValue(tpdMatch[1]);

    if (result.rpm !== null) {
      return result;
    }
  }

  // If no format matched or RPM is null, apply fallback
  if (result.rpm === null) {
    return applyProviderFallback(result, provider);
  }

  return result;
}

/**
 * Batch parse rate limits for multiple models
 * @param {Array} models - Array of model objects with rate_limits and inference_provider
 * @returns {Array} Array of parsed rate limit objects
 */
export function batchParseRateLimits(models) {
  return models.map(model => {
    const parsed = parseRateLimits(
      model.rate_limits,
      model.inference_provider
    );

    return {
      human_readable_name: model.human_readable_name,
      inference_provider: model.inference_provider,
      rpm: parsed.rpm,
      rpd: parsed.rpd,
      tpm: parsed.tpm,
      tpd: parsed.tpd,
      raw_string: model.rate_limits,
      parseable: parsed.parseable
    };
  });
}
