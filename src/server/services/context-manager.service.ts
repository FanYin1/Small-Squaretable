/**
 * Context Window Manager
 *
 * Manages message truncation to fit within model context limits.
 * Uses a sliding window strategy: keeps system prompt + most recent messages.
 * Supports automatic summarization for long conversations.
 */

import { countTokens, countMessagesTokens } from '../utils/tokens';
import { AppError } from '../../core/errors';
import { assertContextBudget, estimateContextMessages } from './context-budget';
import { getModelMeta } from '../config/llm.config';
import { createLogger } from './logger.service';
import { summarizationService } from './summarization.service';
import type { Message } from '../../db/schema/chats';
import { injectAtDepth as injectAtDepthPure, type AtDepthEntry } from './prompt-assembly';

const logger = createLogger({ service: 'context-manager' });

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  pinned?: boolean;
  importance?: number;
  messageId?: number;
}

export interface ContextBuildResult {
  messages: LLMMessage[];
  totalTokens: number;
  truncated: boolean;
  truncatedCount: number;
  summarized?: boolean;
  summaryTokens?: number;
}

export class ContextManager {
  /**
   * Build a context-aware message array that fits within the model's token budget.
   *
   * @param systemPrompt - The system prompt text
   * @param messages - All chat messages in chronological order
   * @param model - Model name to look up context window size
   * @param reservedTokens - Estimated budget for all content injected after history selection.
   * @returns ContextBuildResult with trimmed messages and metadata
   */
  buildContext(
    systemPrompt: string,
    messages: LLMMessage[],
    model: string,
    reservedTokens: number = 0
  ): ContextBuildResult {
    const meta = getModelMeta(model);
    if (!Number.isSafeInteger(reservedTokens) || reservedTokens < 0) {
      throw new AppError('The reserved context budget is invalid.', 500, 'CONTEXT_CONFIG_INVALID');
    }
    const system: LLMMessage = { role: 'system', content: systemPrompt };
    const fixedTokens = estimateContextMessages([system]) + 2 + reservedTokens;
    const availableTokens = assertContextBudget(fixedTokens, meta, 'critical');
    const allTokens = fixedTokens + estimateContextMessages(messages);
    if (allTokens <= availableTokens) {
      const complete = [system, ...messages];
      return { messages: complete, totalTokens: countMessagesTokens(complete), truncated: false, truncatedCount: 0 };
    }

    const turns: LLMMessage[][] = [];
    for (const message of messages) {
      if (message.role === 'user' || turns.length === 0) turns.push([]);
      turns[turns.length - 1].push(message);
    }
    const latest = turns.length - 1;
    const selected = new Set<number>();
    let usedTokens = fixedTokens;
    if (latest >= 0) {
      usedTokens += estimateContextMessages(turns[latest]);
      assertContextBudget(usedTokens, meta, 'latest');
      selected.add(latest);
    }
    for (const [index, turn] of turns.entries()) {
      if (index === latest || !turn.some(message => message.pinned)) continue;
      usedTokens += estimateContextMessages(turn);
      selected.add(index);
    }
    assertContextBudget(usedTokens, meta, 'pinned');

    const notice = (count: number): LLMMessage => ({ role: 'system',
      content: `[${count} earlier messages are omitted from this request only. The saved history remains available. Do not infer events from the omission.]` });
    const noticeTokens = estimateContextMessages([notice(messages.length)]);
    assertContextBudget(usedTokens + noticeTokens, meta, 'payload');
    usedTokens += noticeTokens;
    const recentBoundary = Math.max(0, messages.length - 20);
    let position = 0;
    const ranked = turns.map((turn, index) => {
      position += turn.length;
      return { index, turn, recent: position > recentBoundary,
        importance: Math.max(...turn.map(message => message.importance ?? 5)) };
    }).filter(candidate => !selected.has(candidate.index)).sort((left, right) =>
      Number(right.recent) - Number(left.recent) ||
      (left.recent ? right.index - left.index : right.importance - left.importance || right.index - left.index));
    for (const candidate of ranked) {
      const tokens = estimateContextMessages(candidate.turn);
      if (usedTokens + tokens > availableTokens) continue;
      selected.add(candidate.index);
      usedTokens += tokens;
    }
    const included = turns.flatMap((turn, index) => selected.has(index) ? turn : []);
    const truncatedCount = messages.length - included.length;
    const result = [system, ...(truncatedCount ? [notice(truncatedCount)] : []), ...included];
    assertContextBudget(estimateContextMessages(result) + 2 + reservedTokens, meta);
    logger.info('Context built within estimated budget', {
      model, includedMessages: included.length, truncatedCount,
    });
    return { messages: result, totalTokens: countMessagesTokens(result), truncated: truncatedCount > 0, truncatedCount };
  }

