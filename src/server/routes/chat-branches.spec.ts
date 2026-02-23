/**
 * Chat Branching Route Tests
 *
 * Tests for GET /:id/branches/:messageId (sibling messages)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// --- Mocks (must precede chatRoutes import) ---

vi.mock('../services/chat.service');

vi.mock('../../db/repositories/chat.repository', () => ({
  chatRepository: { findById: vi.fn(), update: vi.fn() },
}));

vi.mock('../../db/repositories/message.repository', () => ({
  messageRepository: {
    findById: vi.fn(),
    findByChatId: vi.fn(),
    findSiblings: vi.fn(),
    searchByChatId: vi.fn(),
    deleteAfter: vi.fn(),
    createWithParent: vi.fn(),
  },
}));

vi.mock('../../db/repositories/message-bookmark.repository', () => ({
  messageBookmarkRepository: {
    findByUser: vi.fn(),
    findByMessage: vi.fn(),
    create: vi.fn(),
    deleteByMessage: vi.fn(),
  },
}));

vi.mock('../../db/repositories/character-growth.repository', () => ({
  characterGrowthRepository: {
    getOrCreate: vi.fn().mockResolvedValue({ id: 'g1' }),
    incrementChats: vi.fn(),
    incrementMessages: vi.fn(),
  },
}));

vi.mock('../services/event-bus.service', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('../services/group-chat.service', () => ({
  groupChatService: {
    addCharacter: vi.fn().mockResolvedValue(undefined),
    removeCharacter: vi.fn().mockResolvedValue(undefined),
    getChatCharacters: vi.fn().mockResolvedValue([]),
    isGroupChat: vi.fn().mockResolvedValue(false),
    setStrategy: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../config/llm.config', () => ({
  getAvailableModels: vi.fn().mockReturnValue(['gpt-4']),
}));

vi.mock('../services/logger.service', () => {
  const fn = vi.fn;
  const child = { info: fn(), warn: fn(), error: fn(), debug: fn() };
  const log = { info: fn(), warn: fn(), error: fn(), debug: fn(), child: fn().mockReturnValue(child) };
  return { createLogger: () => log, logger: log };
});

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../db/schema/chat-snapshots', () => ({ chatSnapshots: {} }));
vi.mock('../../db/schema/characters', () => ({ characters: {} }));

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header: string) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: { findById: vi.fn() },
}));

vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: { findByTenantId: vi.fn() },
}));

vi.mock('../services/usage.service', () => ({
  usageService: { checkQuota: vi.fn() },
}));

// --- Imports (after mocks) ---

import { chatRoutes } from './chats';
import { chatRepository } from '../../db/repositories/chat.repository';
import { messageRepository } from '../../db/repositories/message.repository';

// --- Test helpers ---

async function setupAuth(userId = 'user-123') {
  const { verifyAccessToken } = await import('../../core/jwt');
  const { userRepository } = await import('../../db/repositories/user.repository');

  vi.mocked(verifyAccessToken).mockResolvedValue({
    userId,
    tenantId: 'tenant-123',
    email: 'test@example.com',
  });
  vi.mocked(userRepository.findById).mockResolvedValue({
    id: userId,
    tenantId: 'tenant-123',
    email: 'test@example.com',
    isActive: true,
  } as any);
}

describe('Chat Branching Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/chats', chatRoutes);
    vi.clearAllMocks();
  });

  describe('GET /api/v1/chats/:id/branches/:messageId', () => {
    it('returns sibling messages', async () => {
      await setupAuth();
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: 'chat-1', userId: 'user-123', tenantId: 'tenant-123',
      } as any);

      const mockSiblings = [
        { id: 10, chatId: 'chat-1', parentMessageId: 5, role: 'assistant', content: 'Reply A' },
        { id: 11, chatId: 'chat-1', parentMessageId: 5, role: 'assistant', content: 'Reply B' },
      ];
      vi.mocked(messageRepository.findSiblings).mockResolvedValue(mockSiblings as any);

      const res = await app.request('/api/v1/chats/chat-1/branches/10', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockSiblings);
      expect(messageRepository.findSiblings).toHaveBeenCalledWith(10);
    });

    it('returns single message when no parent exists', async () => {
      await setupAuth();
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: 'chat-1', userId: 'user-123', tenantId: 'tenant-123',
      } as any);

      const singleMsg = [
        { id: 1, chatId: 'chat-1', parentMessageId: null, role: 'user', content: 'First' },
      ];
      vi.mocked(messageRepository.findSiblings).mockResolvedValue(singleMsg as any);

      const res = await app.request('/api/v1/chats/chat-1/branches/1', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it('returns 404 for non-existent chat', async () => {
      await setupAuth();
      vi.mocked(chatRepository.findById).mockResolvedValue(null);

      const res = await app.request('/api/v1/chats/no-such-chat/branches/10', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
