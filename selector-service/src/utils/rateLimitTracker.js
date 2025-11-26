/**
 * Rate Limit Tracker - Track 4-metric API usage and calculate headroom
 *
 * Tracks per-model usage across 4 dimensions:
 * - RPM: Requests Per Minute (60s rolling window)
 * - RPD: Requests Per Day (24h rolling window)
 * - TPM: Tokens Per Minute (60s rolling window, estimated)
 * - TPD: Tokens Per Day (24h rolling window, estimated)
 *
 * Overall headroom = min(rpmHeadroom, rpdHeadroom, tpmHeadroom, tpdHeadroom)
 */

import { RATE_LIMIT_DEFAULTS } from '../config/constants.js';

// Time windows
const ONE_MINUTE = 60 * 1000;      // 60 seconds
const ONE_DAY = 24 * 60 * 60 * 1000; // 24 hours

class RateLimitTracker {
  constructor() {
    // Track usage events per model
    this.modelTracking = {};

    // Start periodic cleanup of old records
    this.startCleanup();
  }

  /**
   * Initialize tracking for a specific model
   * @param {string} modelName - Model name (human_readable_name)
   * @param {Object} limits - Rate limits { rpm, rpd, tpm, tpd }
   * @param {string} provider - Provider name (for fallback)
   */
  initializeModel(modelName, limits = {}, provider = null) {
    if (this.modelTracking[modelName]) {
      return; // Already initialized
    }

    // Get limits from database or fallback to provider defaults
    const providerDefaults = provider
      ? RATE_LIMIT_DEFAULTS[provider.toLowerCase()]
      : null;

    this.modelTracking[modelName] = {
      // Rate limit values
      limits: {
        rpm: limits.rpm || providerDefaults?.rpm || 20,
        rpd: limits.rpd || providerDefaults?.rpd || null,
        tpm: limits.tpm || providerDefaults?.tpm || null,
        tpd: limits.tpd || providerDefaults?.tpd || null
      },
      // Event arrays (stored as timestamps)
      requests: [],  // { timestamp: number }
      tokens: []     // { timestamp: number, count: number }
    };
  }

  /**
   * Record a request with estimated token usage
   * @param {string} modelName - Model name
   * @param {string} queryText - Query text for token estimation
   */
  recordUsage(modelName, queryText = '') {
    if (!this.modelTracking[modelName]) {
      console.warn(`Model not initialized: ${modelName}. Initializing with defaults.`);
      this.initializeModel(modelName);
    }

    const now = Date.now();
    const tracking = this.modelTracking[modelName];

    // Record request
    tracking.requests.push({ timestamp: now });

    // Estimate and record tokens
    const estimatedTokens = this.estimateTokens(queryText);
    tracking.tokens.push({ timestamp: now, count: estimatedTokens });
  }

  /**
   * Estimate total tokens (input + output) from query text
   * Formula: Math.ceil(queryLength * 0.75)
   * Accounts for ~4 chars per input token + estimated output (2x input)
   */
  estimateTokens(queryText) {
    if (!queryText) return 0;
    return Math.ceil(queryText.length * 0.75);
  }

  /**
   * Calculate headroom for a specific metric and window
   * @param {string} modelName - Model name
   * @param {string} metric - 'rpm' | 'rpd' | 'tpm' | 'tpd'
   * @returns {number} Headroom ratio (0.0-1.0)
   */
  calculateHeadroom(modelName, metric) {
    const tracking = this.modelTracking[modelName];
    if (!tracking) return 1.0; // Not tracked yet, assume full headroom

    const { limits } = tracking;
    const limit = limits[metric];

    // If no limit set for this metric, return full headroom
    if (!limit || limit <= 0) return 1.0;

    const now = Date.now();
    let usage = 0;

    // Determine window and event array
    if (metric === 'rpm') {
      // Requests in last 60 seconds
      const windowStart = now - ONE_MINUTE;
      usage = tracking.requests.filter(r => r.timestamp >= windowStart).length;
    } else if (metric === 'rpd') {
      // Requests in last 24 hours
      const windowStart = now - ONE_DAY;
      usage = tracking.requests.filter(r => r.timestamp >= windowStart).length;
    } else if (metric === 'tpm') {
      // Tokens in last 60 seconds
      const windowStart = now - ONE_MINUTE;
      usage = tracking.tokens
        .filter(t => t.timestamp >= windowStart)
        .reduce((sum, t) => sum + t.count, 0);
    } else if (metric === 'tpd') {
      // Tokens in last 24 hours
      const windowStart = now - ONE_DAY;
      usage = tracking.tokens
        .filter(t => t.timestamp >= windowStart)
        .reduce((sum, t) => sum + t.count, 0);
    }

    // Calculate headroom
    const headroom = Math.max(0, (limit - usage) / limit);
    return headroom;
  }