  /**
   * Inject atDepth entries into a built message array.
   * Depth N means insert N messages from the end of the conversation
   * (after the system prompt). Entries are sorted by depth descending
   * so deeper entries don't shift shallower ones.
   */
  injectAtDepth(messages: LLMMessage[], entries: AtDepthEntry[]): LLMMessage[] {
    return injectAtDepthPure(messages, entries);
  }

  /**
   * Build context with automatic summarization support
   * If context is too full, summarizes older messages
   */
  async buildContextWithSummarization(
    systemPrompt: string,
    messages: LLMMessage[],
    model: string,
    enableSummarization: boolean = true,
    reservedTokens: number = 0
  ): Promise<ContextBuildResult> {
    const meta = getModelMeta(model);
    const BUFFER_TOKENS = 100;
    const systemTokens = countTokens(systemPrompt) + 4;
    const maxResponseTokens = meta.maxOutputTokens;
    const availableBudget =
      meta.contextWindow - systemTokens - maxResponseTokens - BUFFER_TOKENS - reservedTokens;

    // First try without summarization
    const initialResult = this.buildContext(systemPrompt, messages, model, reservedTokens);

    // If not truncated or summarization disabled, return as-is
    if (!initialResult.truncated || !enableSummarization) {
      return initialResult;
    }

    // Calculate how many tokens we need to free up
    const allMessagesTokens = messages.reduce((sum, msg) => {
      return sum + countTokens(msg.content) + 4;
    }, 0);
    const targetReduction = allMessagesTokens - availableBudget + 500; // +500 for summary

    // Find split point
    const splitIndex = summarizationService.findSplitPoint(
      messages as Message[],
      targetReduction,
      10 // Keep at least 10 recent messages
    );

    if (splitIndex <= 0) {
      // Can't summarize, return original result
      return initialResult;
    }

    try {
      // Summarize older messages
      const toSummarize = messages.slice(0, splitIndex) as Message[];
      const summaryResult = await summarizationService.summarizeMessages(toSummarize, {
        maxSummaryTokens: 500,
        summaryStyle: 'detailed',
      });

      // Create new message array with summary + recent messages
      const summaryMessage = summarizationService.createSummaryMessage(
        summaryResult.summary,
        summaryResult.summarizedCount
      );
      const recentMessages = messages.slice(splitIndex);
      const messagesWithSummary = [
        summaryMessage as LLMMessage,
        ...recentMessages,
      ];

      // Build context with summarized messages
      const result = this.buildContext(systemPrompt, messagesWithSummary, model, reservedTokens);

      logger.info('Context built with summarization', {
        originalMessages: messages.length,
        summarizedMessages: summaryResult.summarizedCount,
        recentMessages: recentMessages.length,
        summaryTokens: summaryResult.summaryTokens,
        compressionRatio: (summaryResult.originalTokens / summaryResult.summaryTokens).toFixed(2),
      });

      return {
        ...result,
        summarized: true,
        summaryTokens: summaryResult.summaryTokens,
      };
    } catch (error) {
      logger.error('Summarization failed, falling back to truncation', { error });
      return initialResult;
    }
  }
}

export const contextManager = new ContextManager();
