import { AppError } from '../../core/errors';
import type { ModelMeta } from '../../types/llm';

/** Administrator policy is the ceiling; individual calls may request less. */
export function resolveGenerationParameters(meta: ModelMeta, requested?: number): ModelMeta {
  const capability = meta.outputCapabilityTokens ?? meta.maxOutputTokens;
  if (![meta.contextWindow, meta.maxOutputTokens, capability].every(value => Number.isSafeInteger(value) && value > 0) ||
      meta.maxOutputTokens > capability || capability >= meta.contextWindow ||
      (meta.maxInputTokens !== undefined && (!Number.isSafeInteger(meta.maxInputTokens) || meta.maxInputTokens <= 0 || meta.maxInputTokens > meta.contextWindow))) {
    throw new AppError('Invalid model capacity configuration', 500, 'CONTEXT_CONFIG_INVALID');
  }
  if (requested !== undefined && (!Number.isSafeInteger(requested) || requested <= 0)) {
    throw new AppError('Output tokens must be a positive safe integer', 400, 'OUTPUT_LIMIT_INVALID');
  }
  return { ...meta, maxOutputTokens: Math.min(requested ?? meta.maxOutputTokens, meta.maxOutputTokens, capability) };
}
