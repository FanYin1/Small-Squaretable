import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { AppError } from '../../core/errors';

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () =>
    createMiddleware(async (c, next) => {
      const user = c.get('user');
      if (!user) {
        return c.json({ success: false, error: 'Unauthorized' }, 401);
      }
      await next();
    }),
}));

// Mock feature-gate
vi.mock('../middleware/feature-gate', () => ({
  requireQuota: () =>
    createMiddleware(async (_c, next) => {
      await next();
    }),
}));

const mockFindById = vi.fn();
const mockUpdate = vi.fn();
const mockFindByIdAndTenant = vi.fn();
const mockFindByUserId = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../db/repositories/chat.repository', () => ({
  chatRepository: {
    findById: (...args: unknown[]) => mockFindById(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    findByIdAndTenant: (...args: unknown[]) => mockFindByIdAndTenant(...args),
    findByUserId: (...args: unknown[]) => mockFindByUserId(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

const mockFindByChatId = vi.fn();
const mockMessageCreate = vi.fn();
const mockFindMessageById = vi.fn();
const mockSearchByChatId = vi.fn();
const mockDeleteAfter = vi.fn();
const mockFindSiblings = vi.fn();
const mockCreateWithParent = vi.fn();
const mockMessageDelete = vi.fn();
const mockMessageUpdate = vi.fn();

vi.mock('../../db/repositories/message.repository', () => ({
  messageRepository: {
    findByChatId: (...args: unknown[]) => mockFindByChatId(...args),
    create: (...args: unknown[]) => mockMessageCreate(...args),
    findById: (...args: unknown[]) => mockFindMessageById(...args),
    searchByChatId: (...args: unknown[]) => mockSearchByChatId(...args),
    deleteAfter: (...args: unknown[]) => mockDeleteAfter(...args),
    findSiblings: (...args: unknown[]) => mockFindSiblings(...args),
    createWithParent: (...args: unknown[]) => mockCreateWithParent(...args),
    delete: (...args: unknown[]) => mockMessageDelete(...args),
    update: (...args: unknown[]) => mockMessageUpdate(...args),
  },
}));

const mockGenerateSummary = vi.fn();
const mockGetById = vi.fn();
const mockChatServiceCreate = vi.fn();
const mockGetByUserId = vi.fn();
const mockChatServiceUpdate = vi.fn();
const mockChatServiceDelete = vi.fn();
const mockAddMessage = vi.fn();
const mockGetMessages = vi.fn();
const mockDeleteMessage = vi.fn();
const mockEditMessage = vi.fn();

vi.mock('../services/chat.service', () => ({
  chatService: {
    generateSummary: (...args: unknown[]) => mockGenerateSummary(...args),
    getById: (...args: unknown[]) => mockGetById(...args),
    create: (...args: unknown[]) => mockChatServiceCreate(...args),
    getByUserId: (...args: unknown[]) => mockGetByUserId(...args),
    update: (...args: unknown[]) => mockChatServiceUpdate(...args),
    delete: (...args: unknown[]) => mockChatServiceDelete(...args),
    addMessage: (...args: unknown[]) => mockAddMessage(...args),
    getMessages: (...args: unknown[]) => mockGetMessages(...args),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
    editMessage: (...args: unknown[]) => mockEditMessage(...args),
  },
  getChatModel: vi.fn(),
}));

vi.mock('../services/group-chat.service', () => ({
  groupChatService: {
    addCharacter: vi.fn(),
    getChatCharacters: vi.fn(),
    removeCharacter: vi.fn(),
    setStrategy: vi.fn(),
  },
}));

vi.mock('../services/event-bus.service', () => ({
  eventBus: { emit: vi.fn() },
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
    getOrCreate: vi.fn(),
    incrementChats: vi.fn(),
    incrementMessages: vi.fn(),
  },
}));

vi.mock('../config/llm.config', () => ({
  getAvailableModels: () => ['gpt-3.5-turbo'],
}));

vi.mock('../services/logger.service', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../db/schema/chat-snapshots', () => ({
  chatSnapshots: {},
}));

vi.mock('../../db/schema/characters', () => ({
  characters: {},
}));

vi.mock('../../core/errors', async () => {
  const actual = await vi.importActual('../../core/errors');
  return actual;
});

import { chatRoutes } from './chats';

describe('Chat Summary Endpoints', () => {
  let app: Hono;

  const mockUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'test@test.com',
    displayName: 'Test',
    role: 'user',
  };

  const mockChat = {
    id: 'chat-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    title: 'Test Chat',
    summary: 'Existing summary',
    characterId: 'char-1',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', mockUser);
      c.set('tenantId', 'tenant-1');
      await next();
    });
    app.route('/chats', chatRoutes);
  });

  // ── POST /:id/summary ──

  describe('POST /chats/:id/summary', () => {
    it('should generate summary and return it', async () => {
      mockFindById.mockResolvedValue(mockChat);
      mockGenerateSummary.mockResolvedValue('This is a generated summary.');

      const res = await app.request('/chats/chat-1/summary', { method: 'POST' });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.summary).toBe('This is a generated summary.');
      expect(mockGenerateSummary).toHaveBeenCalledWith('chat-1', 'user-1');
    });

    it('should return 404 for non-existent chat', async () => {
      mockFindById.mockResolvedValue(null);

      const res = await app.request('/chats/nonexistent/summary', { method: 'POST' });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 when chat has no messages', async () => {
      mockFindById.mockResolvedValue(mockChat);
      mockGenerateSummary.mockRejectedValue(
        new AppError('No messages to summarize', 400, 'NO_MESSAGES')
      );

      const res = await app.request('/chats/chat-1/summary', { method: 'POST' });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NO_MESSAGES');
    });

    it('should return 404 when chat belongs to another user', async () => {
      mockFindById.mockResolvedValue({ ...mockChat, userId: 'other-user' });

      const res = await app.request('/chats/chat-1/summary', { method: 'POST' });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // ── GET /:id/summary ──

  describe('GET /chats/:id/summary', () => {
    it('should return stored summary', async () => {
      mockFindById.mockResolvedValue(mockChat);

      const res = await app.request('/chats/chat-1/summary');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.summary).toBe('Existing summary');
    });

    it('should return null when no summary exists', async () => {
      mockFindById.mockResolvedValue({ ...mockChat, summary: null });

      const res = await app.request('/chats/chat-1/summary');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.summary).toBeNull();
    });

    it('should return 404 for non-existent chat', async () => {
      mockFindById.mockResolvedValue(null);

      const res = await app.request('/chats/nonexistent/summary');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
