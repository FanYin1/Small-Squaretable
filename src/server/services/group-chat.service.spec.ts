/**
 * GroupChatService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──
const { mockGetCharacterIds, mockGetCharacters, mockAddCharacter, mockRemoveCharacter } = vi.hoisted(() => {
  const mockGetCharacterIds = vi.fn().mockResolvedValue([]);
  const mockGetCharacters = vi.fn().mockResolvedValue([]);
  const mockAddCharacter = vi.fn().mockResolvedValue({});
  const mockRemoveCharacter = vi.fn().mockResolvedValue(true);
  return { mockGetCharacterIds, mockGetCharacters, mockAddCharacter, mockRemoveCharacter };
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

      const result = await service.isGroupChat('chat-1');

      expect(result).toBe(true);
    });

    it('returns false for single character', async () => {
      mockGetCharacterIds.mockResolvedValueOnce(['char-a']);

      const result = await service.isGroupChat('chat-1');

      expect(result).toBe(false);
    });
  });
});
