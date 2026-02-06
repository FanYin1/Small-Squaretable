/**
 * Embedding Service
 *
 * Provides text embedding and sentiment analysis via ML microservice
 * The ML service runs as a separate process, transparent to users
 * Falls back to default values when ML service is unavailable
 */

export interface SentimentResult {
  valence: number; // -1 to 1
  arousal: number; // 0 to 1
}

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:3001';

export class EmbeddingService {
  private initialized = false;
  private serviceAvailable = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check if ML service is available
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${ML_SERVICE_URL}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        this.serviceAvailable = data.initialized;
        console.log('[EmbeddingService] ML service connected:', data);
      }
    } catch {
      console.warn('[EmbeddingService] ML service not available, using fallback mode');
    }

    this.initialized = true;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.serviceAvailable) {
      // Return zero vector as fallback (384 dimensions for MiniLM)
      return new Array(384).fill(0);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${ML_SERVICE_URL}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ML service error: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.warn('[EmbeddingService] Embed failed, using fallback:', (error as Error).message);
      return new Array(384).fill(0);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.serviceAvailable) {
      return texts.map(() => new Array(384).fill(0));
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(`${ML_SERVICE_URL}/embed/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ML service error: ${response.status}`);
      }

      const data = await response.json();
      return data.embeddings;
    } catch (error) {
      console.warn('[EmbeddingService] Batch embed failed, using fallback:', (error as Error).message);
      return texts.map(() => new Array(384).fill(0));
    }
  }

  async analyzeSentiment(text: string): Promise<SentimentResult> {
    if (!this.serviceAvailable) {
      // Return neutral sentiment as fallback
      return { valence: 0, arousal: 0.3 };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${ML_SERVICE_URL}/sentiment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ML service error: ${response.status}`);
      }

      const data = await response.json();
      return {
        valence: data.valence,
        arousal: data.arousal,
      };
    } catch (error) {
      console.warn('[EmbeddingService] Sentiment failed, using fallback:', (error as Error).message);
      return { valence: 0, arousal: 0.3 };
    }
  }

  isServiceAvailable(): boolean {
    return this.serviceAvailable;
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();
