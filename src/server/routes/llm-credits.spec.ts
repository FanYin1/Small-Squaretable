/**
 * LLM Routes - 预付点数（credits）模式测试（P3-1）
 *
 * credit-generation 被整体替换，这里只验证 llm.ts 如何调用它：
 * 先预扣、把输出上限交给 provider、成功/中断/出错后各自结算或释放、点数不足返回 402。
 * 订阅模式（hold 为 null）的行为由 llm.spec.ts 守住。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { llmRoutes } from './llm';
import { llmService } from '../services/llm.service';
import { usageService } from '../services/usage.service';
import { errorHandler } from '../middleware/error-handler';
import { AppError } from '../../core/errors';
import { InsufficientCreditsError } from '../services/credit-billing.service';
import { reserveForGeneration, settleGeneration, releaseGeneration } from '../services/credit-generation';

vi.mock('../services/llm.service');
vi.mock('../services/usage.service');

vi.mock('../services/spend-breaker.service', () => ({
  spendBreaker: { record: vi.fn().mockResolvedValue(undefined), assertAllowed: vi.fn() },
}));

vi.mock('../services/credit-generation', () => ({
  assertCreditsAvailable: vi.fn(),
  reserveForGeneration: vi.fn(),
  settleGeneration: vi.fn().mockResolvedValue(undefined),
  releaseGeneration: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header) => {
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

vi.mock('../services/feature.service', () => ({
  featureService: { checkQuota: vi.fn() },
}));

vi.mock('../config/llm.config', () => ({
  getAvailableModels: vi.fn(() => ['gpt-3.5-turbo']),
  getAvailableModelsWithMeta: vi.fn(() => []),
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

const HOLD = { id: 'hold-1', tenantId: 'tenant-123', tokens: 6000, maxOutputTokens: 4096 };

const chatResponse = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 1,
  model: 'gpt-3.5-turbo',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hello there' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
};

describe('LLM Routes - prepaid credits', () => {
  let app: Hono;

  beforeEach(async () => {
    app = new Hono();
    app.route('/api/v1/llm', llmRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();

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
    } as never);
    vi.mocked(featureService.checkQuota).mockResolvedValue({
      allowed: true,
      currentUsage: 0,
      limit: Number.MAX_SAFE_INTEGER,
      remaining: Number.MAX_SAFE_INTEGER,
    });
    vi.mocked(usageService.trackUsage).mockResolvedValue({} as never);
    vi.mocked(reserveForGeneration).mockResolvedValue(HOLD as never);
    vi.mocked(settleGeneration).mockResolvedValue(undefined);
    vi.mocked(releaseGeneration).mockResolvedValue(undefined);
    vi.mocked(llmService.calculateTokenUsage).mockReturnValue(18);
  });

  function post(path: string, body: Record<string, unknown>) {
    return app.request(`/api/v1/llm/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    });
  }

  function sse(lines: string[]) {
    return new Response(lines.map((l) => `data: ${l}\n\n`).join(''));
  }

  const delta = (text: string) =>
    JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });

  describe('chat/completions (non-stream)', () => {
    it('reserves first and passes the output cap to the provider', async () => {
      vi.mocked(llmService.chatCompletion).mockResolvedValue(chatResponse as never);

      const res = await post('chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(res.status).toBe(200);
      expect(reserveForGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-123', estimatedPromptTokens: expect.any(Number) })
      );
      expect(llmService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: HOLD.maxOutputTokens })
      );
      expect(vi.mocked(reserveForGeneration).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(llmService.chatCompletion).mock.invocationCallOrder[0]
      );
    });

    it('settles with the provider usage after the reply', async () => {
      vi.mocked(llmService.chatCompletion).mockResolvedValue(chatResponse as never);

      await post('chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(settleGeneration).toHaveBeenCalledTimes(1);
      expect(settleGeneration).toHaveBeenCalledWith(
        HOLD,
        expect.objectContaining({
          outputText: 'Hello there',
          providerUsage: expect.objectContaining({ promptTokens: 10, completionTokens: 8 }),
        })
      );
      expect(releaseGeneration).not.toHaveBeenCalled();
    });

    it('releases the hold when the provider call fails', async () => {
      vi.mocked(llmService.chatCompletion).mockRejectedValue(
        new AppError('provider down', 502, 'PROVIDER_ERROR')
      );

      const res = await post('chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(res.status).toBe(502);
      expect(releaseGeneration).toHaveBeenCalledWith(HOLD);
      expect(settleGeneration).not.toHaveBeenCalled();
    });

    it('returns 402 INSUFFICIENT_CREDITS without calling the provider', async () => {
      vi.mocked(reserveForGeneration).mockRejectedValue(
        new InsufficientCreditsError({ requiredTokens: 6000, availableTokens: 100 })
      );

      const res = await post('chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(res.status).toBe(402);
      expect((await res.json()).error.code).toBe('INSUFFICIENT_CREDITS');
      expect(llmService.chatCompletion).not.toHaveBeenCalled();
      expect(usageService.trackUsage).not.toHaveBeenCalled();
    });

    it('leaves the request untouched when there is no hold (subscription mode)', async () => {
      vi.mocked(reserveForGeneration).mockResolvedValue(null);
      vi.mocked(llmService.chatCompletion).mockResolvedValue(chatResponse as never);

      await post('chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const sent = vi.mocked(llmService.chatCompletion).mock.calls[0][0];
      expect(sent).not.toHaveProperty('max_tokens');
    });
  });

  describe('chat/completions (stream)', () => {
    it('injects the output cap and settles with the provider usage at the end of the stream', async () => {
      const usageChunk = JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 700, completion_tokens: 30, total_tokens: 730 },
      });
      vi.mocked(llmService.streamChatCompletion).mockResolvedValue(
        sse([delta('Hi'), usageChunk, '[DONE]'])
      );

      const res = await post('chat/completions', {
        model: 'gpt-3.5-turbo',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      await res.text();

      expect(llmService.streamChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: HOLD.maxOutputTokens })
      );
      expect(settleGeneration).toHaveBeenCalledTimes(1);
      expect(settleGeneration).toHaveBeenCalledWith(
        HOLD,
        expect.objectContaining({
          outputText: 'Hi',
          providerUsage: expect.objectContaining({ promptTokens: 700, completionTokens: 30 }),
        })
      );
      expect(releaseGeneration).not.toHaveBeenCalled();
    });

    it('releases the hold when the provider connection fails', async () => {
      vi.mocked(llmService.streamChatCompletion).mockRejectedValue(
        new AppError('provider down', 502, 'PROVIDER_ERROR')
      );

      const res = await post('chat/completions', {
        model: 'gpt-3.5-turbo',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(res.status).toBe(502);
      expect(releaseGeneration).toHaveBeenCalledWith(HOLD);
      expect(settleGeneration).not.toHaveBeenCalled();
    });

    it('settles what was produced when the stream breaks halfway', async () => {
      const encoder = new TextEncoder();
      // controller.error() 会丢弃队列里未读的数据，所以用 pull：第一次给数据，第二次才报错
      let pulls = 0;
      const broken = new ReadableStream({
        pull(controller) {
          pulls += 1;
          if (pulls === 1) {
            controller.enqueue(encoder.encode(`data: ${delta('partial')}\n\n`));
          } else {
            controller.error(new Error('socket reset'));
          }
        },
      });
      vi.mocked(llmService.streamChatCompletion).mockResolvedValue(new Response(broken));

      const res = await post('chat/completions', {
        model: 'gpt-3.5-turbo',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      await res.text().catch(() => undefined);

      expect(settleGeneration).toHaveBeenCalledTimes(1);
      expect(settleGeneration).toHaveBeenCalledWith(HOLD, expect.objectContaining({ outputText: 'partial' }));
      expect(releaseGeneration).not.toHaveBeenCalled();
    });

    it('returns 402 before opening the stream when credits are insufficient', async () => {
      vi.mocked(reserveForGeneration).mockRejectedValue(
        new InsufficientCreditsError({ requiredTokens: 6000, availableTokens: 0 })
      );

      const res = await post('chat/completions', {
        model: 'gpt-3.5-turbo',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(res.status).toBe(402);
      expect((await res.json()).error.code).toBe('INSUFFICIENT_CREDITS');
      expect(llmService.streamChatCompletion).not.toHaveBeenCalled();
    });
  });

  describe('completions', () => {
    const completionResponse = {
      id: 'cmpl-1',
      object: 'text_completion',
      created: 1,
      model: 'gpt-3.5-turbo',
      choices: [{ text: ' once more', index: 0, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
    };

    it('reserves, caps the output and settles', async () => {
      vi.mocked(llmService.completion).mockResolvedValue(completionResponse as never);

      const res = await post('completions', { model: 'gpt-3.5-turbo', prompt: 'Once upon a time' });

      expect(res.status).toBe(200);
      expect(llmService.completion).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: HOLD.maxOutputTokens })
      );
      expect(settleGeneration).toHaveBeenCalledWith(
        HOLD,
        expect.objectContaining({ outputText: ' once more' })
      );
    });

    it('honours a smaller max_tokens request through the reservation', async () => {
      vi.mocked(llmService.completion).mockResolvedValue(completionResponse as never);

      await post('completions', { model: 'gpt-3.5-turbo', prompt: 'Once', max_tokens: 100 });

      expect(reserveForGeneration).toHaveBeenCalledWith(expect.objectContaining({ requestedMaxTokens: 100 }));
    });

    it('releases the hold when the provider call fails', async () => {
      vi.mocked(llmService.completion).mockRejectedValue(new AppError('provider down', 502, 'PROVIDER_ERROR'));

      const res = await post('completions', { model: 'gpt-3.5-turbo', prompt: 'Once' });

      expect(res.status).toBe(502);
      expect(releaseGeneration).toHaveBeenCalledWith(HOLD);
      expect(settleGeneration).not.toHaveBeenCalled();
    });
  });
});
