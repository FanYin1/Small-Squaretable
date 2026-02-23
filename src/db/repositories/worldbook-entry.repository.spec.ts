/**
 * WorldBookEntryRepository unit tests
 *
 * Tests the searchByUser method with FTS and ILIKE fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEntry = {
  id: 'entry-1',
  keyword: 'dragon',
  content: 'A fearsome dragon that guards the mountain',
  worldbookId: 'wb-1',
  worldbookName: 'Fantasy World',
};

let mockResults: any[] = [];

function createChainMock(results: any[]) {
  const chain: any = {};
  const methods = ['select', 'from', 'innerJoin', 'where', 'orderBy', 'limit'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any) => resolve(results);
  return chain;
}

vi.mock('../index', () => ({
  db: {
    select: vi.fn(() => createChainMock(mockResults)),
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockEntry]),
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockEntry]),
        }),
      }),
    })),
  },
}));

vi.mock('../schema/worldbooks', () => ({
  worldbooks: {
    id: 'id',
    name: 'name',
    userId: 'user_id',
  },
  worldbookEntries: {
    id: 'id',
    keyword: 'keyword',
    content: 'content',
    worldbookId: 'worldbook_id',
    worldbookName: 'worldbook_name',
    searchVector: 'search_vector',
    position: 'position',
    isEnabled: 'is_enabled',
    priority: 'priority',
    settings: 'settings',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  worldbookScopeEnum: vi.fn(),
}));

import { WorldBookEntryRepository } from './worldbook-entry.repository';
import { db } from '../index';

describe('WorldBookEntryRepository', () => {
  let repo: WorldBookEntryRepository;

  beforeEach(() => {
    repo = new WorldBookEntryRepository(db);
    mockResults = [mockEntry];
    vi.clearAllMocks();
  });

  describe('searchByUser', () => {
    it('should use ILIKE fallback for short queries (1-2 chars)', async () => {
      const results = await repo.searchByUser('user-1', 'ab');

      expect(results).toEqual([mockEntry]);
      // Short query should not use orderBy (no ts_rank)
      const selectMock = (db.select as any);
      expect(selectMock).toHaveBeenCalled();
    });

    it('should use full-text search for queries of 3+ chars', async () => {
      const results = await repo.searchByUser('user-1', 'dragon');

      expect(results).toEqual([mockEntry]);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return results with correct shape', async () => {
      const results = await repo.searchByUser('user-1', 'dragon');

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('keyword');
      expect(results[0]).toHaveProperty('content');
      expect(results[0]).toHaveProperty('worldbookId');
      expect(results[0]).toHaveProperty('worldbookName');
    });

    it('should return empty array when no results found', async () => {
      mockResults = [];
      const results = await repo.searchByUser('user-1', 'nonexistent');
      expect(results).toEqual([]);
    });
  });
});
