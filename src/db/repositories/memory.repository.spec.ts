import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => {
  const mockChain = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  return { db: mockChain };
});

vi.mock('../schema/memories', () => ({
  characterMemories: {
    id: 'id',
    characterId: 'character_id',
    userId: 'user_id',
    lastAccessed: 'last_accessed',
    accessCount: 'access_count',
    sourceChatId: 'source_chat_id',
    content: 'content',
    importance: 'importance',
  },
  characterMemoryVectors: {},
}));

describe('MemoryRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateAccessTimeBatch should accept array of IDs', async () => {
    const { memoryRepository } = await import('./memory.repository');
    await memoryRepository.updateAccessTimeBatch(['id-1', 'id-2', 'id-3']);
    const { db } = await import('../index');
    expect(db.update).toHaveBeenCalled();
  });

  it('updateAccessTimeBatch should skip DB call for empty array', async () => {
    const { memoryRepository } = await import('./memory.repository');
    const { db } = await import('../index');
    vi.mocked(db.update).mockClear();
    await memoryRepository.updateAccessTimeBatch([]);
    expect(db.update).not.toHaveBeenCalled();
  });
});