  /**
   * Get overall headroom for a model (minimum across all 4 metrics)
   * @param {string} modelName - Model name
   * @returns {number} Overall headroom (0.0-1.0)
   */
  getHeadroom(modelName) {
    if (!this.modelTracking[modelName]) {
      return 1.0; // Not tracked yet, assume full headroom
    }

    // Calculate headroom for each metric
    const rpmHeadroom = this.calculateHeadroom(modelName, 'rpm');
    const rpdHeadroom = this.calculateHeadroom(modelName, 'rpd');
    const tpmHeadroom = this.calculateHeadroom(modelName, 'tpm');
    const tpdHeadroom = this.calculateHeadroom(modelName, 'tpd');

    // Return minimum (most restrictive)
    return Math.min(rpmHeadroom, rpdHeadroom, tpmHeadroom, tpdHeadroom);
  }

  /**
   * Get detailed headroom breakdown for debugging
   * @param {string} modelName - Model name
   * @returns {Object} Headroom for each metric
   */
  getDetailedHeadroom(modelName) {
    if (!this.modelTracking[modelName]) {
      return { rpm: 1.0, rpd: 1.0, tpm: 1.0, tpd: 1.0, overall: 1.0 };
    }

    const rpm = this.calculateHeadroom(modelName, 'rpm');
    const rpd = this.calculateHeadroom(modelName, 'rpd');
    const tpm = this.calculateHeadroom(modelName, 'tpm');
    const tpd = this.calculateHeadroom(modelName, 'tpd');

    return {
      rpm,
      rpd,
      tpm,
      tpd,
      overall: Math.min(rpm, rpd, tpm, tpd)
    };
  }

  /**
   * Clean up old records (older than 24 hours)
   */
  cleanupOldRecords() {
    const now = Date.now();
    const cutoff = now - ONE_DAY;

    Object.keys(this.modelTracking).forEach(modelName => {
      const tracking = this.modelTracking[modelName];

      // Remove requests older than 24 hours
      tracking.requests = tracking.requests.filter(r => r.timestamp >= cutoff);

      // Remove token records older than 24 hours
      tracking.tokens = tracking.tokens.filter(t => t.timestamp >= cutoff);
    });
  }

  /**
   * Start periodic cleanup (runs every 5 minutes)
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldRecords();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Get statistics for all tracked models
   * @returns {Object} Stats by model
   */
  getStats() {
    const stats = {};
    const now = Date.now();

    Object.keys(this.modelTracking).forEach(modelName => {
      const tracking = this.modelTracking[modelName];
      const headroom = this.getDetailedHeadroom(modelName);

      // Count recent usage
      const recentRequests = tracking.requests.filter(r => r.timestamp >= now - ONE_MINUTE).length;
      const recentTokens = tracking.tokens
        .filter(t => t.timestamp >= now - ONE_MINUTE)
        .reduce((sum, t) => sum + t.count, 0);

      stats[modelName] = {
        limits: tracking.limits,
        headroom: {
          rpm: Math.round(headroom.rpm * 100) + '%',
          rpd: Math.round(headroom.rpd * 100) + '%',
          tpm: Math.round(headroom.tpm * 100) + '%',
          tpd: Math.round(headroom.tpd * 100) + '%',
          overall: Math.round(headroom.overall * 100) + '%'
        },
        recentUsage: {
          requestsLastMinute: recentRequests,
          tokensLastMinute: recentTokens
        },
        totalTracked: {
          requests: tracking.requests.length,
          tokenRecords: tracking.tokens.length
        }
      };
    });

    return stats;
  }

  /**
   * Reset tracking for a specific model
   * @param {string} modelName - Model name
   */
  reset(modelName) {
    if (this.modelTracking[modelName]) {
      this.modelTracking[modelName].requests = [];
      this.modelTracking[modelName].tokens = [];
    }
  }

  /**
   * Reset all tracking
   */
  resetAll() {
    Object.keys(this.modelTracking).forEach(modelName => {
      this.reset(modelName);
    });
  }
}

// Singleton instance
const rateLimitTracker = new RateLimitTracker();

export default rateLimitTracker;
