/**
 * LLM Service Tests
 *
 * 测试 LLM 代理服务的核心功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMService } from './llm.service';
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

describe('LLMService', () => {
  let llmService: LLMService;

  beforeEach(() => {
    llmService = new LLMService();
    vi.clearAllMocks();
  });

  describe('chatCompletion', () => {
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
