/**
 * Unit tests for Rate Limit Tracker (4-Metric Per-Model Tracking)
 */

import rateLimitTracker from '../../utils/rateLimitTracker.js';

describe('RateLimitTracker', () => {
  beforeEach(() => {
    rateLimitTracker.resetAll();
  });

  afterEach(() => {
    rateLimitTracker.resetAll();
  });

  describe('initializeModel', () => {
    it('should initialize model with provided limits', () => {
      rateLimitTracker.initializeModel('test-model', {
        rpm: 30,
        rpd: 14400,
        tpm: 15000,
        tpd: 500000
      }, 'groq');

      const headroom = rateLimitTracker.getDetailedHeadroom('test-model');
      expect(headroom.rpm).toBe(1.0);
      expect(headroom.rpd).toBe(1.0);
      expect(headroom.tpm).toBe(1.0);
      expect(headroom.tpd).toBe(1.0);
    });

    it('should use provider defaults when limits not provided', () => {
      rateLimitTracker.initializeModel('test-model', {}, 'groq');

      const stats = rateLimitTracker.getStats();
      expect(stats['test-model'].limits.rpm).toBe(30); // Groq default
    });

    it('should not re-initialize already initialized model', () => {
      rateLimitTracker.initializeModel('test-model', { rpm: 30 }, 'groq');
      rateLimitTracker.initializeModel('test-model', { rpm: 100 }, 'groq');

      const stats = rateLimitTracker.getStats();
      expect(stats['test-model'].limits.rpm).toBe(30); // Original value
    });
  });

  describe('recordUsage', () => {
    beforeEach(() => {
      rateLimitTracker.initializeModel('test-model', {
        rpm: 30,
        rpd: 1000,
        tpm: 15000,
        tpd: 500000
      }, 'groq');
    });

    it('should record request and estimate tokens', () => {
      const queryText = 'This is a test query with some words';
      rateLimitTracker.recordUsage('test-model', queryText);

      const stats = rateLimitTracker.getStats();
      expect(stats['test-model'].recentUsage.requestsLastMinute).toBe(1);
      expect(stats['test-model'].recentUsage.tokensLastMinute).toBeGreaterThan(0);
    });

    it('should handle multiple usage records', () => {
      rateLimitTracker.recordUsage('test-model', 'query 1');
      rateLimitTracker.recordUsage('test-model', 'query 2');
      rateLimitTracker.recordUsage('test-model', 'query 3');

      const stats = rateLimitTracker.getStats();
      expect(stats['test-model'].recentUsage.requestsLastMinute).toBe(3);
    });

    it('should initialize model if not already initialized', () => {
      rateLimitTracker.recordUsage('uninitialized-model', 'test query');

      const headroom = rateLimitTracker.getHeadroom('uninitialized-model');
      expect(headroom).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getHeadroom', () => {
    beforeEach(() => {
      rateLimitTracker.initializeModel('test-model', {
        rpm: 30,
        rpd: 1000,
        tpm: 15000,
        tpd: 500000
      }, 'groq');
    });

    it('should return 1.0 for unused model', () => {
      const headroom = rateLimitTracker.getHeadroom('test-model');
      expect(headroom).toBe(1.0);
    });

    it('should return minimum headroom across all metrics', () => {
      // Record 15 requests (50% of RPM)
      for (let i = 0; i < 15; i++) {
        rateLimitTracker.recordUsage('test-model', 'test');
      }

      const headroom = rateLimitTracker.getHeadroom('test-model');
      const detailed = rateLimitTracker.getDetailedHeadroom('test-model');

      // Overall headroom should be the minimum of all metrics
      expect(headroom).toBe(Math.min(detailed.rpm, detailed.rpd, detailed.tpm, detailed.tpd));
    });

    it('should return 1.0 for uninitialized model', () => {
      const headroom = rateLimitTracker.getHeadroom('nonexistent-model');
      expect(headroom).toBe(1.0);
    });
  });

  describe('getDetailedHeadroom', () => {
    beforeEach(() => {
      rateLimitTracker.initializeModel('test-model', {
        rpm: 30,
        rpd: 1000,
        tpm: 15000,
        tpd: null // No TPD limit
      }, 'groq');
    });

    it('should return headroom for each metric', () => {
      const detailed = rateLimitTracker.getDetailedHeadroom('test-model');

      expect(detailed).toHaveProperty('rpm');
      expect(detailed).toHaveProperty('rpd');
      expect(detailed).toHaveProperty('tpm');
      expect(detailed).toHaveProperty('tpd');
      expect(detailed).toHaveProperty('overall');
    });

    it('should return 1.0 for metrics with no limit', () => {
      const detailed = rateLimitTracker.getDetailedHeadroom('test-model');
      expect(detailed.tpd).toBe(1.0); // No TPD limit set
    });

    it('should calculate RPM headroom correctly', () => {
      // Use 50% of RPM (15/30)
      for (let i = 0; i < 15; i++) {
        rateLimitTracker.recordUsage('test-model', 'test');
      }

      const detailed = rateLimitTracker.getDetailedHeadroom('test-model');
      expect(detailed.rpm).toBeCloseTo(0.5, 1);
    });
  });

  describe('calculateHeadroom', () => {
    beforeEach(() => {
      rateLimitTracker.initializeModel('test-model', {
        rpm: 30,
        rpd: 1000,
        tpm: 15000,
        tpd: 500000
      }, 'groq');
    });

    it('should calculate RPM headroom correctly', () => {
      // Record 10 requests
      for (let i = 0; i < 10; i++) {
        rateLimitTracker.recordUsage('test-model', 'test');
      }

      const rpmHeadroom = rateLimitTracker.calculateHeadroom('test-model', 'rpm');
      expect(rpmHeadroom).toBeCloseTo((30 - 10) / 30, 2);
    });

    it('should return 1.0 for metric with no limit', () => {
      rateLimitTracker.initializeModel('no-limit-model', {
        rpm: 30,
        rpd: null, // No limit
        tpm: null,
        tpd: null
      }, 'groq');

      const rpdHeadroom = rateLimitTracker.calculateHeadroom('no-limit-model', 'rpd');
      expect(rpdHeadroom).toBe(1.0);
    });

    it('should return 0 when limit reached', () => {
      // Reach RPM limit
      for (let i = 0; i < 30; i++) {
        rateLimitTracker.recordUsage('test-model', 'test');
      }

      const rpmHeadroom = rateLimitTracker.calculateHeadroom('test-model', 'rpm');
      expect(rpmHeadroom).toBe(0);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens from query length', () => {
      const queryText = 'This is a test query';
      const estimated = rateLimitTracker.estimateTokens(queryText);

      // Formula: Math.ceil(length * 0.75)
      const expected = Math.ceil(queryText.length * 0.75);
      expect(estimated).toBe(expected);
    });

    it('should return 0 for empty string', () => {
      const estimated = rateLimitTracker.estimateTokens('');
      expect(estimated).toBe(0);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      rateLimitTracker.initializeModel('model1', { rpm: 30 }, 'groq');
      rateLimitTracker.initializeModel('model2', { rpm: 30 }, 'groq');
    });

    it('should reset usage for specific model', () => {
      rateLimitTracker.recordUsage('model1', 'test');
      rateLimitTracker.recordUsage('model2', 'test');

      rateLimitTracker.reset('model1');

      const stats = rateLimitTracker.getStats();
      expect(stats['model1'].totalTracked.requests).toBe(0);
      expect(stats['model2'].totalTracked.requests).toBe(1);
    });
  });

  describe('resetAll', () => {
    it('should reset all model tracking', () => {
      rateLimitTracker.initializeModel('model1', { rpm: 30 }, 'groq');
      rateLimitTracker.initializeModel('model2', { rpm: 30 }, 'groq');
      rateLimitTracker.recordUsage('model1', 'test');
      rateLimitTracker.recordUsage('model2', 'test');

      rateLimitTracker.resetAll();

      const stats = rateLimitTracker.getStats();
      expect(stats['model1'].totalTracked.requests).toBe(0);
      expect(stats['model2'].totalTracked.requests).toBe(0);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      rateLimitTracker.initializeModel('test-model', {
        rpm: 30,
        rpd: 1000,
        tpm: 15000,
        tpd: 500000
      }, 'groq');
      rateLimitTracker.recordUsage('test-model', 'test query');
    });

    it('should return detailed statistics', () => {
      const stats = rateLimitTracker.getStats();

      expect(stats).toHaveProperty('test-model');
      expect(stats['test-model']).toHaveProperty('limits');
      expect(stats['test-model']).toHaveProperty('headroom');
      expect(stats['test-model']).toHaveProperty('recentUsage');
      expect(stats['test-model']).toHaveProperty('totalTracked');
    });

    it('should include all four metrics in headroom', () => {
      const stats = rateLimitTracker.getStats();
      const headroom = stats['test-model'].headroom;

      expect(headroom).toHaveProperty('rpm');
      expect(headroom).toHaveProperty('rpd');
      expect(headroom).toHaveProperty('tpm');
      expect(headroom).toHaveProperty('tpd');
      expect(headroom).toHaveProperty('overall');
    });

    it('should format headroom as percentages', () => {
      const stats = rateLimitTracker.getStats();
      const headroom = stats['test-model'].headroom;

      expect(headroom.rpm).toMatch(/%$/);
      expect(headroom.rpd).toMatch(/%$/);
      expect(headroom.tpm).toMatch(/%$/);
      expect(headroom.tpd).toMatch(/%$/);
    });
  });

  describe('cleanup', () => {
    it('should remove records older than 24 hours', () => {
      rateLimitTracker.initializeModel('test-model', { rpm: 30 }, 'groq');
      rateLimitTracker.recordUsage('test-model', 'test');

      // Manually trigger cleanup (it normally runs every 5 minutes)
      rateLimitTracker.cleanupOldRecords();

      // Records should still exist (less than 24 hours old)
      const stats = rateLimitTracker.getStats();
      expect(stats['test-model'].totalTracked.requests).toBe(1);
    });
  });
});
