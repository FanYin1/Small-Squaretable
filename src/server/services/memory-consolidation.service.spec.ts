import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryConsolidationService } from './memory-consolidation.service';

// Mock dependencies
vi.mock('../../db/repositories/memory.repository', () => ({
  memoryRepository: {
    findByCharacterAndUser: vi.fn(),
    findSimilar: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    createVector: vi.fn(),
  },
}));

vi.mock('./embedding.service', () => ({
  embeddingService: {
    embed: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
  },
}));

vi.mock('./llm.service', () => ({
  llmService: {
    chatCompletion: vi.fn(),
  },
}));

vi.mock('../config/llm.config', () => ({
  getDefaultModel: vi.fn().mockReturnValue('glm-4.5-air'),
}));

vi.mock('./logger.service', () => ({
  logger: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { memoryRepository } from '../../db/repositories/memory.repository';
import { embeddingService } from './embedding.service';
import { llmService } from './llm.service';
import type { CharacterMemory } from '../../db/schema/memories';

function makeMemory(overrides: Partial<CharacterMemory> = {}): CharacterMemory {
  return {
    id: overrides.id ?? 'mem-1',
    characterId: 'char-1',
    userId: 'user-1',
    type: overrides.type ?? 'fact',
    content: overrides.content ?? 'Test memory',
    importance: overrides.importance ?? '0.5',
    accessCount: overrides.accessCount ?? 0,
    sourceChatId: overrides.sourceChatId ?? null,
    sourceMessageId: overrides.sourceMessageId ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    lastAccessed: overrides.lastAccessed ?? new Date(),
  };
}

function makeLLMResponse(content: string) {
  return {
    id: 'test',
    object: 'chat.completion',
    created: Date.now(),
    model: 'glm-4.5-air',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

describe('MemoryConsolidationService', () => {
  let service: MemoryConsolidationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MemoryConsolidationService();
  });

  it('should skip consolidation when fewer memories than minClusterSize', async () => {
    vi.mocked(memoryRepository.findByCharacterAndUser).mockResolvedValue([
      makeMemory({ id: 'mem-1' }),
      makeMemory({ id: 'mem-2' }),
    ]);

    const result = await service.consolidate('char-1', 'user-1', 0.75, 3);

    expect(result).toEqual({ clustersFound: 0, memoriesConsolidated: 0, summariesCreated: 0 });
    expect(memoryRepository.findSimilar).not.toHaveBeenCalled();
    expect(memoryRepository.delete).not.toHaveBeenCalled();
    expect(memoryRepository.create).not.toHaveBeenCalled();
  });

  it('should find clusters and consolidate them', async () => {
    const memories = [
      makeMemory({ id: 'mem-1', content: 'User likes coffee' }),
      makeMemory({ id: 'mem-2', content: 'User enjoys espresso' }),
      makeMemory({ id: 'mem-3', content: 'User drinks latte' }),
      makeMemory({ id: 'mem-4', content: 'User is a developer' }),
    ];

    vi.mocked(memoryRepository.findByCharacterAndUser).mockResolvedValue(memories);

    // First memory finds 3 similar (mem-1, mem-2, mem-3)
    vi.mocked(memoryRepository.findSimilar)
      .mockResolvedValueOnce([
        { ...memories[0], similarity: 0.95 },
        { ...memories[1], similarity: 0.90 },
        { ...memories[2], similarity: 0.85 },
      ] as any)
      // mem-4 finds only itself (no cluster)
      .mockResolvedValueOnce([
        { ...memories[3], similarity: 1.0 },
      ] as any);

    vi.mocked(llmService.chatCompletion).mockResolvedValue(
      makeLLMResponse('User is a coffee enthusiast who enjoys espresso and latte.') as any
    );

    vi.mocked(memoryRepository.create).mockResolvedValue(
      makeMemory({ id: 'consolidated-1', content: 'User is a coffee enthusiast' }) as any
    );

    const result = await service.consolidate('char-1', 'user-1', 0.75, 3);

    expect(result.clustersFound).toBe(1);
    expect(result.memoriesConsolidated).toBe(3);
    expect(result.summariesCreated).toBe(1);
    expect(memoryRepository.delete).toHaveBeenCalledTimes(3);
    expect(memoryRepository.create).toHaveBeenCalledTimes(1);
    expect(memoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'User is a coffee enthusiast who enjoys espresso and latte.',
      })
    );
    expect(memoryRepository.createVector).toHaveBeenCalledTimes(1);
  });

  it('should use dominant type from cluster', async () => {
    const memories = [
      makeMemory({ id: 'mem-1', type: 'fact', content: 'Fact 1' }),
      makeMemory({ id: 'mem-2', type: 'fact', content: 'Fact 2' }),
      makeMemory({ id: 'mem-3', type: 'preference', content: 'Pref 1' }),
    ];

    vi.mocked(memoryRepository.findByCharacterAndUser).mockResolvedValue(memories);
    vi.mocked(memoryRepository.findSimilar).mockResolvedValueOnce([
      { ...memories[0], similarity: 0.95 },
      { ...memories[1], similarity: 0.90 },
      { ...memories[2], similarity: 0.85 },
    ] as any);

    vi.mocked(llmService.chatCompletion).mockResolvedValue(
      makeLLMResponse('Consolidated summary') as any
    );
    vi.mocked(memoryRepository.create).mockResolvedValue(
      makeMemory({ id: 'consolidated-1' }) as any
    );

    await service.consolidate('char-1', 'user-1', 0.75, 3);

    expect(memoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fact' })
    );
  });

  it('should boost max importance by 0.1 (capped at 1.0)', async () => {
    const memories = [
      makeMemory({ id: 'mem-1', importance: '0.7' }),
      makeMemory({ id: 'mem-2', importance: '0.8' }),
      makeMemory({ id: 'mem-3', importance: '0.6' }),
    ];

    vi.mocked(memoryRepository.findByCharacterAndUser).mockResolvedValue(memories);
    vi.mocked(memoryRepository.findSimilar).mockResolvedValueOnce([
      { ...memories[0], similarity: 0.95 },
      { ...memories[1], similarity: 0.90 },
      { ...memories[2], similarity: 0.85 },
    ] as any);

    vi.mocked(llmService.chatCompletion).mockResolvedValue(
      makeLLMResponse('Summary') as any
    );
    vi.mocked(memoryRepository.create).mockResolvedValue(
      makeMemory({ id: 'consolidated-1' }) as any
    );

    await service.consolidate('char-1', 'user-1', 0.75, 3);

    // max(0.7, 0.8, 0.6) + 0.1 = 0.9
    expect(memoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ importance: '0.9' })
    );
  });

  it('should handle LLM summarization failure gracefully', async () => {
    const memories = [
      makeMemory({ id: 'mem-1' }),
      makeMemory({ id: 'mem-2' }),
      makeMemory({ id: 'mem-3' }),
    ];

    vi.mocked(memoryRepository.findByCharacterAndUser).mockResolvedValue(memories);
    vi.mocked(memoryRepository.findSimilar).mockResolvedValueOnce([
      { ...memories[0], similarity: 0.95 },
      { ...memories[1], similarity: 0.90 },
      { ...memories[2], similarity: 0.85 },
    ] as any);

    vi.mocked(llmService.chatCompletion).mockRejectedValue(new Error('LLM unavailable'));

    const result = await service.consolidate('char-1', 'user-1', 0.75, 3);

    // summarizeCluster returns null on error, so the cluster is skipped
    expect(memoryRepository.delete).not.toHaveBeenCalled();
    expect(memoryRepository.create).not.toHaveBeenCalled();
    expect(result.clustersFound).toBe(1);
    expect(result.memoriesConsolidated).toBe(0);
    expect(result.summariesCreated).toBe(0);
  });

  it('should not cluster already-visited memories', async () => {
    const memories = [
      makeMemory({ id: 'mem-1', content: 'Coffee fact 1' }),
      makeMemory({ id: 'mem-2', content: 'Coffee fact 2' }),
      makeMemory({ id: 'mem-3', content: 'Coffee fact 3' }),
      makeMemory({ id: 'mem-4', content: 'Tea fact 1' }),
      makeMemory({ id: 'mem-5', content: 'Tea fact 2' }),
      makeMemory({ id: 'mem-6', content: 'Tea fact 3' }),
    ];

    vi.mocked(memoryRepository.findByCharacterAndUser).mockResolvedValue(memories);

    // First call (for mem-1): returns mem-1, mem-2, mem-3 as similar
    vi.mocked(memoryRepository.findSimilar)
      .mockResolvedValueOnce([
        { ...memories[0], similarity: 0.95 },
        { ...memories[1], similarity: 0.90 },
        { ...memories[2], similarity: 0.85 },
      ] as any)
      // Second call (for mem-4): returns mem-4, mem-5, mem-6
      // Also includes mem-1 but it should be filtered out as visited
      .mockResolvedValueOnce([
        { ...memories[0], similarity: 0.80 },
        { ...memories[3], similarity: 0.95 },
        { ...memories[4], similarity: 0.90 },
        { ...memories[5], similarity: 0.85 },
      ] as any);

    vi.mocked(llmService.chatCompletion).mockResolvedValue(
      makeLLMResponse('Consolidated summary') as any
    );
    vi.mocked(memoryRepository.create).mockResolvedValue(
      makeMemory({ id: 'consolidated-1' }) as any
    );

    const result = await service.consolidate('char-1', 'user-1', 0.75, 3);

    // Two clusters: [mem-1,2,3] and [mem-4,5,6]
    expect(result.clustersFound).toBe(2);
    expect(result.memoriesConsolidated).toBe(6);
    expect(result.summariesCreated).toBe(2);
    // 3 deletes per cluster = 6 total
    expect(memoryRepository.delete).toHaveBeenCalledTimes(6);
    // mem-1 should NOT appear in the second cluster
    const deleteIds = vi.mocked(memoryRepository.delete).mock.calls.map(c => c[0]);
    // First cluster: mem-1, mem-2, mem-3
    expect(deleteIds.slice(0, 3)).toEqual(['mem-1', 'mem-2', 'mem-3']);
    // Second cluster: mem-4, mem-5, mem-6 (not mem-1)
    expect(deleteIds.slice(3, 6)).toEqual(['mem-4', 'mem-5', 'mem-6']);
  });
});
