/**
 * Chat Summarization Service
 *
 * Automatically summarizes older messages when context window is full.
 * Maintains conversation coherence while allowing infinite chat length.
 */

import { llmService } from './llm.service';
import { createLogger } from './logger.service';
import { countTokens } from '../utils/tokens';
import type { Message } from '../../db/schema/chats';

const logger = createLogger({ service: 'summarization' });

export interface SummarizationOptions {
  maxSummaryTokens?: number;
  minMessagesToSummarize?: number;
  summaryStyle?: 'concise' | 'detailed';
}

export interface SummarizationResult {
  summary: string;
  summarizedCount: number;
  summaryTokens: number;
  originalTokens: number;
}

class SummarizationService {
  /**
   * Summarize a range of messages
   */
  async summarizeMessages(
    messages: Message[],
    options: SummarizationOptions = {}
  ): Promise<SummarizationResult> {
    const {
      maxSummaryTokens = 500,
      minMessagesToSummarize = 10,
      summaryStyle = 'concise',
    } = options;

    if (messages.length < minMessagesToSummarize) {
      throw new Error(`Need at least ${minMessagesToSummarize} messages to summarize`);
    }

    // Calculate original token count
    const originalTokens = messages.reduce((sum, msg) => {
      return sum + countTokens(msg.content);
    }, 0);

    // Build conversation text
    const conversationText = messages
      .map((msg) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');

    // Create summarization prompt
    const summaryPrompt = this.buildSummaryPrompt(conversationText, summaryStyle, maxSummaryTokens);

    // Call LLM to generate summary
    const response = await llmService.chatCompletion({
      messages: [
        { role: 'system', content: summaryPrompt },
        { role: 'user', content: conversationText },
      ],
      model: 'glm-4.5-air', // Use fast model for summarization
      temperature: 0.3, // Lower temperature for factual summary
      max_tokens: maxSummaryTokens,
    });

    const summary = response.choices[0]?.message?.content || '';
    const summaryTokens = countTokens(summary);

    logger.info('Messages summarized', {
      messageCount: messages.length,
      originalTokens,
      summaryTokens,
      compressionRatio: (originalTokens / summaryTokens).toFixed(2),
    });

    return {
      summary,
      summarizedCount: messages.length,
      summaryTokens,
      originalTokens,
    };
  }

  /**
   * Determine if summarization is needed based on context usage
   */
  shouldSummarize(
    totalTokens: number,
    contextWindow: number,
    threshold: number = 0.8
  ): boolean {
    const usage = totalTokens / contextWindow;
    return usage >= threshold;
  }

  /**
   * Find the optimal split point for summarization
   * Returns the index where to split (messages before this index will be summarized)
   */
  findSplitPoint(
    messages: Message[],
    targetTokenReduction: number,
    minMessagesToKeep: number = 10
  ): number {
    let accumulatedTokens = 0;
    let splitIndex = 0;

    // Start from the beginning and accumulate tokens until we reach the target
    for (let i = 0; i < messages.length - minMessagesToKeep; i++) {
      accumulatedTokens += countTokens(messages[i].content);
      if (accumulatedTokens >= targetTokenReduction) {
        splitIndex = i + 1;
        break;
      }
    }

    return Math.max(splitIndex, 1); // At least summarize 1 message
  }

  /**
   * Build the summarization prompt
   */
  private buildSummaryPrompt(
    conversationText: string,
    style: 'concise' | 'detailed',
    maxTokens: number
  ): string {
    const styleInstructions = style === 'concise'
      ? 'Create a brief, factual summary focusing on key events, decisions, and information exchanged.'
      : 'Create a detailed summary that captures the main topics, character interactions, emotional tone, and important details.';

    return `You are a conversation summarizer. Your task is to summarize the following conversation.

${styleInstructions}

Requirements:
- Maximum length: ${maxTokens} tokens
- Use third person perspective
- Preserve important facts, names, and context
- Maintain chronological order
- Focus on content that would be useful for continuing the conversation

Format the summary as a single paragraph or a few short paragraphs.`;
  }

  /**
   * Create a summary message object
   */
  createSummaryMessage(summary: string, summarizedCount: number): Partial<Message> {
    return {
      role: 'system',
      content: `[Summary of previous ${summarizedCount} messages]\n\n${summary}`,
    };
  }
}

export const summarizationService = new SummarizationService();
