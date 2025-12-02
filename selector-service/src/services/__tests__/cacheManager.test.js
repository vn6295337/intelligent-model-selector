/**
 * Unit tests for Cache Manager
 */

import cacheManager from '../cacheManager.js';

describe('CacheManager', () => {
  beforeEach(() => {
    cacheManager.clear();
  });

  afterEach(() => {
    cacheManager.clear();
  });

  describe('set and get', () => {
    it('should store and retrieve data', () => {
      const testData = { test: 'data' };
      cacheManager.set('test-key', testData, 1000);

      const retrieved = cacheManager.get('test-key');
      expect(retrieved).toEqual(testData);
    });

    it('should return null for non-existent key', () => {
      const retrieved = cacheManager.get('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('isExpired', () => {
    it('should return true for non-existent key', () => {
      expect(cacheManager.isExpired('non-existent')).toBe(true);
    });

    it('should return false for fresh data', () => {
      cacheManager.set('test-key', 'data', 10000);
      expect(cacheManager.isExpired('test-key')).toBe(false);
    });

    it('should return true for expired data', () => {
      jest.useFakeTimers();
      cacheManager.set('test-key', 'data', 1000);

      jest.advanceTimersByTime(1001);

      expect(cacheManager.isExpired('test-key')).toBe(true);
      jest.useRealTimers();
    });
  });

  describe('getAge', () => {
    it('should return -1 for non-existent key', () => {
      expect(cacheManager.getAge('non-existent')).toBe(-1);
    });

    it('should return age in milliseconds', () => {
      jest.useFakeTimers();
      cacheManager.set('test-key', 'data', 10000);

      jest.advanceTimersByTime(5000);

      const age = cacheManager.getAge('test-key');
      expect(age).toBe(5000);
      jest.useRealTimers();
    });
  });

  describe('refresh', () => {
    it('should fetch and cache fresh data', async () => {
      const fetchFn = jest.fn().mockResolvedValue({ fresh: 'data' });

      const result = await cacheManager.refresh('test-key', fetchFn, 1000);

      expect(result).toEqual({ fresh: 'data' });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(cacheManager.get('test-key')).toEqual({ fresh: 'data' });
    });

    it('should throw error if fetch fails', async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error('Fetch failed'));

      await expect(
        cacheManager.refresh('test-key', fetchFn, 1000)
      ).rejects.toThrow('Fetch failed');
    });
  });

  describe('getOrFetch', () => {
    it('should return cached data if not expired', async () => {
      const fetchFn = jest.fn().mockResolvedValue({ fresh: 'data' });
      cacheManager.set('test-key', { cached: 'data' }, 10000);

      const result = await cacheManager.getOrFetch('test-key', fetchFn, 10000);

      expect(result).toEqual({ cached: 'data' });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch if no cached data', async () => {
      const fetchFn = jest.fn().mockResolvedValue({ fresh: 'data' });

      const result = await cacheManager.getOrFetch('test-key', fetchFn, 1000);

      expect(result).toEqual({ fresh: 'data' });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('should return stale data and refresh in background if expired', async () => {
      jest.useFakeTimers();
      const fetchFn = jest.fn().mockResolvedValue({ fresh: 'data' });
      cacheManager.set('test-key', { stale: 'data' }, 1000);

      jest.advanceTimersByTime(1001);

      const result = await cacheManager.getOrFetch('test-key', fetchFn, 1000);

      // Should return stale data immediately
      expect(result).toEqual({ stale: 'data' });

      // Fetch should be called for background refresh
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(fetchFn).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('invalidate', () => {
    it('should remove cache entry', () => {
      cacheManager.set('test-key', 'data', 1000);
      expect(cacheManager.get('test-key')).toBe('data');

      cacheManager.invalidate('test-key');
      expect(cacheManager.get('test-key')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all cache entries', () => {
      cacheManager.set('key1', 'data1', 1000);
      cacheManager.set('key2', 'data2', 1000);

      cacheManager.clear();

      expect(cacheManager.get('key1')).toBeNull();
      expect(cacheManager.get('key2')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cacheManager.set('key1', 'data1', 1000);
      cacheManager.set('key2', 'data2', 2000);

      const stats = cacheManager.getStats();

      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries[0]).toHaveProperty('key');
      expect(stats.entries[0]).toHaveProperty('age');
      expect(stats.entries[0]).toHaveProperty('ttl');
      expect(stats.entries[0]).toHaveProperty('expired');
    });
  });
});
