/**
 * Tests for Intelligence Index Service
 */

import { jest } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn();

// Mock cache manager
const mockGet = jest.fn();
const mockSet = jest.fn();

jest.unstable_mockModule('../services/cacheManager.js', () => ({
  default: {
    get: mockGet,
    set: mockSet
  }
}));

// Import after mocking
const { fetchIntelligenceScores, getModelScore, calculateFallbackScore, initializeScores } = await import('../services/intelligenceIndex.js');

describe('Intelligence Index Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockSet.mockReset();
    global.fetch.mockReset();
    delete process.env.ARTIFICIAL_ANALYSIS_API_KEY;
  });

  describe('fetchIntelligenceScores', () => {
    test('should return cached scores if available', async () => {
      const cachedScores = {
        'gpt-4': 0.95,
        'claude-3': 0.92
      };

      mockGet.mockResolvedValue(cachedScores);

      const result = await fetchIntelligenceScores();

      expect(result).toEqual(cachedScores);
      expect(mockGet).toHaveBeenCalledWith('intelligenceIndex');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should fetch from API when cache is empty and API key is configured', async () => {
      process.env.ARTIFICIAL_ANALYSIS_API_KEY = 'test-api-key';
      mockGet.mockResolvedValue(null);

      const mockApiResponse = {
        data: [
          {
            model_name: 'GPT-4',
            artificial_analysis_intelligence_index: 95.5
          },
          {
            model_name: 'Claude-3-Opus',
            artificial_analysis_intelligence_index: 92.3
          }
        ]
      };

      global.fetch.mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn((header) => {
            if (header === 'X-RateLimit-Remaining') return '999';
            return null;
          })
        },
        json: jest.fn().mockResolvedValue(mockApiResponse)
      });

      const result = await fetchIntelligenceScores();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://artificialanalysis.ai/api/v2/data/llms/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key'
          })
        })
      );

      expect(mockSet).toHaveBeenCalledWith(
        'intelligenceIndex',
        expect.any(Object),
        604800000 // 7 days
      );

      expect(result).toHaveProperty('gpt-4');
      expect(result).toHaveProperty('claude-3-opus');
    });

    test('should return empty object when API key is not configured', async () => {
      mockGet.mockResolvedValue(null);

      const result = await fetchIntelligenceScores();

      expect(result).toEqual({});
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should return empty object when API request fails', async () => {
      process.env.ARTIFICIAL_ANALYSIS_API_KEY = 'test-api-key';
      mockGet.mockResolvedValue(null);

      global.fetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue('Rate limit exceeded')
      });

      const result = await fetchIntelligenceScores();

      expect(result).toEqual({});
    });

    test('should handle network errors gracefully', async () => {
      process.env.ARTIFICIAL_ANALYSIS_API_KEY = 'test-api-key';
      mockGet.mockResolvedValue(null);

      global.fetch.mockRejectedValue(new Error('Network error'));

      const result = await fetchIntelligenceScores();

      expect(result).toEqual({});
    });

    test('should normalize scores from 0-100 to 0-1 range', async () => {
      process.env.ARTIFICIAL_ANALYSIS_API_KEY = 'test-api-key';
      mockGet.mockResolvedValue(null);

      const mockApiResponse = {
        data: [
          {
            model_name: 'Model-A',
            artificial_analysis_intelligence_index: 85.0 // 0-100 scale
          },
          {
            model_name: 'Model-B',
            artificial_analysis_intelligence_index: 0.75 // Already 0-1
          }
        ]
      };

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: jest.fn(() => null) },
        json: jest.fn().mockResolvedValue(mockApiResponse)
      });

      const result = await fetchIntelligenceScores();

      // Should normalize 85.0 to 0.85
      expect(result['model-a']).toBeCloseTo(0.85, 2);
      // Should keep 0.75 as is
      expect(result['model-b']).toBeCloseTo(0.75, 2);
    });

    test('should use alternative benchmarks when Intelligence Index is missing', async () => {
      process.env.ARTIFICIAL_ANALYSIS_API_KEY = 'test-api-key';
      mockGet.mockResolvedValue(null);

      const mockApiResponse = {
        data: [
          {
            model_name: 'Model-C',
            artificial_analysis_intelligence_index: null,
            mmlu_pro: 80.0,
            gpqa: 70.0,
            artificial_analysis_coding_index: 75.0,
            artificial_analysis_math_index: 65.0
          }
        ]
      };

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: jest.fn(() => null) },
        json: jest.fn().mockResolvedValue(mockApiResponse)
      });

      const result = await fetchIntelligenceScores();

      // Should average the 4 benchmarks: (80 + 70 + 75 + 65) / 4 = 72.5 -> 0.725
      expect(result['model-c']).toBeCloseTo(0.725, 2);
    });
  });

  describe('getModelScore', () => {
    test('should return score from scores map for exact match', () => {
      const model = {
        human_readable_name: 'GPT-4'
      };

      const scoresMap = {
        'gpt-4': 0.95
      };

      const score = getModelScore(model, scoresMap);
      expect(score).toBe(0.95);
    });

    test('should return score for partial match', () => {
      const model = {
        human_readable_name: 'GPT-4-Turbo-Preview'
      };

      const scoresMap = {
        'gpt-4-turbo': 0.93
      };

      const score = getModelScore(model, scoresMap);
      expect(score).toBe(0.93);
    });

    test('should use fallback scoring when no match found', () => {
      const model = {
        human_readable_name: 'Llama-3.3-70B'
      };

      const scoresMap = {};

      const score = getModelScore(model, scoresMap);
      expect(score).toBe(0.9); // 70B model fallback
    });

    test('should handle empty scores map', () => {
      const model = {
        human_readable_name: 'Unknown-Model-8B'
      };

      const score = getModelScore(model, {});
      expect(score).toBe(0.5); // 8B fallback
    });

    test('should handle missing model name', () => {
      const model = {};

      const score = getModelScore(model, {});
      expect(score).toBe(0.6); // Default moderate score
    });
  });

  describe('calculateFallbackScore', () => {
    test('should score 405B model highest', () => {
      const model = { human_readable_name: 'Llama-4-405B' };
      expect(calculateFallbackScore(model)).toBe(1.0);
    });

    test('should score 70B models correctly', () => {
      const model = { human_readable_name: 'Llama-3.3-70B-Versatile' };
      expect(calculateFallbackScore(model)).toBe(0.9);
    });

    test('should score 8B models correctly', () => {
      const model = { human_readable_name: 'Llama-3.1-8B-Instant' };
      expect(calculateFallbackScore(model)).toBe(0.5);
    });

    test('should score 1B models correctly', () => {
      const model = { human_readable_name: 'TinyModel-1B' };
      expect(calculateFallbackScore(model)).toBe(0.3);
    });

    test('should return default score for unknown size', () => {
      const model = { human_readable_name: 'Gemini-2.0-Flash' };
      expect(calculateFallbackScore(model)).toBe(0.6);
    });

    test('should handle null model', () => {
      expect(calculateFallbackScore(null)).toBe(0.6);
    });

    test('should handle model without name', () => {
      expect(calculateFallbackScore({})).toBe(0.6);
    });
  });

  describe('initializeScores', () => {
    test('should initialize scores successfully', async () => {
      const mockScores = { 'gpt-4': 0.95 };
      mockGet.mockResolvedValue(mockScores);

      await expect(initializeScores()).resolves.toBeUndefined();
    });

    test('should handle initialization errors gracefully', async () => {
      mockGet.mockRejectedValue(new Error('Cache error'));

      // Should not throw
      await expect(initializeScores()).resolves.toBeUndefined();
    });
  });

  describe('API Response Parsing', () => {
    test('should handle API response with slug instead of model_name', async () => {
      process.env.ARTIFICIAL_ANALYSIS_API_KEY = 'test-api-key';
      mockGet.mockResolvedValue(null);

      const mockApiResponse = {
        data: [
          {
            slug: 'claude-3-opus',
            artificial_analysis_intelligence_index: 92.0
          }
        ]
      };

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: jest.fn(() => null) },
        json: jest.fn().mockResolvedValue(mockApiResponse)
      });

      const result = await fetchIntelligenceScores();
      expect(result['claude-3-opus']).toBeCloseTo(0.92, 2);
    });

    test('should skip models without identifier', async () => {
      process.env.ARTIFICIAL_ANALYSIS_API_KEY = 'test-api-key';
      mockGet.mockResolvedValue(null);

      const mockApiResponse = {
        data: [
          {
            artificial_analysis_intelligence_index: 90.0
            // No model_name or slug
          }
        ]
      };

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: jest.fn(() => null) },
        json: jest.fn().mockResolvedValue(mockApiResponse)
      });

      const result = await fetchIntelligenceScores();
      expect(Object.keys(result)).toHaveLength(0);
    });

    test('should handle invalid API response format', async () => {
      process.env.ARTIFICIAL_ANALYSIS_API_KEY = 'test-api-key';
      mockGet.mockResolvedValue(null);

      const mockApiResponse = {
        // Missing 'data' field
        models: []
      };

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: jest.fn(() => null) },
        json: jest.fn().mockResolvedValue(mockApiResponse)
      });

      const result = await fetchIntelligenceScores();
      expect(result).toEqual({});
    });
  });
});
