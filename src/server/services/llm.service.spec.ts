/**
 * LLM Service Tests
 *
 * 测试 LLM 代理服务的核心功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMService } from './llm.service';
import { AppError } from '../../core/errors';
import type { ChatCompletionRequest } from '../../types/llm';

// Mock the LLM config
vi.mock('../config/llm.config', () => ({
  findProviderForModel: vi.fn(() => ({
    provider: 'openai',
    apiKey: 'test-api-key',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-3.5-turbo', 'gpt-4'],
    defaultModel: 'gpt-3.5-turbo',
  })),
  getDefaultModel: vi.fn(() => 'gpt-3.5-turbo'),
  getAvailableModels: vi.fn(() => ['gpt-3.5-turbo', 'gpt-4']),
}));

const spendBreakerMock = vi.hoisted(() => ({
  assertAllowed: vi.fn(),
  record: vi.fn(),
}));
vi.mock('./spend-breaker.service', () => ({ spendBreaker: spendBreakerMock }));

describe('LLMService', () => {
  let llmService: LLMService;

  beforeEach(() => {
    llmService = new LLMService();
    vi.clearAllMocks();
    spendBreakerMock.assertAllowed.mockResolvedValue(undefined);
    spendBreakerMock.record.mockResolvedValue(undefined);
  });

  describe('chatCompletion', () => {
    it('lets the durable queue own retries and passes its abort signal', async () => {
      const signal = new AbortController().signal;
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
      await expect(llmService.chatCompletion({ model: 'gpt-3.5-turbo', messages: [], stream: false },
        { signal, maxAttempts: 1 })).rejects.toThrow();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal }));
    });

    it('does not start a request when the queue deadline has expired', async () => {
      const controller = new AbortController();
      controller.abort();
      global.fetch = vi.fn();
      await expect(llmService.chatCompletion({ model: 'gpt-3.5-turbo', messages: [], stream: false },
        { signal: controller.signal, maxAttempts: 1 })).rejects.toThrow();
      expect(global.fetch).not.toHaveBeenCalled();
    });
    it('should make a successful chat completion request', async () => {
      const request: ChatCompletionRequest = {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello!' },
        ],
        temperature: 0.7,
        stream: false,
      };

      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-3.5-turbo',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello! How can I help you today?',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 10,
            total_tokens: 30,
          },
        }),
      });

      const response = await llmService.chatCompletion(request);

      expect(response).toBeDefined();
      expect(response.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(response.usage.total_tokens).toBe(30);
    });

    it('should handle API errors gracefully', async () => {
      const request: ChatCompletionRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello!' }],
        stream: false,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_error',
          },
        }),
      });

      await expect(llmService.chatCompletion(request)).rejects.toThrow();
    });

    it('should retry on transient failures', async () => {
      const request: ChatCompletionRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello!' }],
        stream: false,
      };

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1677652288,
            model: 'gpt-3.5-turbo',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Success!' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        });
      });

      const response = await llmService.chatCompletion(request);
      expect(response.choices[0].message.content).toBe('Success!');
      expect(callCount).toBe(3);
    });
  });

  describe('streamChatCompletion', () => {
    it('should handle streaming responses', async () => {
      const request: ChatCompletionRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello!' }],
        stream: true,
      };

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}\n\n'
            )
          );
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const stream = await llmService.streamChatCompletion(request);
      expect(stream).toBeDefined();
      expect(stream.body).toBeDefined();
    });
  });

  describe('completion', () => {
    it('should make a successful text completion request', async () => {
      const request = {
        model: 'gpt-3.5-turbo',
        prompt: 'Once upon a time',
        max_tokens: 50,
        stream: false,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
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
        }),
      });

      const response = await llmService.completion(request);
      expect(response.choices[0].text).toBe(' there was a brave knight.');
      expect(response.usage.total_tokens).toBe(10);
    });
  });

  // P0-7：所有生成都经过 llm.service，在这里统一过平台花费熔断
  describe('platform spend breaker gate', () => {
    const chatRequest: ChatCompletionRequest = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: false,
    };
    const limitError = new AppError('daily usage limit', 503, 'PLATFORM_SPEND_LIMIT');

    function mockOkJson(body: unknown) {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    }

    it('rejects chatCompletion before calling the provider when the breaker trips', async () => {
      global.fetch = vi.fn();
      spendBreakerMock.assertAllowed.mockRejectedValue(limitError);

      await expect(llmService.chatCompletion(chatRequest)).rejects.toMatchObject({
        code: 'PLATFORM_SPEND_LIMIT',
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects streamChatCompletion before calling the provider when the breaker trips', async () => {
      global.fetch = vi.fn();
      spendBreakerMock.assertAllowed.mockRejectedValue(limitError);

      await expect(llmService.streamChatCompletion({ ...chatRequest, stream: true })).rejects.toMatchObject({
        code: 'PLATFORM_SPEND_LIMIT',
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects completion before calling the provider when the breaker trips', async () => {
      global.fetch = vi.fn();
      spendBreakerMock.assertAllowed.mockRejectedValue(limitError);

      await expect(
        llmService.completion({ model: 'gpt-3.5-turbo', prompt: 'hi', max_tokens: 5, stream: false })
      ).rejects.toMatchObject({ code: 'PLATFORM_SPEND_LIMIT' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('does not retry a breaker rejection', async () => {
      global.fetch = vi.fn();
      spendBreakerMock.assertAllowed.mockRejectedValue(limitError);

      await llmService.chatCompletion(chatRequest).catch(() => undefined);
      expect(spendBreakerMock.assertAllowed).toHaveBeenCalledTimes(1);
    });

    it('records provider usage for non-streaming chat completions', async () => {
      mockOkJson({
        id: 'x',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 40, completion_tokens: 2, total_tokens: 42 },
      });

      await llmService.chatCompletion(chatRequest);
      expect(spendBreakerMock.record).toHaveBeenCalledWith(42);
    });

    it('records an estimate when the provider omits usage', async () => {
      mockOkJson({
        id: 'x',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi there' }, finish_reason: 'stop' }],
      });

      await llmService.chatCompletion(chatRequest);
      const [recorded] = spendBreakerMock.record.mock.calls[0];
      expect(recorded).toBeGreaterThan(0);
    });

    it('records provider usage for text completions', async () => {
      mockOkJson({
        id: 'c',
        choices: [{ text: 'x', index: 0, finish_reason: 'stop' }],
        usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
      });

      await llmService.completion({ model: 'gpt-3.5-turbo', prompt: 'hi', max_tokens: 5, stream: false });
      expect(spendBreakerMock.record).toHaveBeenCalledWith(10);
    });

    it('does not record anything when the provider call fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'bad' } }),
      });

      await llmService.chatCompletion(chatRequest).catch(() => undefined);
      expect(spendBreakerMock.record).not.toHaveBeenCalled();
    });

    it('does not fail the reply when recording fails', async () => {
      spendBreakerMock.record.mockRejectedValue(new Error('redis down'));
      mockOkJson({
        id: 'x',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      await expect(llmService.chatCompletion(chatRequest)).resolves.toBeDefined();
    });

    // 流式的累加在调用方（拿得到 usage/估算的地方）做，这里只负责闸
    it('does not record for streaming (callers record the real amount)', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, body: new ReadableStream() });

      await llmService.streamChatCompletion({ ...chatRequest, stream: true });
      expect(spendBreakerMock.record).not.toHaveBeenCalled();
    });
  });

  // P0-1：请求 provider 在流末尾返回 usage，作为计费的首选来源
  describe('streamChatCompletion include_usage', () => {
    const streamRequest: ChatCompletionRequest = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello!' }],
      stream: true,
    };

    function sentBody(): any {
      const call = (global.fetch as any).mock.calls[0];
      return JSON.parse(call[1].body);
    }

    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, body: new ReadableStream() });
    });

    afterEach(() => {
      delete process.env.LLM_STREAM_INCLUDE_USAGE;
    });

    it('asks the provider to include usage in the stream', async () => {
      await llmService.streamChatCompletion(streamRequest);
      expect(sentBody().stream_options).toEqual({ include_usage: true });
    });

    it('keeps other stream_options the caller set', async () => {
      await llmService.streamChatCompletion({
        ...streamRequest,
        stream_options: { custom: 1 },
      } as ChatCompletionRequest);
      expect(sentBody().stream_options).toEqual({ custom: 1, include_usage: true });
    });

    it('can be switched off for providers that reject stream_options', async () => {
      process.env.LLM_STREAM_INCLUDE_USAGE = 'false';
      await llmService.streamChatCompletion(streamRequest);
      expect(sentBody().stream_options).toBeUndefined();
    });
  });

  describe('countTokens', () => {
    it('should estimate token count for text', () => {
      const text = 'Hello, world! This is a test.';
      const tokens = llmService.countTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20);
    });

    it('should handle empty text', () => {
      const tokens = llmService.countTokens('');
      expect(tokens).toBe(0);
    });
  });
});
