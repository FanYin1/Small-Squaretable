/**
 * Chat Reaction Route Tests
 *
 * Tests for POST /:id/messages/:messageId/reactions (toggle),
 * GET /:id/messages/:messageId/reactions (grouped list)
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
vi.mock('../../db/schema/message-reactions', () => ({ messageReactions: {} }));

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
import { db } from '../../db';

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

describe('Chat Reaction Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/chats', chatRoutes);
    vi.clearAllMocks();

    // Reset chainable mock methods
    const d = db as any;
    d.select.mockReturnThis();
    d.from.mockReturnThis();
    d.where.mockReturnThis();
    d.limit.mockResolvedValue([]);
    d.insert.mockReturnThis();
    d.values.mockReturnThis();
    d.returning.mockResolvedValue([]);
    d.delete.mockReturnThis();
  });

  // ── POST /:id/messages/:messageId/reactions ──

  describe('POST /api/v1/chats/:id/messages/:messageId/reactions', () => {
    it('adds a reaction when none exists', async () => {
      await setupAuth();
      const d = db as any;
      // No existing reaction
      d.limit.mockResolvedValue([]);
      d.returning.mockResolvedValue([{ id: 'r1' }]);

      const res = await app.request('/api/v1/chats/chat-1/messages/10/reactions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emoji: '👍' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.action).toBe('added');
    });

    it('returns 400 when emoji is missing', async () => {
      await setupAuth();

      const res = await app.request('/api/v1/chats/chat-1/messages/10/reactions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── GET /:id/messages/:messageId/reactions ──

  describe('GET /api/v1/chats/:id/messages/:messageId/reactions', () => {
    it('returns grouped reactions', async () => {
      await setupAuth();
      const d = db as any;
      // Mock db.select().from().where() to return raw reactions
      d.where.mockResolvedValue([
        { emoji: '👍', userId: 'user-1' },
        { emoji: '👍', userId: 'user-2' },
        { emoji: '❤️', userId: 'user-1' },
      ]);

      const res = await app.request('/api/v1/chats/chat-1/messages/10/reactions', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([
        { emoji: '👍', count: 2, userIds: ['user-1', 'user-2'] },
        { emoji: '❤️', count: 1, userIds: ['user-1'] },
      ]);
    });
  });
});
