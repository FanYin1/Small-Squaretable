/**
 * Context Window Manager
 *
 * Manages message truncation to fit within model context limits.
 * Uses a sliding window strategy: keeps system prompt + most recent messages.
 */

import { countTokens } from '../utils/tokens';
import { getModelMeta } from '../config/llm.config';
import { createLogger } from './logger.service';

const logger = createLogger({ service: 'context-manager' });

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ContextBuildResult {
  messages: LLMMessage[];
  totalTokens: number;
  truncated: boolean;
  truncatedCount: number;
}

export class ContextManager {
  /**
   * Build a context-aware message array that fits within the model's token budget.
   *
   * Strategy:
   * 1. System prompt is always included (never truncated)
   * 2. Calculate remaining budget: contextWindow - systemTokens - maxOutputTokens - buffer
   * 3. Add messages from newest to oldest until budget is exhausted
   * 4. If messages were truncated, prepend a notice
   *
   * @param systemPrompt - The system prompt text
   * @param messages - All chat messages in chronological order
   * @param model - Model name to look up context window size
   * @returns ContextBuildResult with trimmed messages and metadata
   */
  buildContext(
    systemPrompt: string,
    messages: LLMMessage[],
    model: string
  ): ContextBuildResult {
    const meta = getModelMeta(model);
    const BUFFER_TOKENS = 100; // safety buffer

    const systemTokens = countTokens(systemPrompt) + 4; // +4 for message overhead
    const maxResponseTokens = meta.maxOutputTokens;
    const availableBudget = meta.contextWindow - systemTokens - maxResponseTokens - BUFFER_TOKENS;

    if (availableBudget <= 0) {
      logger.warn('System prompt exceeds context budget', {
        systemTokens,
        contextWindow: meta.contextWindow,
        model,
      });
      // Still include system prompt and last message at minimum
      const result: LLMMessage[] = [{ role: 'system', content: systemPrompt }];
      if (messages.length > 0) {
        result.push(messages[messages.length - 1]);
      }
      return {
        messages: result,
        totalTokens: systemTokens + (messages.length > 0 ? countTokens(messages[messages.length - 1].content) + 4 : 0),
        truncated: messages.length > 1,
        truncatedCount: Math.max(0, messages.length - 1),
      };
    }

    // Add messages from newest to oldest
    const selectedMessages: LLMMessage[] = [];
    let usedTokens = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = countTokens(messages[i].content) + 4; // +4 per message overhead
      if (usedTokens + msgTokens > availableBudget) {
        break;
      }
      selectedMessages.unshift(messages[i]);
      usedTokens += msgTokens;
    }

    const truncatedCount = messages.length - selectedMessages.length;
    const truncated = truncatedCount > 0;

    // Build final message array
    const result: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

    if (truncated) {
      result.push({
        role: 'system',
        content: `[Earlier ${truncatedCount} messages were omitted due to context length limits]`,
      });
    }

    result.push(...selectedMessages);

    const totalTokens = systemTokens + usedTokens + (truncated ? 20 : 0); // 20 for truncation notice

    logger.info('Context built', {
      model,
      contextWindow: meta.contextWindow,
      systemTokens,
      messageTokens: usedTokens,
      totalMessages: messages.length,
      includedMessages: selectedMessages.length,
      truncated,
    });

    return { messages: result, totalTokens, truncated, truncatedCount };
  }
}

export const contextManager = new ContextManager();
