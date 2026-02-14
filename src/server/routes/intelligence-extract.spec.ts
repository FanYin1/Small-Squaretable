/**
 * Intelligence Extract-Memories Endpoint Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { intelligenceRoutes } from './intelligence';

vi.mock('../services/memory.service', () => ({
  memoryService: {
    extractMemories: vi.fn(),
    storeMemory: vi.fn(),
    retrieveMemories: vi.fn(),
    getMemories: vi.fn(),
    getMemoryCount: vi.fn(),
    deleteMemory: vi.fn(),
    clearAllMemories: vi.fn(),
  },
}));

vi.mock('../../db/repositories/message.repository', () => ({
  messageRepository: {
    findByChatId: vi.fn(),
  },
}));

vi.mock('../services/emotion.service', () => ({
  emotionService: {
    getCurrentEmotion: vi.fn(),
    getEmotionHistory: vi.fn(),
    analyzeAndUpdate: vi.fn(),
    resetEmotion: vi.fn(),
  },
}));

vi.mock('../services/intelligence-debug.service', () => ({
  intelligenceDebugService: {
    getDebugState: vi.fn(),
    getSystemPromptDetails: vi.fn(),
  },
}));

vi.mock('../services/embedding.service', () => ({
  embeddingService: {
    embed: vi.fn(),
  },
}));

vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

const CHAR_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHAT_ID = '660e8400-e29b-41d4-a716-446655440001';

async function setupAuth() {
  const { verifyAccessToken } = await import('../../core/jwt');
  const { userRepository } = await import('../../db/repositories/user.repository');

  vi.mocked(verifyAccessToken).mockResolvedValue({
    userId: 'user-123',
    tenantId: 'tenant-123',
    email: 'test@example.com',
  });
  vi.mocked(userRepository.findById).mockResolvedValue({
    id: 'user-123',
    tenantId: 'tenant-123',
    email: 'test@example.com',
    isActive: true,
  } as any);
}

describe('Intelligence Extract-Memories Endpoint', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1', intelligenceRoutes);
    vi.clearAllMocks();
  });

  describe('POST /characters/:characterId/intelligence/extract-memories', () => {
    it('should extract and store memories from chat messages', async () => {
      await setupAuth();
      const { memoryService } = await import('../services/memory.service');
      const { messageRepository } = await import('../../db/repositories/message.repository');

      const mockMessages = [
        { id: 1, chatId: CHAT_ID, role: 'user', content: 'I love cats', sentAt: new Date() },
        { id: 2, chatId: CHAT_ID, role: 'assistant', content: 'Cats are great!', sentAt: new Date() },
      ];

      const mockFacts = [
        { type: 'preference' as const, content: 'User loves cats', importance: 0.6 },
        { type: 'fact' as const, content: 'User is a pet owner', importance: 0.7 },
      ];

      vi.mocked(messageRepository.findByChatId).mockResolvedValue(mockMessages as any);
      vi.mocked(memoryService.extractMemories).mockResolvedValue(mockFacts);
      vi.mocked(memoryService.storeMemory).mockResolvedValue(undefined);

      const res = await app.request(
        `/api/v1/characters/${CHAR_ID}/intelligence/extract-memories`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token',
          },
          body: JSON.stringify({ chatId: CHAT_ID }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.extracted).toBe(2);
      expect(data.data.memories).toHaveLength(2);
      expect(memoryService.extractMemories).toHaveBeenCalledWith(
        CHAR_ID, 'user-123', mockMessages
      );
    });

    it('should return 0 when chat has no messages', async () => {
      await setupAuth();
      const { memoryService } = await import('../services/memory.service');
      const { messageRepository } = await import('../../db/repositories/message.repository');

      vi.mocked(messageRepository.findByChatId).mockResolvedValue([]);

      const res = await app.request(
        `/api/v1/characters/${CHAR_ID}/intelligence/extract-memories`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token',
          },
          body: JSON.stringify({ chatId: CHAT_ID }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.extracted).toBe(0);
      expect(data.data.memories).toEqual([]);
      expect(memoryService.extractMemories).not.toHaveBeenCalled();
      expect(memoryService.storeMemory).not.toHaveBeenCalled();
    });

    it('should call storeMemory for each extracted fact', async () => {
      await setupAuth();
      const { memoryService } = await import('../services/memory.service');
      const { messageRepository } = await import('../../db/repositories/message.repository');

      const mockMessages = [
        { id: 1, chatId: CHAT_ID, role: 'user', content: 'My name is Alice', sentAt: new Date() },
      ];

      const mockFacts = [
        { type: 'fact' as const, content: 'User name is Alice', importance: 0.7 },
        { type: 'relationship' as const, content: 'Alice is the user', importance: 0.8 },
        { type: 'preference' as const, content: 'Alice prefers formal tone', importance: 0.6 },
      ];

      vi.mocked(messageRepository.findByChatId).mockResolvedValue(mockMessages as any);
      vi.mocked(memoryService.extractMemories).mockResolvedValue(mockFacts);
      vi.mocked(memoryService.storeMemory).mockResolvedValue(undefined);

      const res = await app.request(
        `/api/v1/characters/${CHAR_ID}/intelligence/extract-memories`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token',
          },
          body: JSON.stringify({ chatId: CHAT_ID }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.extracted).toBe(3);

      // Verify storeMemory was called once per fact
      expect(memoryService.storeMemory).toHaveBeenCalledTimes(3);
      expect(memoryService.storeMemory).toHaveBeenCalledWith(
        CHAR_ID, 'user-123', mockFacts[0], CHAT_ID
      );
      expect(memoryService.storeMemory).toHaveBeenCalledWith(
        CHAR_ID, 'user-123', mockFacts[1], CHAT_ID
      );
      expect(memoryService.storeMemory).toHaveBeenCalledWith(
        CHAR_ID, 'user-123', mockFacts[2], CHAT_ID
      );
    });
  });
});
