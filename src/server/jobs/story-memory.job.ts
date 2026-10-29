import { z } from 'zod';
import { db } from '../../db';
import { config } from '../../core/config';
import { findProviderForModel, getDefaultModel, getModelMeta } from '../config/llm.config';
import { llmService } from '../services/llm.service';
import { embeddingService } from '../services/embedding.service';
import { StoryMemoryWorker } from '../services/story-memory-worker.service';
import { storyMemoryPrompt, parseStoryMemoryResponse } from '../services/story-memory-extraction';
import { assertContextBudget, estimateContextMessages } from '../services/context-budget';

const settings = z.object({
  enabled: z.enum(['true', 'false']).default('true'),
  maxAttempts: z.coerce.number().int().min(1).max(5).default(3),
  timeoutMs: z.coerce.number().int().min(1000).max(60000).default(30000),
  maxInputChars: z.coerce.number().int().min(1000).max(48000).default(24000),
}).parse({ enabled: process.env.STORY_MEMORY_JOBS_ENABLED, maxAttempts: process.env.STORY_MEMORY_MAX_ATTEMPTS,
  timeoutMs: process.env.STORY_MEMORY_TIMEOUT_MS, maxInputChars: process.env.STORY_MEMORY_MAX_INPUT_CHARS });

const worker = new StoryMemoryWorker(db, {
  async extract(sources, signal) {
    const model = getDefaultModel();
    if (!model) throw new Error('STORY_MEMORY_MODEL_UNAVAILABLE');
    const messages = [{ role: 'system' as const, content: 'Extract only sourced fictional story continuity. Output the specified versioned JSON object.' },
      { role: 'user' as const, content: storyMemoryPrompt(sources) }];
    const limits = getModelMeta(model);
    const maxTokens = Math.min(2000, limits.maxOutputTokens);
    assertContextBudget(estimateContextMessages(messages) + 2, limits, 'payload', maxTokens);
    const response = await llmService.chatCompletion({ model, stream: false, temperature: 0.2, max_tokens: maxTokens,
      ...(findProviderForModel(model)?.apiFormat === 'gemini' ? { response_format: { type: 'json_object' as const } } : {}),
      n: 1, presence_penalty: 0, frequency_penalty: 0,
      messages,
    }, { signal, maxAttempts: 1 });
    return parseStoryMemoryResponse(response.choices[0]?.message?.content ?? '');
  },
  embed: (texts, signal) => embeddingService.embedBatchStrict(texts, signal),
}, { ...settings, memoryLimit: Math.max(1, config.memoryLimitFree) });

let running = false;
export async function runStoryMemory(): Promise<void> {
  if (running || settings.enabled === 'false') return;
  running = true;
  try {
    const result = await worker.runOnce();
    if (result === 'retry' || result === 'failed') throw new Error(`Story memory derivation ${result}; inspect persisted job error_code`);
  }
  finally { running = false; }
}
