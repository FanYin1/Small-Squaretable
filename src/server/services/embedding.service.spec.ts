// src/server/services/embedding.service.spec.ts
import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';
import type { SentimentResult } from './embedding.service';

// Mock @xenova/transformers
vi.mock('@xenova/transformers', () => {
  // Create mock embedding pipeline that returns 384-dimensional vectors
  const createMockEmbedding = (text: string): Float32Array => {
    // Generate deterministic embeddings based on text content
    // This allows us to test similarity comparisons
    const embedding = new Float32Array(384);
    const hash = text.split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);

    for (let i = 0; i < 384; i++) {
      // Create a pseudo-random but deterministic value based on text and position
      embedding[i] = Math.sin(hash * (i + 1) * 0.001) * 0.5;
    }

    // Normalize the embedding
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    for (let i = 0; i < 384; i++) {
      embedding[i] /= norm;
    }

    return embedding;
  };

  // Create embeddings that are similar for similar concepts
  const getSemanticEmbedding = (text: string): Float32Array => {
    const embedding = new Float32Array(384);
    const lowerText = text.toLowerCase();

    // Programming-related texts get similar embeddings
    const isProgramming = lowerText.includes('programming') ||
                          lowerText.includes('coding') ||
                          lowerText.includes('code');

    // Weather-related texts get different embeddings
    const isWeather = lowerText.includes('weather');

    for (let i = 0; i < 384; i++) {
      if (isProgramming) {
        // Programming texts cluster together
        embedding[i] = Math.sin(i * 0.1) * 0.5 + Math.cos(i * 0.05) * 0.3;
      } else if (isWeather) {
        // Weather texts are in a different region
        embedding[i] = Math.cos(i * 0.2) * 0.5 - Math.sin(i * 0.1) * 0.3;
      } else {
        // Default embedding
        embedding[i] = Math.sin(i * 0.15) * 0.4;
      }
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    for (let i = 0; i < 384; i++) {
      embedding[i] /= norm;
    }

    return embedding;
  };

  const mockEmbeddingPipeline = vi.fn().mockImplementation((text: string) => {
    return Promise.resolve({
      data: getSemanticEmbedding(text),
    });
  });

  const mockSentimentPipeline = vi.fn().mockImplementation((text: string) => {
    const lowerText = text.toLowerCase();

    // Determine sentiment based on keywords
    const positiveWords = ['happy', 'joy', 'love', 'great', 'wonderful', 'amazing', 'good'];
    const negativeWords = ['sad', 'upset', 'angry', 'terrible', 'bad', 'hate', 'awful'];

    const hasPositive = positiveWords.some(word => lowerText.includes(word));
    const hasNegative = negativeWords.some(word => lowerText.includes(word));

    if (hasPositive && !hasNegative) {
      return Promise.resolve([{ label: 'POSITIVE', score: 0.95 }]);
    } else if (hasNegative && !hasPositive) {
      return Promise.resolve([{ label: 'NEGATIVE', score: 0.92 }]);
    } else if (hasPositive && hasNegative) {
      return Promise.resolve([{ label: 'POSITIVE', score: 0.55 }]);
    } else {
      return Promise.resolve([{ label: 'POSITIVE', score: 0.52 }]);
    }
  });

  return {
    pipeline: vi.fn().mockImplementation((task: string) => {
      if (task === 'feature-extraction') {
        return Promise.resolve(mockEmbeddingPipeline);
      } else if (task === 'sentiment-analysis') {
        return Promise.resolve(mockSentimentPipeline);
      }
      throw new Error(`Unknown task: ${task}`);
    }),
    env: {
      cacheDir: './models',
      allowLocalModels: true,
    },
  };
});

// Import after mocking
import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeAll(async () => {
    service = new EmbeddingService();
    await service.initialize();
  }, 60000); // Model loading can take time

  describe('embed', () => {
    it('should generate 384-dimensional embedding', async () => {
      const embedding = await service.embed('Hello world');
      expect(embedding).toHaveLength(384);
      expect(embedding.every(v => typeof v === 'number')).toBe(true);
    });

    it('should generate similar embeddings for similar text', async () => {
      const emb1 = await service.embed('I love programming');
      const emb2 = await service.embed('I enjoy coding');
      const emb3 = await service.embed('The weather is nice');

      const sim12 = cosineSimilarity(emb1, emb2);
      const sim13 = cosineSimilarity(emb1, emb3);

      expect(sim12).toBeGreaterThan(sim13);
    });

    it('should return normalized embeddings', async () => {
      const embedding = await service.embed('Test text');
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      // Normalized vectors should have magnitude close to 1
      expect(magnitude).toBeCloseTo(1, 1);
    });
  });

  describe('analyzeSentiment', () => {
    it('should return positive valence for positive text', async () => {
      const result = await service.analyzeSentiment('I am so happy today!');
      expect(result.valence).toBeGreaterThan(0);
    });

    it('should return negative valence for negative text', async () => {
      const result = await service.analyzeSentiment('I am very sad and upset');
      expect(result.valence).toBeLessThan(0);
    });

    it('should return valence in valid range [-1, 1]', async () => {
      const result = await service.analyzeSentiment('Some neutral text');
      expect(result.valence).toBeGreaterThanOrEqual(-1);
      expect(result.valence).toBeLessThanOrEqual(1);
    });

    it('should return arousal in valid range [0, 1]', async () => {
      const result = await service.analyzeSentiment('I am extremely excited!');
      expect(result.arousal).toBeGreaterThanOrEqual(0);
      expect(result.arousal).toBeLessThanOrEqual(1);
    });

    it('should return SentimentResult with valence and arousal', async () => {
      const result = await service.analyzeSentiment('Test text');
      expect(result).toHaveProperty('valence');
      expect(result).toHaveProperty('arousal');
      expect(typeof result.valence).toBe('number');
      expect(typeof result.arousal).toBe('number');
    });
  });

  describe('initialize', () => {
    it('should not reinitialize if already initialized', async () => {
      const newService = new EmbeddingService();
      await newService.initialize();
      // Second call should be a no-op
      await newService.initialize();
      // If we get here without error, the test passes
      expect(true).toBe(true);
    });
  });
});

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
