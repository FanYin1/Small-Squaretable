/**
 * 聊天路由测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { chatRoutes } from './chats';
import { chatService } from '../services/chat.service';
import { errorHandler } from '../middleware/error-handler';
import { NotFoundError } from '../../core/errors';

vi.mock('../services/chat.service');

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

  describe('POST /api/v1/chats', () => {
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
      vi.mocked(chatService.create).mockResolvedValue(mockCreatedChat as any);

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
