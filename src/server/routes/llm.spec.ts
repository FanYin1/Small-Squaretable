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
import { AppError } from '../../core/errors';
import type { ChatCompletionResponse } from '../../types/llm';

vi.mock('../services/llm.service');
vi.mock('../services/usage.service');

const { mockSpendRecord } = vi.hoisted(() => ({ mockSpendRecord: vi.fn() }));
vi.mock('../services/spend-breaker.service', () => ({
  spendBreaker: { record: mockSpendRecord, assertAllowed: vi.fn() },
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

vi.mock('../services/feature.service', () => ({
  featureService: {
    checkQuota: vi.fn(),
  },
}));

vi.mock('../config/llm.config', () => ({
  getAvailableModels: vi.fn(() => ['gpt-3.5-turbo', 'gpt-4']),
  getAvailableModelsWithMeta: vi.fn(() => [
    { id: 'gpt-3.5-turbo', provider: 'openai', contextWindow: 16385, maxOutputTokens: 4096, defaultTemperature: 0.7 },
    { id: 'gpt-4', provider: 'openai', contextWindow: 8192, maxOutputTokens: 4096, defaultTemperature: 0.7 },
  ]),
  findProviderForModel: vi.fn(),
  getDefaultModel: vi.fn(() => 'gpt-3.5-turbo'),
  getModelMeta: vi.fn((model: string) => ({
    id: model,
    provider: 'openai',
    contextWindow: 4096,
    maxOutputTokens: 2048,
    defaultTemperature: 0.7,
  })),
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

  // P0-1 / P0-7：HTTP 通道的流式计量口径与熔断错误展示
  describe('POST /api/v1/llm/chat/completions (billing basis and spend breaker)', () => {
    async function authorize() {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');
      const { featureService } = await import('../services/feature.service');
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
      vi.mocked(usageService.trackUsage).mockResolvedValue({} as any);
      mockSpendRecord.mockResolvedValue(undefined);
    }

    function sse(lines: string[]) {
      return new Response(lines.map((l) => `data: ${l}\n\n`).join(''));
    }

    function post(body: Record<string, unknown>) {
      return app.request('/api/v1/llm/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
        body: JSON.stringify(body),
      });
    }

    const delta = (text: string) =>
      JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });

    it('meters prompt + output for a streamed reply when the provider sends no usage', async () => {
      await authorize();
      vi.mocked(llmService.streamChatCompletion).mockResolvedValue(sse([delta('Hi'), '[DONE]']));

      const res = await post({
        model: 'gpt-3.5-turbo',
        stream: true,
        messages: [{ role: 'user', content: '好'.repeat(1000) }],
      });
      await res.text();

      const call = vi.mocked(usageService.trackUsage).mock.calls.find((c) => c[1] === 'llm_tokens');
      expect(call).toBeDefined();
      expect(call![2]).toBeGreaterThan(1000);
      expect(call![3]).toEqual(expect.objectContaining({ tokenSource: 'estimate', stream: true }));
    });

    it('prefers the usage the provider reports at the end of the stream', async () => {
      await authorize();
      const usageChunk = JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 777, completion_tokens: 23, total_tokens: 800 },
      });
      vi.mocked(llmService.streamChatCompletion).mockResolvedValue(
        sse([delta('Hi'), usageChunk, '[DONE]'])
      );

      const res = await post({
        model: 'gpt-3.5-turbo',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      await res.text();

      expect(usageService.trackUsage).toHaveBeenCalledWith(
        'tenant-123',
        'llm_tokens',
        800,
        expect.objectContaining({ tokenSource: 'provider' })
      );
      expect(mockSpendRecord).toHaveBeenCalledWith(800);
    });

    // 熔断触发时必须是可读的 JSON 错误，而不是 500
    it('returns a readable 503 PLATFORM_SPEND_LIMIT instead of a 500 for streams', async () => {
      await authorize();
      vi.mocked(llmService.streamChatCompletion).mockRejectedValue(
        new AppError('The platform has reached its daily usage limit. Please try again tomorrow.', 503, 'PLATFORM_SPEND_LIMIT')
      );

      const res = await post({
        model: 'gpt-3.5-turbo',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PLATFORM_SPEND_LIMIT');
      expect(data.error.message).toContain('daily usage limit');
    });

    it('returns a readable 503 PLATFORM_SPEND_LIMIT for non-streaming requests too', async () => {
      await authorize();
      vi.mocked(llmService.chatCompletion).mockRejectedValue(
        new AppError('The platform has reached its daily usage limit. Please try again tomorrow.', 503, 'PLATFORM_SPEND_LIMIT')
      );

      const res = await post({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe('PLATFORM_SPEND_LIMIT');
      expect(usageService.trackUsage).not.toHaveBeenCalled();
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
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data[0]).toHaveProperty('id');
      expect(data.data[0]).toHaveProperty('provider');
      expect(data.data[0]).toHaveProperty('contextWindow');
      expect(data.data[0]).toHaveProperty('maxOutputTokens');
      expect(data.data[0]).toHaveProperty('defaultTemperature');
    });
  });
});
