/**
 * Memory Service
 *
 * Manages character memories: retrieval, storage, and extraction
 */

import { memoryRepository, type MemoryWithScore } from '../../db/repositories/memory.repository';
import { embeddingService } from './embedding.service';
import { llmService } from './llm.service';
import type { Message } from '../../db/schema/chats';

export interface MemoryFact {
  type: 'fact' | 'preference' | 'relationship' | 'event';
  content: string;
  importance: number;
}

export interface MemoryQuery {
  characterId: string;
  userId: string;
  query: string;
  limit?: number;
}

export interface ScoredMemory {
  id: string;
  content: string;
  type: string;
  score: number;
}

// Memory limits by subscription tier
const MEMORY_LIMITS: Record<string, number> = {
  free: 100,
  pro: 500,
  team: 2000,
};

export class MemoryService {
  async retrieveMemories(query: MemoryQuery): Promise<ScoredMemory[]> {
    const { characterId, userId, query: queryText, limit = 10 } = query;

    // Generate embedding for query
    const embedding = await embeddingService.embed(queryText);

    // Hybrid search
    const memories = await memoryRepository.hybridSearch({
      characterId,
      userId,
      embedding,
      limit,
    });

    // Update access times
    for (const memory of memories) {
      await memoryRepository.updateAccessTime(memory.id);
    }

    return memories.map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      score: m.score,
    }));
  }

  async storeMemory(
    characterId: string,
    userId: string,
    memory: MemoryFact,
    chatId?: string,
    subscriptionTier = 'free'
  ): Promise<void> {
    // Check memory limit
    const currentCount = await memoryRepository.countByCharacterUser(characterId, userId);
    const limit = MEMORY_LIMITS[subscriptionTier] ?? MEMORY_LIMITS.free;

    if (currentCount >= limit) {
      // TODO: Implement LRU eviction
      console.warn(`Memory limit reached for character ${characterId}, user ${userId}`);
      return;
    }

    // Create memory record
    const created = await memoryRepository.create({
      characterId,
      userId,
      type: memory.type,
      content: memory.content,
      importance: String(memory.importance),
      sourceChatId: chatId,
    });

    // Generate and store embedding
    const embedding = await embeddingService.embed(memory.content);
    await memoryRepository.createVector({
      memoryId: created.id,
      embedding,
    });
  }

  async extractMemories(
    characterId: string,
    userId: string,
    messages: Message[]
  ): Promise<MemoryFact[]> {
    if (messages.length === 0) return [];

    // Format messages for LLM
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `分析以下对话，提取关于用户的记忆信息。

对话内容:
${conversationText}

请以 JSON 格式输出:
{
  "facts": ["事实性信息..."],
  "preferences": ["用户偏好..."],
  "relationships": ["关系信息..."],
  "events": ["重要事件..."]
}

只提取明确或可合理推断的信息，不要编造。每个类别最多3条。`;

    try {
      const response = await llmService.chatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a memory extraction assistant. Output valid JSON only.' },
          { role: 'user', content: prompt },
        ],
      });

      const content = response.choices[0]?.message?.content ?? '';
      const extracted = JSON.parse(content);
      const memories: MemoryFact[] = [];

      // Convert to MemoryFact array
      for (const fact of extracted.facts ?? []) {
        memories.push({ type: 'fact', content: fact, importance: 0.7 });
      }
      for (const pref of extracted.preferences ?? []) {
        memories.push({ type: 'preference', content: pref, importance: 0.6 });
      }
      for (const rel of extracted.relationships ?? []) {
        memories.push({ type: 'relationship', content: rel, importance: 0.8 });
      }
      for (const event of extracted.events ?? []) {
        memories.push({ type: 'event', content: event, importance: 0.5 });
      }

      return memories;
    } catch (error) {
      console.error('Failed to extract memories:', error);
      return [];
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    await memoryRepository.delete(memoryId);
  }

  async clearAllMemories(characterId: string, userId: string): Promise<void> {
    await memoryRepository.deleteAllForCharacterUser(characterId, userId);
  }

  async getMemories(characterId: string, userId: string, limit = 100) {
    return await memoryRepository.findByCharacterAndUser(characterId, userId, limit);
  }

  async getMemoryCount(characterId: string, userId: string): Promise<number> {
    return await memoryRepository.countByCharacterUser(characterId, userId);
  }
}

export const memoryService = new MemoryService();
