/**
 * GroupChatService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──
const { mockGetCharacterIds, mockGetCharacters, mockAddCharacter, mockRemoveCharacter, mockFindById, mockDbUpdate, mockCacheGet, mockCacheSet, mockCacheDelete } = vi.hoisted(() => {
  const mockGetCharacterIds = vi.fn().mockResolvedValue([]);
  const mockGetCharacters = vi.fn().mockResolvedValue([]);
  const mockAddCharacter = vi.fn().mockResolvedValue({});
  const mockRemoveCharacter = vi.fn().mockResolvedValue(true);
  const mockFindById = vi.fn().mockResolvedValue(null);
  const mockWhere = vi.fn().mockResolvedValue([]);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockDbUpdate = vi.fn().mockReturnValue({ set: mockSet });
  const mockCacheGet = vi.fn().mockResolvedValue(null);
  const mockCacheSet = vi.fn().mockResolvedValue(undefined);
  const mockCacheDelete = vi.fn().mockResolvedValue(undefined);
  return { mockGetCharacterIds, mockGetCharacters, mockAddCharacter, mockRemoveCharacter, mockFindById, mockDbUpdate, mockCacheGet, mockCacheSet, mockCacheDelete };
});

vi.mock('../../db/repositories/chat-character.repository', () => ({
  chatCharacterRepository: {
    getCharacterIds: mockGetCharacterIds,
    getCharacters: mockGetCharacters,
    addCharacter: mockAddCharacter,
    removeCharacter: mockRemoveCharacter,
  },
}));

vi.mock('./logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('../../db/repositories/chat.repository', () => ({
  chatRepository: { findById: mockFindById },
}));

vi.mock('../../db', () => ({
  db: { update: mockDbUpdate },
}));

vi.mock('../../db/schema/chats', () => ({
  chats: { id: 'id', metadata: 'metadata' },
}));

vi.mock('./cache.service', () => ({
  cacheService: {
    get: mockCacheGet,
    set: mockCacheSet,
    delete: mockCacheDelete,
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

import { GroupChatService } from './group-chat.service';

describe('GroupChatService', () => {
  let service: GroupChatService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GroupChatService();
  });

  describe('selectRespondents', () => {
    it('round_robin returns next character after last responder', async () => {
      mockGetCharacterIds.mockResolvedValueOnce(['char-a', 'char-b', 'char-c']);

      const result = await service.selectRespondents('chat-1', 'round_robin', 'char-a');

      expect(result).toEqual(['char-b']);
    });

    it('round_robin wraps around to first character', async () => {
      mockGetCharacterIds.mockResolvedValueOnce(['char-a', 'char-b', 'char-c']);

      const result = await service.selectRespondents('chat-1', 'round_robin', 'char-c');

      expect(result).toEqual(['char-a']);
    });

    it('round_robin returns first when no lastResponderId', async () => {
      mockGetCharacterIds.mockResolvedValueOnce(['char-a', 'char-b', 'char-c']);

      const result = await service.selectRespondents('chat-1', 'round_robin');

      expect(result).toEqual(['char-a']);
    });

    it('all returns all characters', async () => {
      mockGetCharacterIds.mockResolvedValueOnce(['char-a', 'char-b', 'char-c']);

      const result = await service.selectRespondents('chat-1', 'all');

      expect(result).toEqual(['char-a', 'char-b', 'char-c']);
    });

    it('random returns one character', async () => {
      mockGetCharacterIds.mockResolvedValueOnce(['char-a', 'char-b', 'char-c']);

      const result = await service.selectRespondents('chat-1', 'random');

      expect(result).toHaveLength(1);
      expect(['char-a', 'char-b', 'char-c']).toContain(result[0]);
    });

    it('returns single character for single-character chat', async () => {
      mockGetCharacterIds.mockResolvedValueOnce(['char-only']);

      const result = await service.selectRespondents('chat-1', 'round_robin');

      expect(result).toEqual(['char-only']);
    });

    it('returns empty array when no characters', async () => {
      mockGetCharacterIds.mockResolvedValueOnce([]);

      const result = await service.selectRespondents('chat-1', 'round_robin');

      expect(result).toEqual([]);
    });
  });

  describe('isGroupChat', () => {
    it('returns true for multiple characters', async () => {
      mockGetCharacterIds.mockResolvedValueOnce(['char-a', 'char-b']);
      mockFindById.mockResolvedValueOnce({ metadata: null });

      const result = await service.isGroupChat('chat-1');

      expect(result).toBe(true);
    });

    it('returns false for single character', async () => {
      mockGetCharacterIds.mockResolvedValueOnce(['char-a']);
      mockFindById.mockResolvedValueOnce({ metadata: null });

      const result = await service.isGroupChat('chat-1');

      expect(result).toBe(false);
    });
  });

  describe('getStrategy', () => {
    it('returns round_robin by default when no metadata', async () => {
      mockFindById.mockResolvedValueOnce({ metadata: null });
      const strategy = await service.getStrategy('chat-1');
      expect(strategy).toBe('round_robin');
    });

    it('returns stored strategy from metadata', async () => {
      mockFindById.mockResolvedValueOnce({ metadata: { groupStrategy: 'all' } });
      const strategy = await service.getStrategy('chat-1');
      expect(strategy).toBe('all');
    });

    it('returns round_robin when chat not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const strategy = await service.getStrategy('nonexistent');
      expect(strategy).toBe('round_robin');
    });
  });

  describe('setStrategy', () => {
    it('updates metadata with new strategy', async () => {
      mockFindById.mockResolvedValueOnce({ metadata: { existingKey: 'value' } });
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbUpdate.mockReturnValueOnce({ set: mockSet });

      await service.setStrategy('chat-1', 'random');

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith({
        metadata: { existingKey: 'value', groupStrategy: 'random' },
      });
    });

    it('does nothing when chat not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      mockDbUpdate.mockClear();

      await service.setStrategy('nonexistent', 'all');

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });
  });
});
