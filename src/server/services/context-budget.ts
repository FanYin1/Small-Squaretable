import { AppError } from '../../core/errors';
import type { ContextBudgetDetails } from '../../types/context-budget';
import { countTokens } from '../utils/tokens';

export const CONTEXT_BUFFER_TOKENS = 100;
export interface ContextLimits { contextWindow: number; maxOutputTokens: number }

export class ContextBudgetError extends AppError {
  constructor(details: ContextBudgetDetails) {
    super('The required story context exceeds the current model capacity. Review the input or model capacity before continuing.',
      422, 'CONTEXT_BUDGET_EXCEEDED', details);
  }
}

export function estimateContextTokens(content: string): number {
  return Math.max(countTokens(content), Math.ceil(Buffer.byteLength(content, 'utf8') / 3));
}

export function estimateContextMessages(messages: ReadonlyArray<{ content: string }> = []): number {
  return messages.reduce((total, message) => total + estimateContextTokens(message.content) + 4, 0);
}

export function assertContextBudget(requiredTokens: number, limits: ContextLimits,
  reason: ContextBudgetDetails['reason'] = 'payload', outputTokens = limits.maxOutputTokens): number {
  if (!Number.isSafeInteger(limits.contextWindow) || limits.contextWindow <= 0 ||
    !Number.isSafeInteger(outputTokens) || outputTokens < 0 || !Number.isSafeInteger(requiredTokens) || requiredTokens < 0) {
    throw new AppError('The model context configuration is invalid.', 500, 'CONTEXT_CONFIG_INVALID');
  }
  const availableTokens = Math.max(0, limits.contextWindow - outputTokens - CONTEXT_BUFFER_TOKENS);
  if (requiredTokens > availableTokens || limits.contextWindow < outputTokens + CONTEXT_BUFFER_TOKENS) {
    throw new ContextBudgetError({ reason, contextWindow: limits.contextWindow, outputTokens, requiredTokens, availableTokens });
  }
  return availableTokens;
}
