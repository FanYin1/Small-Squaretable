/**
 * 聊天路由测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { chatRoutes } from './chats';
import { chatService } from '../services/chat.service';
import { chatCreationService } from '../services/chat-creation.service';
import { chatCharacterRepository } from '../../db/repositories/chat-character.repository';
import { characterGrowthRepository } from '../../db/repositories/character-growth.repository';
import { eventBus } from '../services/event-bus.service';
import { errorHandler } from '../middleware/error-handler';
import { AppError, NotFoundError } from '../../core/errors';
import { exportStoryReading } from '../services/story-export.service';
import type { StoryReadingExport } from '../../types/story-export';
import { getStoryMemoryView } from '../services/story-memory-view.service';

vi.mock('../services/chat.service');
vi.mock('../services/story-memory-view.service', () => ({ getStoryMemoryView: vi.fn() }));
vi.mock('../services/story-export.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/story-export.service')>(),
  exportStoryReading: vi.fn(),
}));
vi.mock('../services/chat-creation.service', () => ({ chatCreationService: { create: vi.fn(), lookup: vi.fn() } }));

vi.mock('../../db/repositories/chat.repository', () => ({
  chatRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../services/event-bus.service', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

vi.mock('../services/group-chat.service', () => ({
  groupChatService: {
    addCharacter: vi.fn().mockResolvedValue(undefined),
    removeCharacter: vi.fn().mockResolvedValue(undefined),
    getChatCharacters: vi.fn().mockResolvedValue([]),
    isGroupChat: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('../../db/repositories/chat-character.repository', () => ({
  chatCharacterRepository: {
    batchInsert: vi.fn().mockResolvedValue(undefined),
    addCharacter: vi.fn().mockResolvedValue({}),
    removeCharacter: vi.fn().mockResolvedValue(true),
    getCharacterIds: vi.fn().mockResolvedValue([]),
    getCharacters: vi.fn().mockResolvedValue([]),
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

vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: {
    findByTenantId: vi.fn(),
  },
}));

vi.mock('../services/usage.service', () => ({
  usageService: {
    checkQuota: vi.fn(),
    // meterUsage（services/usage-meter.ts）发消息后会调用
    trackUsage: vi.fn().mockResolvedValue({}),
  },
}));

// 创建聊天后路由会 fire-and-forget 地累加角色成长值
vi.mock('../../db/repositories/character-growth.repository', () => ({
  characterGrowthRepository: {
    getOrCreate: vi.fn().mockResolvedValue({ id: 'growth-1' }),
    incrementChats: vi.fn().mockResolvedValue(undefined),
    incrementMessages: vi.fn().mockResolvedValue(undefined),
  },
}));

// 创建聊天时路由会直接查 characters 表补充角色名称/头像；
// 没有这个 mock 就会去连真实 PostgreSQL（ECONNREFUSED -> 500）
vi.mock('../../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ name: 'Test Character', avatarUrl: null }]),
      })),
    })),
  },
}));

describe('Chat Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/chats', chatRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('story memory progress', () => {
    const chatId = '00000000-0000-4000-8000-000000000001';
    const before = '00000000-0000-4000-8000-000000000002';
    async function authenticate() {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(verifyAccessToken).mockResolvedValue({ userId: 'user-123', tenantId: 'tenant-123', email: 'test@example.com' });
      vi.mocked(userRepository.findById).mockResolvedValue({ id: 'user-123', tenantId: 'tenant-123', isActive: true } as Awaited<ReturnType<typeof userRepository.findById>>);
    }
    it('requires authentication', async () => {
      const response = await app.request(`/api/v1/chats/${chatId}/story-memory`);
      expect(response.status).toBe(401); expect(getStoryMemoryView).not.toHaveBeenCalled();
    });
    it('passes the user, tenant and cursor and disables caching', async () => {
      await authenticate();
      const record = { supported: true, batchSize: 5 as const, counts: { pending: 0, running: 0, retry: 0, failed: 0, succeeded: 0 }, accumulating: [], jobs: [], nextBefore: null };
      vi.mocked(getStoryMemoryView).mockResolvedValueOnce(record);
      const response = await app.request(`/api/v1/chats/${chatId}/story-memory?before=${before}`, { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await response.json()).data).toEqual(record);
      expect(getStoryMemoryView).toHaveBeenCalledExactlyOnceWith(chatId, 'user-123', 'tenant-123', before);
    });
    it.each([`invalid/story-memory`, `${chatId}/story-memory?before=invalid`])('rejects malformed identifiers: %s', async path => {
      await authenticate();
      const response = await app.request(`/api/v1/chats/${path}`, { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(400); expect(getStoryMemoryView).not.toHaveBeenCalled();
    });
    it('does not turn an inaccessible story into an empty successful response', async () => {
      await authenticate(); vi.mocked(getStoryMemoryView).mockRejectedValueOnce(new NotFoundError('Chat'));
      const response = await app.request(`/api/v1/chats/${chatId}/story-memory`, { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(404);
    });
  });

  describe('story reading export', () => {
    const record: StoryReadingExport = {
      format: 'small-squaretable.story-reading', version: 1,
      scope: { purpose: 'player-readable-record', restorable: false, attachments: 'references-only', excluded: ['private-card-content'] },
      chat: { id: 'story-id', title: '记录\r\n"<>', characterId: null, createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z' },
      identity: null, characters: [], snapshots: { contentVersion: 1, worldbookVersion: 1, contentRevision: 'revision', worldbookRevision: 'worldbook' },
      story: { protocol: 1, legacy: false, native: true, version: 1, revision: 'revision', fields: [], actions: [], map: null, events: [],
        notes: [{ id: 'note', kind: 'style', content: '克制对白', createdAt: '2026-10-24T00:00:00.000Z' }] },
      messages: [{ id: 1, role: 'assistant', content: '约定明天继续。\n```\n<script>test</script>', characterId: null, sentAt: '2026-10-24T00:00:00.000Z', attachments: null, stateStatus: 'interrupted' }],
      messageCount: 1, eventCount: 0, exportedAt: '2026-10-24T00:00:00.000Z',
    };
    async function authenticate() {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(verifyAccessToken).mockResolvedValue({ userId: 'user-123', tenantId: 'tenant-123', email: 'test@example.com' });
      vi.mocked(userRepository.findById).mockResolvedValue({ id: 'user-123', tenantId: 'tenant-123', isActive: true } as any);
      vi.mocked(exportStoryReading).mockResolvedValue(record);
    }
    it('exports the versioned reading record with ownership and tenant scope', async () => {
      await authenticate();
      const response = await app.request('/api/v1/chats/story-id/export', { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(record);
      expect(exportStoryReading).toHaveBeenCalledExactlyOnceWith('story-id', 'user-123', 'tenant-123');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="[a-zA-Z0-9_-]+\.json"$/);
    });
    it.each([['txt', 'text/plain', 'txt'], ['markdown', 'text/markdown', 'md']])('downloads %s with continuity and interruption status', async (format, mime, extension) => {
      await authenticate();
      const response = await app.request(`/api/v1/chats/story-id/export?format=${format}`, { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(mime);
      expect(response.headers.get('content-disposition')).toContain(`.${extension}"`);
      const text = await response.text();
      expect(text).toContain('克制对白');
      expect(text).toContain('interrupted');
      expect(text).toContain('不能用于恢复存档');
      expect(text).toContain(record.messages[0].content);
      if (format === 'markdown') expect(text).toContain(`\`\`\`\`text\n${record.messages[0].content}\n\`\`\`\``);
    });
    it.each([new NotFoundError('Chat'), new AppError('Saved story unavailable', 409, 'STORY_STATE_UNAVAILABLE')])('preserves expected failure status: $code', async (error) => {
      await authenticate();
      vi.mocked(exportStoryReading).mockRejectedValue(error);
      const response = await app.request('/api/v1/chats/story-id/export', { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(error.statusCode);
      expect((await response.json()).error.code).toBe(error.code);
      expect(response.headers.get('content-disposition')).toBeNull();
    });
    it('returns an error instead of a partial download on unexpected failure', async () => {
      await authenticate();
      vi.mocked(exportStoryReading).mockRejectedValue(new Error('read failed'));
      const response = await app.request('/api/v1/chats/story-id/export', { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(500);
      expect((await response.json()).error.code).toBe('EXPORT_ERROR');
      expect(response.headers.get('content-disposition')).toBeNull();
    });
    it('rejects unknown formats before reading story data', async () => {
      await authenticate();
      const response = await app.request('/api/v1/chats/story-id/export?format=archive', { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(400);
      expect(exportStoryReading).not.toHaveBeenCalled();
    });
    it('requires authentication before exporting', async () => {
      const response = await app.request('/api/v1/chats/story-id/export');
      expect(response.status).toBe(401);
      expect(exportStoryReading).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/chats/creation-requests/:requestId', () => {
    const requestId = '550e8400-e29b-41d4-a716-446655440003';
    async function authenticate() {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(verifyAccessToken).mockResolvedValue({ userId: 'user-123', tenantId: 'tenant-123', email: 'test@example.com' });
      vi.mocked(userRepository.findById).mockResolvedValue({ id: 'user-123', tenantId: 'tenant-123', isActive: true } as any);
    }

    it.each([
      { protocol: 1 as const, status: 'created' as const, chatId: 'original' },
      { protocol: 1 as const, status: 'deleted' as const },
      { protocol: 1 as const, status: 'not_found' as const },
    ])('returns a scoped read-only result: $status', async (result) => {
      await authenticate();
      vi.mocked(chatCreationService.lookup).mockResolvedValue(result);
      const response = await app.request(`/api/v1/chats/creation-requests/${requestId}`, { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await response.json()).data).toEqual(result);
      expect(chatCreationService.lookup).toHaveBeenCalledExactlyOnceWith('user-123', 'tenant-123', requestId);
      expect(chatCreationService.create).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
      expect(characterGrowthRepository.incrementChats).not.toHaveBeenCalled();
    });

    it('rejects invalid request IDs before lookup', async () => {
      await authenticate();
      const response = await app.request('/api/v1/chats/creation-requests/invalid', { headers: { Authorization: 'Bearer test' } });
      expect(response.status).toBe(400);
      expect(chatCreationService.lookup).not.toHaveBeenCalled();
    });

    it('requires authentication', async () => {
      const response = await app.request(`/api/v1/chats/creation-requests/${requestId}`);
      expect(response.status).toBe(401);
      expect(chatCreationService.lookup).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/chats', () => {
    const keyedInput = {
      characterIds: ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'],
      personaId: '550e8400-e29b-41d4-a716-446655440002',
      clientRequestId: '550e8400-e29b-41d4-a716-446655440003',
    };

    async function keyedRequest(input = keyedInput) {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      vi.mocked(verifyAccessToken).mockResolvedValue({ userId: 'user-123', tenantId: 'tenant-123', email: 'test@example.com' });
      vi.mocked(userRepository.findById).mockResolvedValue({ id: 'user-123', tenantId: 'tenant-123', isActive: true } as any);
      return app.request('/api/v1/chats', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
        body: JSON.stringify(input),
      });
    }

    it.each([true, false])('returns the atomic result without repeating side effects (created=%s)', async (created) => {
      vi.mocked(chatCreationService.create).mockResolvedValue({ chat: { id: 'created', characterId: keyedInput.characterIds[0] } as any, created });
      const response = await keyedRequest();
      expect(response.status).toBe(created ? 201 : 200);
      expect((await response.json()).data.id).toBe('created');
      expect(chatCreationService.create).toHaveBeenCalledWith('user-123', 'tenant-123', keyedInput, expect.any(Function));
      expect(chatService.create).not.toHaveBeenCalled();
      expect(chatCharacterRepository.batchInsert).not.toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledTimes(created ? 1 : 0);
      expect(characterGrowthRepository.getOrCreate).toHaveBeenCalledTimes(created ? 1 : 0);
      expect(characterGrowthRepository.incrementChats).toHaveBeenCalledTimes(created ? 1 : 0);
    });

    it('returns a conflict without falling back to an unkeyed create', async () => {
      vi.mocked(chatCreationService.create).mockRejectedValueOnce(new AppError('Different input', 409, 'IDEMPOTENCY_CONFLICT'));
      const response = await keyedRequest();
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(chatService.create).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('rejects invalid request keys before creating a story', async () => {
      expect((await keyedRequest({ ...keyedInput, clientRequestId: 'invalid' })).status).toBe(400);
      expect(chatCreationService.create).not.toHaveBeenCalled();
    });

    it('should create a new chat', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const createData = {
        characterId: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
        title: 'Test Chat',
        metadata: { theme: 'dark' },
      };

      const mockCreatedChat = {
        id: 'chat-123',
        ...createData,
        tenantId: 'tenant-123',
        userId: 'user-123',
        summary: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

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
      vi.mocked(chatCreationService.create).mockResolvedValue({ chat: mockCreatedChat as any, created: true });

      const res = await app.request('/api/v1/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(chatCreationService.create).toHaveBeenCalledWith('user-123', 'tenant-123', {
        ...createData, clientRequestId: expect.stringMatching(/^[a-f0-9-]{36}$/),
      }, expect.any(Function));
      expect(chatService.create).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid input', async () => {
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

      const res = await app.request('/api/v1/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify({
          characterId: 'invalid-uuid', // Invalid UUID
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/chats', () => {
    it('should return user chats with pagination', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const mockResponse = {
        items: [
          {
            id: 'chat-1',
            title: 'Chat 1',
            userId: 'user-123',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

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
      vi.mocked(chatService.getByUserId).mockResolvedValue(mockResponse as any);

      const res = await app.request('/api/v1/chats?page=1&limit=20', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/v1/chats/:id', () => {
    it('should return chat by id', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const mockChat = {
        id: 'chat-123',
        title: 'Test Chat',
        userId: 'user-123',
        tenantId: 'tenant-123',
      };

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
      vi.mocked(chatService.getById).mockResolvedValue(mockChat as any);

      const res = await app.request('/api/v1/chats/chat-123', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 if chat not found', async () => {
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
      vi.mocked(chatService.getById).mockRejectedValue(new NotFoundError('Chat'));

      const res = await app.request('/api/v1/chats/non-existent', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/chats/:id', () => {
    it('should update chat', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const updateData = { title: 'Updated Title' };
      const mockUpdatedChat = {
        id: 'chat-123',
        ...updateData,
        userId: 'user-123',
        tenantId: 'tenant-123',
      };

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
      vi.mocked(chatService.update).mockResolvedValue(mockUpdatedChat as any);

      const res = await app.request('/api/v1/chats/chat-123', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify(updateData),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 if chat not found', async () => {
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
      vi.mocked(chatService.update).mockRejectedValue(new NotFoundError('Chat'));

      const res = await app.request('/api/v1/chats/non-existent', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify({ title: 'New Title' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/chats/:id', () => {
    it('should delete chat', async () => {
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
      vi.mocked(chatService.delete).mockResolvedValue(undefined);

      const res = await app.request('/api/v1/chats/chat-123', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 if chat not found', async () => {
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
      vi.mocked(chatService.delete).mockRejectedValue(new NotFoundError('Chat'));

      const res = await app.request('/api/v1/chats/non-existent', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/chats/:id/messages', () => {
    it('should add message to chat', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');
      const { usageService } = await import('../services/usage.service');
      const { chatRepository } = await import('../../db/repositories/chat.repository');

      const messageData = {
        role: 'user',
        content: 'Hello',
        attachments: [],
      };

      const mockMessage = {
        id: 1,
        chatId: 'chat-123',
        ...messageData,
        extra: null,
        sentAt: new Date(),
      };

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
      vi.spyOn(subscriptionRepository, 'findByTenantId').mockResolvedValue({
        id: 'sub-123',
        tenantId: 'tenant-123',
        plan: 'free',
        status: 'active',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(usageService.checkQuota).mockResolvedValue({
        allowed: true,
        currentUsage: 50,
        limit: 100,
        remaining: 50,
      });
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: 'chat-123',
        userId: 'user-123',
        tenantId: 'tenant-123',
      } as any);
      vi.mocked(chatService.addMessage).mockResolvedValue(mockMessage as any);

      const res = await app.request('/api/v1/chats/chat-123/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify(messageData),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 400 for invalid message', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');
      const { usageService } = await import('../services/usage.service');

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
      vi.spyOn(subscriptionRepository, 'findByTenantId').mockResolvedValue({
        id: 'sub-123',
        tenantId: 'tenant-123',
        plan: 'free',
        status: 'active',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(usageService.checkQuota).mockResolvedValue({
        allowed: true,
        currentUsage: 50,
        limit: 100,
        remaining: 50,
      });

      const res = await app.request('/api/v1/chats/chat-123/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify({
          role: 'user',
          content: '', // Invalid: empty content
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/chats/:id/messages', () => {
    it('should return messages for chat', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { chatRepository } = await import('../../db/repositories/chat.repository');

      const mockMessages = [
        {
          id: 2,
          chatId: 'chat-123',
          role: 'assistant',
          content: 'Hi there',
          sentAt: new Date(),
        },
        {
          id: 1,
          chatId: 'chat-123',
          role: 'user',
          content: 'Hello',
          sentAt: new Date(),
        },
      ];

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
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: 'chat-123',
        userId: 'user-123',
        tenantId: 'tenant-123',
      } as any);
      vi.mocked(chatService.getMessages).mockResolvedValue(mockMessages as any);

      const res = await app.request('/api/v1/chats/chat-123/messages?limit=20', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('Feature Gate Tests', () => {
    describe('POST /api/v1/chats/:id/messages - Quota Check', () => {
      it('should reject users who exceeded message quota', async () => {
        const { verifyAccessToken } = await import('../../core/jwt');
        const { userRepository } = await import('../../db/repositories/user.repository');
        const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');
        const { usageService } = await import('../services/usage.service');

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
        vi.spyOn(subscriptionRepository, 'findByTenantId').mockResolvedValue({
          id: 'sub-123',
          tenantId: 'tenant-123',
          plan: 'free',
          status: 'active',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        vi.mocked(usageService.checkQuota).mockResolvedValue({
          allowed: false,
          currentUsage: 100,
          limit: 100,
          remaining: 0,
        });

        const res = await app.request('/api/v1/chats/chat-123/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token',
          },
          body: JSON.stringify({
            role: 'user',
            content: 'Hello',
            attachments: [],
          }),
        });

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toBe('Quota exceeded');
        expect(data.resourceType).toBe('messages');
        expect(data.currentUsage).toBe(100);
        expect(data.limit).toBe(100);
      });

      it('should allow users with available quota to send messages', async () => {
        const { verifyAccessToken } = await import('../../core/jwt');
        const { userRepository } = await import('../../db/repositories/user.repository');
        const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');
        const { usageService } = await import('../services/usage.service');
        const { chatRepository } = await import('../../db/repositories/chat.repository');

        const messageData = {
          role: 'user',
          content: 'Hello',
          attachments: [],
        };

        const mockMessage = {
          id: 1,
          chatId: 'chat-123',
          ...messageData,
          extra: null,
          sentAt: new Date(),
        };

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
        vi.spyOn(subscriptionRepository, 'findByTenantId').mockResolvedValue({
          id: 'sub-123',
          tenantId: 'tenant-123',
          plan: 'free',
          status: 'active',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        vi.mocked(usageService.checkQuota).mockResolvedValue({
          allowed: true,
          currentUsage: 50,
          limit: 100,
          remaining: 50,
        });
        vi.mocked(chatRepository.findById).mockResolvedValue({
          id: 'chat-123',
          userId: 'user-123',
          tenantId: 'tenant-123',
        } as any);
        vi.mocked(chatService.addMessage).mockResolvedValue(mockMessage as any);

        const res = await app.request('/api/v1/chats/chat-123/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token',
          },
          body: JSON.stringify(messageData),
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
      });

      it('should allow pro users with higher quota to send messages', async () => {
        const { verifyAccessToken } = await import('../../core/jwt');
        const { userRepository } = await import('../../db/repositories/user.repository');
        const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');
        const { usageService } = await import('../services/usage.service');
        const { chatRepository } = await import('../../db/repositories/chat.repository');

        const messageData = {
          role: 'user',
          content: 'Hello from Pro user',
          attachments: [],
        };

        const mockMessage = {
          id: 1,
          chatId: 'chat-123',
          ...messageData,
          extra: null,
          sentAt: new Date(),
        };

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
        vi.spyOn(subscriptionRepository, 'findByTenantId').mockResolvedValue({
          id: 'sub-123',
          tenantId: 'tenant-123',
          plan: 'pro',
          status: 'active',
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        vi.mocked(usageService.checkQuota).mockResolvedValue({
          allowed: true,
          currentUsage: 5000,
          limit: 10000,
          remaining: 5000,
        });
        vi.mocked(chatRepository.findById).mockResolvedValue({
          id: 'chat-123',
          userId: 'user-123',
          tenantId: 'tenant-123',
        } as any);
        vi.mocked(chatService.addMessage).mockResolvedValue(mockMessage as any);

        const res = await app.request('/api/v1/chats/chat-123/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token',
          },
          body: JSON.stringify(messageData),
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
      });
    });
  });
});
