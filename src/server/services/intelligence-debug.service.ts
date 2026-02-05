// src/server/services/intelligence-debug.service.ts
/**
 * Intelligence Debug Service
 *
 * Collects debug information for the intelligence system
 */

import { memoryRepository } from '../../db/repositories/memory.repository';
import { emotionRepository } from '../../db/repositories/emotion.repository';
import { memoryService } from './memory.service';
import { emotionService } from './emotion.service';
import { chatService } from './chat.service';
import type { Character } from '../../db/schema/characters';

export interface DebugPerformanceMetrics {
  embeddingLatency: number;
  retrievalLatency: number;
  emotionAnalysisLatency: number;
  promptBuildLatency: number;
  lastPromptTokenCount: number;
}

export interface MemoryRetrievalResult {
  id: string;
  content: string;
  type: string;
  score: number;
  similarity: number;
  importance: number;
  recency: number;
}

export interface LastRetrieval {
  query: string;
  results: MemoryRetrievalResult[];
  timestamp: string;
  latencyMs: number;
}

export interface IntelligenceDebugState {
  currentEmotion: {
    valence: number;
    arousal: number;
    label: string;
    updatedAt: string;
  } | null;
  memoryStats: {
    total: number;
    byType: Record<string, number>;
    lastExtractedAt: string | null;
  };
  lastRetrieval: LastRetrieval | null;
  performance: DebugPerformanceMetrics;
  messageCounter: number;
  extractionThreshold: number;
}

export interface SystemPromptDetails {
  fullPrompt: string;
  sections: {
    characterBase: string;
    memories: string | null;
    emotion: string | null;
    guidelines: string;
  };
  tokenCount: {
    total: number;
    characterBase: number;
    memories: number;
    emotion: number;
    guidelines: number;
  };
}

class IntelligenceDebugService {
  // In-memory storage for debug data (per chat)
  private debugData: Map<string, {
    lastRetrieval: LastRetrieval | null;
    performance: DebugPerformanceMetrics;
    messageCounter: number;
    lastExtractedAt: string | null;
  }> = new Map();

  private getOrCreateDebugData(chatId: string) {
    if (!this.debugData.has(chatId)) {
      this.debugData.set(chatId, {
        lastRetrieval: null,
        performance: {
          embeddingLatency: 0,
          retrievalLatency: 0,
          emotionAnalysisLatency: 0,
          promptBuildLatency: 0,
          lastPromptTokenCount: 0,
        },
        messageCounter: 0,
        lastExtractedAt: null,
      });
    }
    return this.debugData.get(chatId)!;
  }

  // Record retrieval event
  recordRetrieval(chatId: string, query: string, results: MemoryRetrievalResult[], latencyMs: number) {
    const data = this.getOrCreateDebugData(chatId);
    data.lastRetrieval = {
      query,
      results,
      timestamp: new Date().toISOString(),
      latencyMs,
    };
  }

  // Record performance metric
  recordLatency(chatId: string, metric: keyof DebugPerformanceMetrics, value: number) {
    const data = this.getOrCreateDebugData(chatId);
    data.performance[metric] = value;
  }

  // Increment message counter
  incrementMessageCounter(chatId: string): number {
    const data = this.getOrCreateDebugData(chatId);
    data.messageCounter++;
    return data.messageCounter;
  }

  // Reset message counter after extraction
  resetMessageCounter(chatId: string) {
    const data = this.getOrCreateDebugData(chatId);
    data.messageCounter = 0;
    data.lastExtractedAt = new Date().toISOString();
  }

  // Get full debug state
  async getDebugState(
    chatId: string,
    characterId: string,
    userId: string
  ): Promise<IntelligenceDebugState> {
    const data = this.getOrCreateDebugData(chatId);

    // Get current emotion
    const emotion = await emotionService.getCurrentEmotion(characterId, userId, chatId);

    // Get memory stats
    const memories = await memoryRepository.findByCharacterAndUser(characterId, userId, 1000);
    const byType: Record<string, number> = { fact: 0, preference: 0, relationship: 0, event: 0 };
    for (const mem of memories) {
      byType[mem.type] = (byType[mem.type] || 0) + 1;
    }

    return {
      currentEmotion: emotion ? {
        valence: emotion.valence,
        arousal: emotion.arousal,
        label: emotion.label,
        updatedAt: new Date().toISOString(),
      } : null,
      memoryStats: {
        total: memories.length,
        byType,
        lastExtractedAt: data.lastExtractedAt,
      },
      lastRetrieval: data.lastRetrieval,
      performance: data.performance,
      messageCounter: data.messageCounter,
      extractionThreshold: 10,
    };
  }

