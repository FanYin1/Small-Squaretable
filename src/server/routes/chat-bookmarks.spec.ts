/**
 * Chat Bookmark Route Tests
 *
 * Tests for GET /bookmarks, POST /:id/messages/:messageId/bookmark,
 * DELETE /:id/messages/:messageId/bookmark
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
import { messageBookmarkRepository } from '../../db/repositories/message-bookmark.repository';
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

describe('Chat Bookmark Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/chats', chatRoutes);
    vi.clearAllMocks();
  });

  // ── GET /bookmarks ──

  describe('GET /api/v1/chats/bookmarks', () => {
    it('returns user bookmarks', async () => {
      await setupAuth();
      const mockBookmarks = [
        { id: 'bm-1', userId: 'user-123', messageId: 1, note: null, createdAt: new Date().toISOString() },
        { id: 'bm-2', userId: 'user-123', messageId: 2, note: 'important', createdAt: new Date().toISOString() },
      ];
      vi.mocked(messageBookmarkRepository.findByUser).mockResolvedValue(mockBookmarks as any);

      const res = await app.request('/api/v1/chats/bookmarks?limit=50&offset=0', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockBookmarks);
      expect(messageBookmarkRepository.findByUser).toHaveBeenCalledWith('user-123', 50, 0);
    });

    it('respects pagination params', async () => {
      await setupAuth();
      vi.mocked(messageBookmarkRepository.findByUser).mockResolvedValue([]);

      const res = await app.request('/api/v1/chats/bookmarks?limit=10&offset=20', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      expect(messageBookmarkRepository.findByUser).toHaveBeenCalledWith('user-123', 10, 20);
    });
  });

  // ── POST /:id/messages/:messageId/bookmark ──

  describe('POST /api/v1/chats/:id/messages/:messageId/bookmark', () => {
    it('creates a bookmark successfully', async () => {
      await setupAuth();
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: 'chat-1', userId: 'user-123', tenantId: 'tenant-123',
      } as any);
      vi.mocked(messageRepository.findById).mockResolvedValue({
        id: 10, chatId: 'chat-1', role: 'assistant', content: 'Hello',
      } as any);
      vi.mocked(messageBookmarkRepository.findByMessage).mockResolvedValue(null);
      vi.mocked(messageBookmarkRepository.create).mockResolvedValue({
        id: 'bm-new', userId: 'user-123', messageId: 10, note: null, createdAt: new Date(),
      } as any);

      const res = await app.request('/api/v1/chats/chat-1/messages/10/bookmark', {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('bm-new');
    });

    it('returns 409 for duplicate bookmark', async () => {
      await setupAuth();
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: 'chat-1', userId: 'user-123', tenantId: 'tenant-123',
      } as any);
      vi.mocked(messageRepository.findById).mockResolvedValue({
        id: 10, chatId: 'chat-1', role: 'assistant', content: 'Hello',
      } as any);
      vi.mocked(messageBookmarkRepository.findByMessage).mockResolvedValue({
        id: 'bm-existing', userId: 'user-123', messageId: 10,
      } as any);

      const res = await app.request('/api/v1/chats/chat-1/messages/10/bookmark', {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONFLICT');
    });
  });

  // ── DELETE /:id/messages/:messageId/bookmark ──

  describe('DELETE /api/v1/chats/:id/messages/:messageId/bookmark', () => {
    it('deletes a bookmark successfully', async () => {
      await setupAuth();
      vi.mocked(messageBookmarkRepository.deleteByMessage).mockResolvedValue(true);

      const res = await app.request('/api/v1/chats/chat-1/messages/10/bookmark', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Bookmark removed');
      expect(messageBookmarkRepository.deleteByMessage).toHaveBeenCalledWith('user-123', 10);
    });
  });
});
