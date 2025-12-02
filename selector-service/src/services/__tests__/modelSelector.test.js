/**
 * Unit tests for Model Selector
 */

import { filterByModalities, calculateScores, matchComplexityToHeadroom, selectBestModel } from '../modelSelector.js';
import rateLimitTracker from '../../utils/rateLimitTracker.js';

// Mock rateLimitTracker
jest.mock('../../utils/rateLimitTracker.js', () => ({
  default: {
    getHeadroom: jest.fn(),
    recordUsage: jest.fn(),
    initializeModel: jest.fn()
  }
}));

describe('ModelSelector', () => {
  const mockModels = [
    {
      inference_provider: 'groq',
      model_provider: 'Meta',
      human_readable_name: 'Llama 3.3 70B Versatile',
      input_modalities: 'Text',
      output_modalities: 'Text',
      license_name: 'Llama-3.3',
      model_provider_country: 'United States'
    },
    {
      inference_provider: 'google',
      model_provider: 'Google',
      human_readable_name: 'Gemini 2.0 Flash',
      input_modalities: 'Text, Image',
      output_modalities: 'Text',
      license_name: 'Gemini',
      model_provider_country: 'United States'
    },
    {
      inference_provider: 'openrouter',
      model_provider: 'DeepSeek',
      human_readable_name: 'DeepSeek R1 8B',
      input_modalities: 'Text',
      output_modalities: 'Text',
      license_name: 'MIT',
      model_provider_country: 'China'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock getHeadroom to return different values for different models
    rateLimitTracker.getHeadroom.mockImplementation((modelName) => {
      if (modelName.includes('Llama')) return 0.9;
      if (modelName.includes('Gemini')) return 0.7;
      if (modelName.includes('DeepSeek')) return 0.5;
      return 0.5;
    });
  });

  describe('filterByModalities', () => {
    it('should return all models for text modality', () => {
      const filtered = filterByModalities(mockModels, ['text']);
      expect(filtered).toHaveLength(3);
    });

    it('should filter models by image input', () => {
      const filtered = filterByModalities(mockModels, ['text', 'image']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].human_readable_name).toBe('Gemini 2.0 Flash');
    });

    it('should exclude models without text output', () => {
      const modelsWithEmbedding = [
        ...mockModels,
        {
          inference_provider: 'openrouter',
          human_readable_name: 'Text Embedding Model',
          input_modalities: 'Text',
          output_modalities: 'Embeddings',
          license_name: 'MIT'
        }
      ];

      const filtered = filterByModalities(modelsWithEmbedding, ['text']);
      // Should exclude embedding-only model (Embeddings without Text)
      expect(filtered).toHaveLength(3);
    });

    it('should handle empty modalities array', () => {
      const filtered = filterByModalities(mockModels, []);
      expect(filtered).toHaveLength(3);
    });

    it('should handle undefined modalities', () => {
      const filtered = filterByModalities(mockModels);
      expect(filtered).toHaveLength(3);
    });
  });

  describe('calculateScores', () => {
    const intelligenceScores = {
      'llama 3.3 70b versatile': 0.9,
      'gemini 2.0 flash': 0.85,
      'deepseek r1 8b': 0.5
    };

    it('should calculate scores for all models', () => {
      const scored = calculateScores(mockModels, 'general_knowledge', 0.5, intelligenceScores);

      expect(scored).toHaveLength(3);
      scored.forEach(model => {
        expect(model).toHaveProperty('score');
        expect(model.score).toBeGreaterThanOrEqual(0);
        expect(model.score).toBeLessThanOrEqual(1);
      });
    });

    it('should include scoring components', () => {
      const scored = calculateScores(mockModels, 'general_knowledge', 0.5, intelligenceScores);

      scored.forEach(model => {
        expect(model).toHaveProperty('intelligenceScore');
        expect(model).toHaveProperty('latencyScore');
        expect(model).toHaveProperty('headroomScore');
        expect(model).toHaveProperty('geographyScore');
        expect(model).toHaveProperty('licenseScore');
      });
    });

    it('should apply query type preference boost', () => {
      const businessScored = calculateScores(mockModels, 'business_news', 0.5, intelligenceScores);
      const generalScored = calculateScores(mockModels, 'general_knowledge', 0.5, intelligenceScores);

      // Groq should get boost for business_news
      const groqBusiness = businessScored.find(m => m.inference_provider === 'groq');
      const groqGeneral = generalScored.find(m => m.inference_provider === 'groq');

      expect(groqBusiness.score).toBeGreaterThanOrEqual(groqGeneral.score);
    });

    it('should score Groq higher for latency', () => {
      const scored = calculateScores(mockModels, 'general_knowledge', 0.5, intelligenceScores);

      const groq = scored.find(m => m.inference_provider === 'groq');
      const openrouter = scored.find(m => m.inference_provider === 'openrouter');

      expect(groq.latencyScore).toBeGreaterThan(openrouter.latencyScore);
    });

    it('should use Intelligence Index scores when provided', () => {
      const scored = calculateScores(mockModels, 'general_knowledge', 0.5, intelligenceScores);

      const llama = scored.find(m => m.human_readable_name === 'Llama 3.3 70B Versatile');
      expect(llama.intelligenceScore).toBe(0.9);
    });

    it('should fall back to size-based scoring when Intelligence Index unavailable', () => {
      const scored = calculateScores(mockModels, 'general_knowledge', 0.5, {});

      const llama = scored.find(m => m.human_readable_name === 'Llama 3.3 70B Versatile');
      // Should use fallback: 70B = 0.9
      expect(llama.intelligenceScore).toBe(0.9);
    });

    it('should get headroom from tracker', () => {
      calculateScores(mockModels, 'general_knowledge', 0.5, intelligenceScores);

      // Should have called getHeadroom for each model
      expect(rateLimitTracker.getHeadroom).toHaveBeenCalledTimes(3);
      expect(rateLimitTracker.getHeadroom).toHaveBeenCalledWith('Llama 3.3 70B Versatile');
      expect(rateLimitTracker.getHeadroom).toHaveBeenCalledWith('Gemini 2.0 Flash');
      expect(rateLimitTracker.getHeadroom).toHaveBeenCalledWith('DeepSeek R1 8B');
    });
  });

  describe('matchComplexityToHeadroom', () => {
    beforeEach(() => {
      // Mock different headroom values for testing
      rateLimitTracker.getHeadroom.mockImplementation((modelName) => {
        if (modelName.includes('Llama')) return 0.9;   // High headroom
        if (modelName.includes('Gemini')) return 0.4;  // Medium headroom
        if (modelName.includes('DeepSeek')) return 0.2; // Low headroom
        return 0.5;
      });
    });

    const scoredModels = mockModels.map((m, i) => ({
      ...m,
      score: 0.8 - i * 0.1
    }));

    it('should require high headroom for high complexity', () => {
      const matched = matchComplexityToHeadroom(scoredModels, 0.8);

      // Only Llama should pass (headroom > 0.6)
      expect(matched).toHaveLength(1);
      expect(matched[0].inference_provider).toBe('groq');
    });

    it('should require medium headroom for medium complexity', () => {
      const matched = matchComplexityToHeadroom(scoredModels, 0.5);

      // Llama and Gemini should pass (headroom > 0.3)
      expect(matched).toHaveLength(2);
      expect(matched.map(m => m.inference_provider)).toContain('groq');
      expect(matched.map(m => m.inference_provider)).toContain('google');
    });

    it('should allow any headroom for low complexity', () => {
      const matched = matchComplexityToHeadroom(scoredModels, 0.3);

      // All models should pass
      expect(matched).toHaveLength(3);
    });
  });

  describe('selectBestModel', () => {
    const scoredModels = [
      {
        ...mockModels[0],
        score: 0.9,
        intelligenceScore: 0.9,
        latencyScore: 1.0,
        headroomScore: 0.9
      },
      {
        ...mockModels[1],
        score: 0.7,
        intelligenceScore: 0.7,
        latencyScore: 0.8,
        headroomScore: 0.7
      }
    ];

    const queryText = 'test query for selection';

    beforeEach(() => {
      rateLimitTracker.getHeadroom.mockReturnValue(0.9);
      rateLimitTracker.recordUsage.mockImplementation(() => {});
    });

    it('should select model with highest score', () => {
      const selected = selectBestModel(scoredModels, queryText);

      expect(selected.provider).toBe('groq');
      expect(selected.score).toBe(0.9);
    });

    it('should return selection metadata', () => {
      const selected = selectBestModel(scoredModels, queryText);

      expect(selected).toHaveProperty('provider');
      expect(selected).toHaveProperty('modelName');
      expect(selected).toHaveProperty('humanReadableName');
      expect(selected).toHaveProperty('score');
      expect(selected).toHaveProperty('rateLimitHeadroom');
      expect(selected).toHaveProperty('estimatedLatency');
      expect(selected).toHaveProperty('intelligenceIndex');
      expect(selected).toHaveProperty('selectionReason');
      expect(selected).toHaveProperty('modalities');
      expect(selected).toHaveProperty('license');
    });

    it('should include modality information', () => {
      const selected = selectBestModel(scoredModels, queryText);

      expect(selected.modalities).toHaveProperty('input');
      expect(selected.modalities).toHaveProperty('output');
    });

    it('should provide selection reason', () => {
      const selected = selectBestModel(scoredModels, queryText);

      expect(selected.selectionReason).toBeTruthy();
      expect(typeof selected.selectionReason).toBe('string');
    });

    it('should throw error for empty model array', () => {
      expect(() => {
        selectBestModel([], queryText);
      }).toThrow('No models available for selection');
    });

    it('should estimate latency correctly', () => {
      const selected = selectBestModel(scoredModels, queryText);

      // Groq should have low latency
      expect(selected.estimatedLatency).toBe('low');
    });

    it('should record usage with queryText', () => {
      selectBestModel(scoredModels, queryText);

      expect(rateLimitTracker.recordUsage).toHaveBeenCalledTimes(1);
      expect(rateLimitTracker.recordUsage).toHaveBeenCalledWith('Llama 3.3 70B Versatile', queryText);
    });

    it('should get headroom from tracker', () => {
      selectBestModel(scoredModels, queryText);

      expect(rateLimitTracker.getHeadroom).toHaveBeenCalledTimes(1);
      expect(rateLimitTracker.getHeadroom).toHaveBeenCalledWith('Llama 3.3 70B Versatile');
    });
  });
});
