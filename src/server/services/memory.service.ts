/**
 * Memory Service
 *
 * Manages character memories: retrieval, storage, and extraction
 */

import { memoryRepository, type MemoryWithScore } from '../../db/repositories/memory.repository';
import { embeddingService } from './embedding.service';
import { logger } from './logger.service';
import { llmService } from './llm.service';
import { getDefaultModel } from '../config/llm.config';
import { config } from '../../core/config';
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
  chatId?: string;  // Optional: filter by chat session for isolation
  limit?: number;
}

export interface ScoredMemory {
  id: string;
  content: string;
  type: string;
  score: number;
  similarity?: number;
  importanceScore?: number;
  recencyScore?: number;
}

// Memory limits by subscription tier
const MEMORY_LIMITS: Record<string, number> = {
  free: config.memoryLimitFree,
  pro: config.memoryLimitPro,
  team: config.memoryLimitTeam,
};

export class MemoryService {
  async retrieveStoryPreferences(characterId: string, userId: string, chatId: string): Promise<ScoredMemory[]> {
    const memories = await memoryRepository.findStoryPreferences(characterId, userId, chatId);
    return memories.map(memory => ({ id: memory.id, content: memory.content, type: memory.type, score: 0 }));
  }

  async retrieveMemories(query: MemoryQuery): Promise<ScoredMemory[]> {
    const { characterId, userId, query: queryText, chatId, limit = 10 } = query;

    // Generate embedding for query
    const embedding = await embeddingService.embed(queryText);

    // Hybrid search with optional chatId filter for session isolation
    const memories = await memoryRepository.hybridSearch({
      characterId,
      userId,
      embedding,
      chatId: chatId ?? null,
      limit,
    });

    // Update access times (batch)
    const memoryIds = memories.map((m) => m.id);
    await memoryRepository.updateAccessTimeBatch(memoryIds);

    return memories.map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      score: m.score,
      similarity: m.similarity ?? (m as any).similarity,
      importanceScore: m.decayedImportance ?? (m as any).decayed_importance,
      recencyScore: m.recency ?? (m as any).recency,
    }));
  }

  async storeMemory(
    characterId: string,
    userId: string,
    memory: MemoryFact,
    chatId?: string,
    subscriptionTier = 'free'
  ): Promise<void> {
    // Generate embedding first (needed for both dedup check and storage)
    const embedding = await embeddingService.embed(memory.content);

    // Check for semantic duplicates (similarity >= 0.85)
    const similar = await memoryRepository.findSimilar(
      characterId, userId, embedding, 0.85, 1, chatId ?? null
    );

    if (similar.length > 0) {
      const existing = similar[0];
      // Merge: keep the longer/newer content, boost importance
      const mergedImportance = Math.min(1, Math.max(
        memory.importance,
        Number(existing.importance ?? 0.5)
      ) + 0.1);

      const mergedContent = memory.content.length > existing.content.length
        ? memory.content
        : existing.content;

      await memoryRepository.updateContent(existing.id, mergedContent, String(mergedImportance));
      if (mergedContent === memory.content) await memoryRepository.updateVector(existing.id, embedding);
      return;
    }

    // Check memory limit
    const currentCount = await memoryRepository.countByCharacterUser(characterId, userId, chatId ?? null);
    const limit = MEMORY_LIMITS[subscriptionTier] ?? MEMORY_LIMITS.free;

    if (currentCount >= limit) {
      await memoryRepository.deleteOldest(characterId, userId, 1, chatId ?? null);
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

    // Store embedding
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
    const confirmedMessages = messages.filter(message =>
      !['interrupted', 'proposed'].includes(String((message.extra as Record<string, unknown> | null)?.stateStatus))
    );
    if (confirmedMessages.length === 0) return [];

    // Format messages for LLM
    const conversationText = confirmedMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `分析以下对话，只提取这次故事内有明确依据的连续性信息。角色身份、资产与经历属于此次虚构故事，不是用户在现实世界的个人事实。

对话内容:
${conversationText}

请以 JSON 格式输出:
{
  "facts": ["事实性信息..."],
  "preferences": ["用户偏好..."],
  "relationships": ["关系信息..."],
  "events": ["重要事件..."]
}

只提取明确表达的信息，不要推断玩家的情绪、同意或关系。传闻标注为传闻，意图和未完成行动不能写成事实；中止片段不得提取为已完成事件。摘要不能覆盖结构化确认状态。每个类别最多3条。`;

    try {
      const response = await llmService.chatCompletion({
        model: getDefaultModel() || 'glm-4.5-air',
        messages: [
          { role: 'system', content: 'You are a memory extraction assistant. Output valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        temperature: 0.3,
        n: 1,
        presence_penalty: 0,
        frequency_penalty: 0,
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
      logger.error('Failed to extract memories', error as Error);
      return [];
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    await memoryRepository.delete(memoryId);
  }

  async clearAllMemories(characterId: string, userId: string, chatId?: string): Promise<void> {
    await memoryRepository.deleteAllForCharacterUser(characterId, userId, chatId ?? null);
  }

  async getMemories(characterId: string, userId: string, limit = 100, chatId?: string) {
    return await memoryRepository.findByCharacterAndUser(characterId, userId, limit, chatId ?? null);
  }

  async getMemoryCount(characterId: string, userId: string, chatId?: string): Promise<number> {
    return await memoryRepository.countByCharacterUser(characterId, userId, chatId ?? null);
  }

  async promoteSessionMemories(
    characterId: string,
    userId: string,
    minImportance = 0.7,
    minAccessCount = 2
  ): Promise<{ promoted: number; skipped: number }> {
    const candidates = await memoryRepository.findPromotionCandidates(
      characterId, userId, minImportance, minAccessCount
    );

    let promoted = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      // Check if a similar global memory already exists
      const embedding = await embeddingService.embed(candidate.content);
      const similar = await memoryRepository.findSimilar(
        characterId, userId, embedding, 0.85, 1
      );

      // If a global (no sourceChatId) similar memory exists, skip
      const hasGlobalDuplicate = similar.some(s =>
        s.id !== candidate.id && !s.sourceChatId
      );

      if (hasGlobalDuplicate) {
        skipped++;
        continue;
      }

      await memoryRepository.promoteToGlobal(candidate.id);
      promoted++;
    }

    return { promoted, skipped };
  }
}

export const memoryService = new MemoryService();
