/**
 * Embedding Service
 *
 * Provides text embedding and sentiment analysis using local ML models
 */

import { pipeline, env, type Pipeline } from '@xenova/transformers';

// Configure model cache directory
env.cacheDir = './models';
env.allowLocalModels = true;

export interface SentimentResult {
  valence: number; // -1 to 1
  arousal: number; // 0 to 1
}

export class EmbeddingService {
  private embeddingPipeline: Pipeline | null = null;
  private sentimentPipeline: Pipeline | null = null;
  private initialized = false;

  private readonly EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
  private readonly SENTIMENT_MODEL = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('Loading embedding model...');
    this.embeddingPipeline = await pipeline('feature-extraction', this.EMBEDDING_MODEL);

    console.log('Loading sentiment model...');
    this.sentimentPipeline = await pipeline('sentiment-analysis', this.SENTIMENT_MODEL);

    this.initialized = true;
    console.log('EmbeddingService initialized');
  }

  async embed(text: string): Promise<number[]> {
    if (!this.embeddingPipeline) {
      await this.initialize();
    }

    const output = await this.embeddingPipeline!(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert to array
    return Array.from(output.data as Float32Array);
  }

  async analyzeSentiment(text: string): Promise<SentimentResult> {
    if (!this.sentimentPipeline) {
      await this.initialize();
    }

    const result = await this.sentimentPipeline!(text);
    const sentiment = result[0] as { label: string; score: number };

    // Convert to valence-arousal
    // POSITIVE -> positive valence, NEGATIVE -> negative valence
    const valence = sentiment.label === 'POSITIVE'
      ? sentiment.score * 2 - 1  // 0.5-1 -> 0-1
      : -(sentiment.score * 2 - 1); // 0.5-1 -> -1-0

    // Arousal estimation based on confidence
    // Higher confidence = higher arousal (more intense emotion)
    const arousal = Math.abs(sentiment.score - 0.5) * 2;

    return {
      valence: Math.max(-1, Math.min(1, valence)),
      arousal: Math.max(0, Math.min(1, arousal)),
    };
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();