  // Get system prompt details
  async getSystemPromptDetails(
    character: Character,
    characterId: string,
    userId: string,
    chatId: string,
    userMessage: string
  ): Promise<SystemPromptDetails> {
    // Build sections separately
    const cardData = (character.cardData as Record<string, string>) || {};

    // Character base
    const characterBaseParts: string[] = [];
    characterBaseParts.push(`You are ${character.name}.`);
    if (character.description) characterBaseParts.push(character.description);
    if (cardData.personality) characterBaseParts.push(`Personality: ${cardData.personality}`);
    if (cardData.scenario) characterBaseParts.push(`Scenario: ${cardData.scenario}`);
    if (cardData.system_prompt) characterBaseParts.push(cardData.system_prompt);
    const characterBase = characterBaseParts.join('\n');

    // Memories section
    let memoriesSection: string | null = null;
    const memories = await memoryService.retrieveMemories({
      characterId,
      userId,
      query: userMessage,
      limit: 5,
    });

    if (memories.length > 0) {
      const memoryParts: string[] = ['## 关于用户的记忆'];
      const memoryByType: Record<string, string[]> = { fact: [], preference: [], relationship: [], event: [] };
      for (const mem of memories) {
        memoryByType[mem.type]?.push(mem.content);
      }
      if (memoryByType.fact.length > 0) memoryParts.push(`【事实】${memoryByType.fact.join('；')}`);
      if (memoryByType.preference.length > 0) memoryParts.push(`【偏好】${memoryByType.preference.join('；')}`);
      if (memoryByType.relationship.length > 0) memoryParts.push(`【关系】${memoryByType.relationship.join('；')}`);
      if (memoryByType.event.length > 0) memoryParts.push(`【事件】${memoryByType.event.join('；')}`);
      memoriesSection = memoryParts.join('\n');
    }

    // Emotion section
    let emotionSection: string | null = null;
    const emotion = await emotionService.getCurrentEmotion(characterId, userId, chatId);
    if (emotion) {
      emotionSection = `## 当前情感状态\n当前情感: ${emotion.label}, Valence: ${emotion.valence.toFixed(2)}, Arousal: ${emotion.arousal.toFixed(2)}`;
    }

    // Guidelines
    const guidelines = `## 行为指引
- 根据记忆中的信息个性化回复
- 保持情感状态的一致性，情感变化应自然过渡
- 可以主动提及相关记忆，但不要生硬
Stay in character at all times.`;

    // Build full prompt
    const fullPromptParts = [characterBase];
    if (memoriesSection) fullPromptParts.push('\n' + memoriesSection);
    if (emotionSection) fullPromptParts.push('\n' + emotionSection);
    fullPromptParts.push('\n' + guidelines);
    const fullPrompt = fullPromptParts.join('\n');

    // Estimate token counts (rough: 1 token ≈ 4 chars for English, 2 chars for Chinese)
    const estimateTokens = (text: string): number => {
      const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const otherChars = text.length - chineseChars;
      return Math.ceil(chineseChars / 2 + otherChars / 4);
    };

    return {
      fullPrompt,
      sections: {
        characterBase,
        memories: memoriesSection,
        emotion: emotionSection,
        guidelines,
      },
      tokenCount: {
        total: estimateTokens(fullPrompt),
        characterBase: estimateTokens(characterBase),
        memories: memoriesSection ? estimateTokens(memoriesSection) : 0,
        emotion: emotionSection ? estimateTokens(emotionSection) : 0,
        guidelines: estimateTokens(guidelines),
      },
    };
  }

  // Clear debug data for a chat
  clearDebugData(chatId: string) {
    this.debugData.delete(chatId);
  }
}

export const intelligenceDebugService = new IntelligenceDebugService();
