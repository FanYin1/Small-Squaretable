/**
 * LLM Routes Tests
 *
 * 测试 LLM API 路由
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { llmRoutes } from './llm';
import { llmService } from '../services/llm.service';
import { usageService } from '../services/usage.service';
import { errorHandler } from '../middleware/error-handler';
import type { ChatCompletionResponse } from '../../types/llm';

vi.mock('../services/llm.service');
vi.mock('../services/usage.service');

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

vi.mock('../services/feature.service', () => ({
  featureService: {
    checkQuota: vi.fn(),
  },
}));

vi.mock('../config/llm.config', () => ({
  getAvailableModels: vi.fn(() => ['gpt-3.5-turbo', 'gpt-4']),
  findProviderForModel: vi.fn(),
  getDefaultModel: vi.fn(() => 'gpt-3.5-turbo'),
}));

describe('LLM Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/llm', llmRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('POST /api/v1/llm/chat/completions', () => {
    it('should handle chat completion request', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { featureService } = await import('../services/feature.service');

      const mockResponse: ChatCompletionResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
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
      vi.mocked(featureService.checkQuota).mockResolvedValue({
        allowed: true,
        currentUsage: 0,
        limit: 1000000,
        remaining: 1000000,
      });
      vi.mocked(llmService.chatCompletion).mockResolvedValue(mockResponse);
      vi.mocked(llmService.calculateTokenUsage).mockReturnValue(18);
      vi.mocked(usageService.trackUsage).mockResolvedValue({} as any);

      const res = await app.request('/api/v1/llm/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello!' }],
        }),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual(mockResponse);
      expect(llmService.chatCompletion).toHaveBeenCalled();
      expect(usageService.trackUsage).toHaveBeenCalledWith(
        'tenant-123',
        'llm_tokens',
        18,
        expect.any(Object)
      );
    });

    it('should require authentication', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');

      vi.mocked(verifyAccessToken).mockRejectedValue(new Error('Invalid token'));

      const res = await app.request('/api/v1/llm/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello!' }],
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should validate request body', async () => {
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

      const res = await app.request('/api/v1/llm/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: JSON.stringify({
          // Missing required fields
          model: 'gpt-3.5-turbo',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/llm/completions', () => {
    it('should handle text completion request', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { featureService } = await import('../services/feature.service');

      const mockResponse = {
        id: 'cmpl-123',
        object: 'text_completion',
        created: 1677652288,
        model: 'gpt-3.5-turbo',
        choices: [
          {
            text: ' there was a brave knight.',
            index: 0,
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 6,
          total_tokens: 10,
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
      vi.mocked(featureService.checkQuota).mockResolvedValue({
        allowed: true,
        currentUsage: 0,
        limit: 1000000,
        remaining: 1000000,
      });
      vi.mocked(llmService.completion).mockResolvedValue(mockResponse);
      vi.mocked(usageService.trackUsage).mockResolvedValue({} as any);

      const res = await app.request('/api/v1/llm/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          prompt: 'Once upon a time',
        }),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual(mockResponse);
      expect(usageService.trackUsage).toHaveBeenCalledWith(
        'tenant-123',
        'llm_tokens',
        10,
        expect.any(Object)
      );
    });
  });

  describe('GET /api/v1/llm/models', () => {
    it('should return available models', async () => {
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

      const res = await app.request('/api/v1/llm/models', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer token',
        },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('object', 'list');
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
    });
  });
});
