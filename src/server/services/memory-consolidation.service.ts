import { memoryRepository } from '../../db/repositories/memory.repository';
import { embeddingService } from './embedding.service';
import { llmService } from './llm.service';
import { getDefaultModel } from '../config/llm.config';
import { logger } from './logger.service';
import type { CharacterMemory } from '../../db/schema/memories';

const consolidationLogger = logger.child({ module: 'memory-consolidation' });

export interface ConsolidationResult {
  clustersFound: number;
  memoriesConsolidated: number;
  summariesCreated: number;
}

export class MemoryConsolidationService {
  /**
   * Consolidate memories for a character-user pair.
   * Groups similar memories into clusters, summarizes each cluster via LLM,
   * replaces the cluster with a single consolidated memory.
   */
  async consolidate(
    characterId: string,
    userId: string,
    similarityThreshold = 0.75,
    minClusterSize = 3
  ): Promise<ConsolidationResult> {
    // 1. Fetch all memories
    const memories = await memoryRepository.findByCharacterAndUser(
      characterId, userId, 500
    );

    if (memories.length < minClusterSize) {
      return { clustersFound: 0, memoriesConsolidated: 0, summariesCreated: 0 };
    }

    // 2. Build clusters using greedy similarity grouping
    const clusters = await this.clusterMemories(
      memories, characterId, userId, similarityThreshold, minClusterSize
    );

    let memoriesConsolidated = 0;
    let summariesCreated = 0;

    // 3. For each cluster, summarize and replace
    for (const cluster of clusters) {
      try {
        const summary = await this.summarizeCluster(cluster);
        if (!summary) continue;

        // Determine consolidated type (most common type in cluster)
        const typeCount = new Map<string, number>();
        for (const m of cluster) {
          typeCount.set(m.type, (typeCount.get(m.type) ?? 0) + 1);
        }
        const dominantType = [...typeCount.entries()]
          .sort((a, b) => b[1] - a[1])[0][0];

        // Max importance from cluster, boosted slightly
        const maxImportance = Math.min(1,
          Math.max(...cluster.map(m => Number(m.importance ?? 0.5))) + 0.1
        );

        // Delete old memories in cluster
        for (const m of cluster) {
          await memoryRepository.delete(m.id);
        }

        // Create consolidated memory
        const created = await memoryRepository.create({
          characterId,
          userId,
          type: dominantType,
          content: summary,
          importance: String(maxImportance),
        });

        // Generate and store embedding for the summary
        const embedding = await embeddingService.embed(summary);
        await memoryRepository.createVector({
          memoryId: created.id,
          embedding,
        });

        memoriesConsolidated += cluster.length;
        summariesCreated++;
      } catch (error) {
        consolidationLogger.error('Failed to consolidate cluster', error as Error);
      }
    }

    return {
      clustersFound: clusters.length,
      memoriesConsolidated,
      summariesCreated,
    };
  }

  /**
   * Greedy clustering: for each unvisited memory, find all similar memories
   * and form a cluster if size >= minClusterSize.
   */
  private async clusterMemories(
    memories: CharacterMemory[],
    characterId: string,
    userId: string,
    threshold: number,
    minClusterSize: number
  ): Promise<CharacterMemory[][]> {
    const visited = new Set<string>();
    const clusters: CharacterMemory[][] = [];

    for (const memory of memories) {
      if (visited.has(memory.id)) continue;

      const embedding = await embeddingService.embed(memory.content);
      const similar = await memoryRepository.findSimilar(
        characterId, userId, embedding, threshold, 20
      );

      const cluster = similar
        .filter(s => !visited.has(s.id))
        .map(s => memories.find(m => m.id === s.id)!)
        .filter(Boolean);

      if (cluster.length >= minClusterSize) {
        for (const m of cluster) visited.add(m.id);
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Summarize a cluster of related memories into a single concise memory.
   */
  private async summarizeCluster(cluster: CharacterMemory[]): Promise<string | null> {
    const memoryTexts = cluster.map(m => `- [${m.type}] ${m.content}`).join('\n');

    const prompt = `以下是关于同一用户的多条相关记忆，请将它们合并为一条简洁的综合记忆。
保留所有重要信息，去除重复内容。输出一段话，不要使用列表格式。

记忆列表:
${memoryTexts}

合并后的记忆:`;

    try {
      const response = await llmService.chatCompletion({
        model: getDefaultModel() || 'glm-4.5-air',
        messages: [
          { role: 'system', content: 'You are a memory consolidation assistant. Output a single concise paragraph.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        temperature: 0.3,
        n: 1,
        presence_penalty: 0,
        frequency_penalty: 0,
      });

      return response.choices[0]?.message?.content?.trim() ?? null;
    } catch (error) {
      consolidationLogger.error('Failed to summarize cluster', error as Error);
      return null;
    }
  }
}

export const memoryConsolidationService = new MemoryConsolidationService();
