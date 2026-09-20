/**
 * Context Window Manager
 *
 * Manages message truncation to fit within model context limits.
 * Uses a sliding window strategy: keeps system prompt + most recent messages.
 * Supports automatic summarization for long conversations.
 */

import { countTokens } from '../utils/tokens';
import { getModelMeta } from '../config/llm.config';
import { createLogger } from './logger.service';
import { summarizationService } from './summarization.service';
import type { Message } from '../../db/schema/chats';

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
   * Strategy:
   * 1. System prompt is always included (never truncated)
   * 2. Calculate remaining budget: contextWindow - systemTokens - maxOutputTokens - buffer
   * 3. Always include pinned messages (highest priority)
   * 4. Sort remaining messages by importance score (default: 5)
   * 5. Add messages from highest importance to lowest until budget is exhausted
   * 6. Preserve user/assistant pairs for coherence
   * 7. If messages were truncated, prepend a notice
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

    // Separate pinned and unpinned messages
    const pinnedMessages = messages.filter(m => m.pinned);
    const unpinnedMessages = messages.filter(m => !m.pinned);

    // Calculate tokens for pinned messages
    let pinnedTokens = 0;
    for (const msg of pinnedMessages) {
      pinnedTokens += countTokens(msg.content) + 4;
    }

    // Check if pinned messages exceed budget
    if (pinnedTokens > availableBudget) {
      logger.warn('Pinned messages exceed context budget', {
        pinnedTokens,
        availableBudget,
        pinnedCount: pinnedMessages.length,
      });
      // Include system prompt + pinned messages anyway (they're critical)
      const result: LLMMessage[] = [{ role: 'system', content: systemPrompt }, ...pinnedMessages];
      return {
        messages: result,
        totalTokens: systemTokens + pinnedTokens,
        truncated: unpinnedMessages.length > 0,
        truncatedCount: unpinnedMessages.length,
      };
    }

    // Remaining budget for unpinned messages
    const remainingBudget = availableBudget - pinnedTokens;

    // Smart selection: prioritize recent messages and high importance
    // Strategy: Take the most recent N messages, then sort by importance
    const RECENT_WINDOW = 20; // Always consider the last 20 messages
    const recentMessages = unpinnedMessages.slice(-RECENT_WINDOW);
    const olderMessages = unpinnedMessages.slice(0, -RECENT_WINDOW);

    // Sort older messages by importance (descending)
    const sortedOlderMessages = [...olderMessages].sort((a, b) => {
      const importanceA = a.importance ?? 5;
      const importanceB = b.importance ?? 5;
      return importanceB - importanceA;
    });

    // Combine: recent messages (in order) + important older messages
    const candidateMessages = [...sortedOlderMessages, ...recentMessages];

    // Select messages that fit in budget, preserving user/assistant pairs
    const selectedMessages: LLMMessage[] = [];
    let usedTokens = 0;
    const selectedIndices = new Set<number>();

    // First pass: add messages from newest to oldest
    for (let i = candidateMessages.length - 1; i >= 0; i--) {
      const msg = candidateMessages[i];
      const msgTokens = countTokens(msg.content) + 4;

      if (usedTokens + msgTokens <= remainingBudget) {
        selectedIndices.add(i);
        usedTokens += msgTokens;
      }
    }

    // Second pass: ensure user/assistant pairs are preserved
    // If we have an assistant message, try to include its preceding user message
    for (let i = 0; i < candidateMessages.length; i++) {
      if (selectedIndices.has(i) && candidateMessages[i].role === 'assistant' && i > 0) {
        const prevMsg = candidateMessages[i - 1];
        if (prevMsg.role === 'user' && !selectedIndices.has(i - 1)) {
          const msgTokens = countTokens(prevMsg.content) + 4;
          if (usedTokens + msgTokens <= remainingBudget) {
            selectedIndices.add(i - 1);
            usedTokens += msgTokens;
          }
        }
      }
    }

    // Build selected messages in chronological order
    for (let i = 0; i < candidateMessages.length; i++) {
      if (selectedIndices.has(i)) {
        selectedMessages.push(candidateMessages[i]);
      }
    }

    // Merge pinned and selected messages, maintaining chronological order
    // We need to interleave them based on their original positions
    const allSelectedMessages: LLMMessage[] = [];
    let pinnedIdx = 0;
    let selectedIdx = 0;

    for (const msg of messages) {
      if (msg.pinned && pinnedIdx < pinnedMessages.length && msg === pinnedMessages[pinnedIdx]) {
        allSelectedMessages.push(msg);
        pinnedIdx++;
      } else if (!msg.pinned && selectedIdx < selectedMessages.length && msg === selectedMessages[selectedIdx]) {
        allSelectedMessages.push(msg);
        selectedIdx++;
      }
    }

    const truncatedCount = messages.length - allSelectedMessages.length;
    const truncated = truncatedCount > 0;

    // Build final message array
    const result: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

    if (truncated) {
      result.push({
        role: 'system',
        content: `[Earlier ${truncatedCount} messages were omitted due to context length limits. ${pinnedMessages.length} pinned messages are always included.]`,
      });
    }

    result.push(...allSelectedMessages);

    const totalTokens = systemTokens + pinnedTokens + usedTokens + (truncated ? 30 : 0); // 30 for truncation notice

    logger.info('Context built with smart trimming', {
      model,
      contextWindow: meta.contextWindow,
      systemTokens,
      pinnedMessages: pinnedMessages.length,
      pinnedTokens,
      selectedMessages: selectedMessages.length,
      messageTokens: usedTokens,
      totalMessages: messages.length,
      includedMessages: allSelectedMessages.length,
      truncated,
    });

    return { messages: result, totalTokens, truncated, truncatedCount };
  }

  /**
   * Inject atDepth entries into a built message array.
   * Depth N means insert N messages from the end of the conversation
   * (after the system prompt). Entries are sorted by depth descending
   * so deeper entries don't shift shallower ones.
   */
  injectAtDepth(
    messages: LLMMessage[],
    entries: Array<{ depth: number; content: string; role: 'system' | 'user' | 'assistant' }>,
  ): LLMMessage[] {
    if (!entries || entries.length === 0) return messages;

    const result = [...messages];
    // Sort by depth descending so insertions don't shift indices
    const sorted = [...entries].sort((a, b) => b.depth - a.depth);

    for (const entry of sorted) {
      // Find the insertion point: depth N = N messages from the end
      // The first element is the system prompt, so conversation starts at index 1
      const conversationEnd = result.length;
      const insertIdx = Math.max(1, conversationEnd - entry.depth);
      result.splice(insertIdx, 0, { role: entry.role, content: entry.content });
    }

    return result;
  }

  /**
   * Build context with automatic summarization support
   * If context is too full, summarizes older messages
   */
  async buildContextWithSummarization(
    systemPrompt: string,
    messages: LLMMessage[],
    model: string,
    enableSummarization: boolean = true
  ): Promise<ContextBuildResult> {
    const meta = getModelMeta(model);
    const BUFFER_TOKENS = 100;
    const systemTokens = countTokens(systemPrompt) + 4;
    const maxResponseTokens = meta.maxOutputTokens;
    const availableBudget = meta.contextWindow - systemTokens - maxResponseTokens - BUFFER_TOKENS;

    // First try without summarization
    const initialResult = this.buildContext(systemPrompt, messages, model);

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
      const result = this.buildContext(systemPrompt, messagesWithSummary, model);

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
