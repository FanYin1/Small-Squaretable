import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { Database } from '../index';
import { MemoryRepository } from './memory.repository';

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

vi.mock('../../core/config', () => ({
  config: {
    memorySimilarityWeight: 0.5,
    memoryImportanceWeight: 0.3,
    memoryRecencyWeight: 0.2,
    memoryDecayHalfLifeDays: 30,
  },
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

  describe('hasRetrievableMemories', () => {
    const dialect = new PgDialect();

    it.each([true, false])('returns the database EXISTS result: %s', async exists => {
      const execute = vi.fn().mockResolvedValue([{ exists }]);
      const repository = new MemoryRepository({ execute } as unknown as Database);

      expect(await repository.hasRetrievableMemories('char-1', 'user-1', 'story-1')).toBe(exists);

      const query = dialect.sqlToQuery(execute.mock.calls[0][0] as SQL);
      expect(query.sql).toMatch(/SELECT EXISTS\s*\(\s*SELECT 1/);
      expect(query.sql).toContain('JOIN character_memory_vectors v ON v.memory_id = m.id');
      expect(query.sql).not.toMatch(/count\(|<=>|ORDER BY/i);
      expect(query.params).toEqual(['char-1', 'user-1', 'story-1']);
    });

    it.each([
      { chatId: 'story-1', filter: 'AND m.source_chat_id = $3::uuid', params: ['char-1', 'user-1', 'story-1'] },
      { chatId: null, filter: 'AND m.source_chat_id IS NULL', params: ['char-1', 'user-1'] },
      { chatId: undefined, filter: '', params: ['char-1', 'user-1'] },
    ])('uses the same search scope as hybridSearch: $chatId', async ({ chatId, filter, params }) => {
      const execute = vi.fn().mockResolvedValue([{ exists: true }]);
      const repository = new MemoryRepository({ execute } as unknown as Database);

      await repository.hasRetrievableMemories('char-1', 'user-1', chatId);
      await repository.hybridSearch({ characterId: 'char-1', userId: 'user-1', chatId, embedding: [0.1] });

      const preflight = dialect.sqlToQuery(execute.mock.calls[0][0] as SQL);
      const search = dialect.sqlToQuery(execute.mock.calls[1][0] as SQL);
      expect(preflight.params).toEqual(params);
      expect(preflight.sql).toContain('m.character_id = $1::uuid');
      expect(preflight.sql).toContain('AND m.user_id = $2::uuid');
      if (filter) expect(preflight.sql).toContain(filter);
      else expect(preflight.sql).not.toContain('source_chat_id');

      // Ignore parameter numbering: scoring consumes parameters before the WHERE.
      const whereClause = (query: string) => query.split('WHERE ')[1]
        .split(/\) AS exists|ORDER BY/)[0].trim().replace(/\$\d+/g, '?');
      expect(whereClause(search.sql)).toBe(whereClause(preflight.sql));
      expect(search.params.slice(-params.length - 1, -1)).toEqual(params);
    });

    it('propagates database failures', async () => {
      const execute = vi.fn().mockRejectedValue(new Error('database unavailable'));
      const repository = new MemoryRepository({ execute } as unknown as Database);

      await expect(repository.hasRetrievableMemories('char-1', 'user-1', null))
        .rejects.toThrow('database unavailable');
    });
  });
});
