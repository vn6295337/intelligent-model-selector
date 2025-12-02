/**
 * Cache Manager - In-memory caching with TTL and background refresh
 */

class CacheManager {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    return entry.data;
  }

  /**
   * Set value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  set(key, value, ttl) {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Check if cache entry is expired
   * @param {string} key - Cache key
   * @returns {boolean} True if expired or not found
   */
  isExpired(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return true;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    return age > entry.ttl;
  }

  /**
   * Get cache entry age in milliseconds
   * @param {string} key - Cache key
   * @returns {number} Age in milliseconds, or -1 if not found
   */
  getAge(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return -1;
    }

    return Date.now() - entry.timestamp;
  }

  /**
   * Refresh cache with new data (background refresh pattern)
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Async function to fetch fresh data
   * @param {number} ttl - Time to live in milliseconds
   * @returns {Promise<any>} Fresh data
   */
  async refresh(key, fetchFn, ttl) {
    try {
      const freshData = await fetchFn();
      this.set(key, freshData, ttl);
      return freshData;
    } catch (error) {
      console.error(`Cache refresh failed for key ${key}:`, error);
      // Keep stale data on error
      throw error;
    }
  }

  /**
   * Get value from cache or fetch if expired (with background refresh)
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Async function to fetch fresh data
   * @param {number} ttl - Time to live in milliseconds
   * @returns {Promise<any>} Cached or fresh data
   */
  async getOrFetch(key, fetchFn, ttl) {
    const isExpired = this.isExpired(key);
    const cachedData = this.get(key);

    if (isExpired) {
      if (cachedData) {
        // Return stale data immediately, refresh in background
        this.refresh(key, fetchFn, ttl).catch(err => {
          console.error('Background refresh error:', err);
        });
        return cachedData;
      } else {
        // No cached data, must fetch synchronously
        return await this.refresh(key, fetchFn, ttl);
      }
    }

    return cachedData;
  }

  /**
   * Invalidate cache entry (force refresh)
   * @param {string} key - Cache key
   */
  invalidate(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const stats = {
      size: this.cache.size,
      entries: []
    };

    this.cache.forEach((entry, key) => {
      const age = Date.now() - entry.timestamp;
      const expired = age > entry.ttl;

      stats.entries.push({
        key,
        age,
        ttl: entry.ttl,
        expired,
        dataSize: JSON.stringify(entry.data).length
      });
    });

    return stats;
  }
}

// Singleton instance
const cacheManager = new CacheManager();

export default cacheManager;
