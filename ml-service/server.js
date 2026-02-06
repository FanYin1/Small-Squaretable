/**
 * ML Microservice
 *
 * Provides embedding and sentiment analysis via HTTP API
 * Runs as a separate process, transparent to users
 */

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure proxy for Node.js fetch using undici
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
if (proxyUrl) {
  console.log(`[ML Service] Configuring proxy: ${proxyUrl}`);
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    const dispatcher = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(dispatcher);
    console.log(`[ML Service] Proxy configured successfully`);
  } catch (e) {
    console.error(`[ML Service] Failed to configure proxy:`, e.message);
  }
}

// Import transformers AFTER proxy is configured
const { pipeline, env } = await import('@xenova/transformers');

// Configure model cache - use parent directory's models folder
env.cacheDir = path.join(__dirname, '..', 'models');
env.allowLocalModels = true;

const PORT = process.env.ML_SERVICE_PORT || 3001;

// Model instances
let embeddingPipeline = null;
let sentimentPipeline = null;
let initialized = false;

const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const SENTIMENT_MODEL = 'Xenova/bert-base-multilingual-uncased-sentiment';

async function initialize() {
  if (initialized) return;

  try {
    console.log('[ML Service] Loading embedding model...');
    embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL);
    console.log('[ML Service] Embedding model loaded');

    console.log('[ML Service] Loading sentiment model...');
    sentimentPipeline = await pipeline('sentiment-analysis', SENTIMENT_MODEL);
    console.log('[ML Service] Sentiment model loaded');

    initialized = true;
    console.log('[ML Service] All models initialized');
  } catch (error) {
    console.error('[ML Service] Model initialization failed:', error.message);
    console.log('[ML Service] Models will be loaded on first request');
    // Don't throw - allow service to start and retry on request
  }
}

async function embed(text) {
  if (!embeddingPipeline) {
    await initialize();
  }

  const output = await embeddingPipeline(text, {
    pooling: 'mean',
    normalize: true,
  });

  return Array.from(output.data);
}

async function analyzeSentiment(text) {
  if (!sentimentPipeline) {
    await initialize();
  }

  const result = await sentimentPipeline(text);
  const sentiment = result[0];

  // Convert to valence-arousal
  // bert-base-multilingual-uncased-sentiment outputs 1-5 stars
  // Map: 1 star = -1, 3 stars = 0, 5 stars = 1
  let valence;
  const starMatch = sentiment.label.match(/(\d+)/);
  if (starMatch) {
    const stars = parseInt(starMatch[1], 10);
    valence = (stars - 3) / 2;  // 1->-1, 2->-0.5, 3->0, 4->0.5, 5->1
  } else if (sentiment.label === 'positive') {
    valence = sentiment.score;
  } else if (sentiment.label === 'negative') {
    valence = -sentiment.score;
  } else {
    valence = 0;
  }

  const arousal = Math.abs(sentiment.score - 0.5) * 2;

  return {
    valence: Math.max(-1, Math.min(1, valence)),
    arousal: Math.max(0, Math.min(1, arousal)),
    label: sentiment.label,
    score: sentiment.score,
  };
}

// Parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Health check
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        initialized,
        models: {
          embedding: EMBEDDING_MODEL,
          sentiment: SENTIMENT_MODEL,
        },
      }));
      return;
    }

    // Embedding endpoint
    if (req.url === '/embed' && req.method === 'POST') {
      const { text } = await parseBody(req);
      if (!text) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'text is required' }));
        return;
      }

      const startTime = Date.now();
      const embedding = await embed(text);
      const latency = Date.now() - startTime;

      res.writeHead(200);
      res.end(JSON.stringify({
        embedding,
        dimensions: embedding.length,
        latencyMs: latency,
      }));
      return;
    }

    // Sentiment endpoint
    if (req.url === '/sentiment' && req.method === 'POST') {
      const { text } = await parseBody(req);
      if (!text) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'text is required' }));
        return;
      }

      const startTime = Date.now();
      const result = await analyzeSentiment(text);
      const latency = Date.now() - startTime;

      res.writeHead(200);
      res.end(JSON.stringify({
        ...result,
        latencyMs: latency,
      }));
      return;
    }

    // Batch embedding endpoint
    if (req.url === '/embed/batch' && req.method === 'POST') {
      const { texts } = await parseBody(req);
      if (!texts || !Array.isArray(texts)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'texts array is required' }));
        return;
      }

      const startTime = Date.now();
      const embeddings = await Promise.all(texts.map(t => embed(t)));
      const latency = Date.now() - startTime;

      res.writeHead(200);
      res.end(JSON.stringify({
        embeddings,
        count: embeddings.length,
        latencyMs: latency,
      }));
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (error) {
    console.error('[ML Service] Error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

// Start server
server.listen(PORT, async () => {
  console.log(`[ML Service] Starting on port ${PORT}...`);

  // Pre-load models on startup
  try {
    await initialize();
    console.log(`[ML Service] Ready at http://localhost:${PORT}`);
  } catch (error) {
    console.error('[ML Service] Failed to initialize models:', error);
  }
});
