/**
 * P3-3 前缀缓存命中计量：各 provider 字段解析 + 流式 / 非流式日志
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const log = vi.hoisted(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('./logger.service', () => ({
  logger: { child: () => log, ...log },
  createLogger: () => log,
}));
vi.mock('../config/llm.config', () => ({
  findProviderForModel: vi.fn(() => ({
    provider: 'openai',
    apiKey: 'k',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4'],
    defaultModel: 'gpt-4',
  })),
  getDefaultModel: vi.fn(() => 'gpt-4'),
}));
vi.mock('./spend-breaker.service', () => ({
  spendBreaker: { assertAllowed: vi.fn().mockResolvedValue(undefined), record: vi.fn().mockResolvedValue(undefined) },
}));

import { LLMService, readCacheUsage } from './llm.service';
import type { ChatCompletionRequest } from '../../types/llm';

describe('readCacheUsage', () => {
  it('OpenAI-compatible: prompt_tokens_details.cached_tokens', () => {
    expect(
      readCacheUsage({ prompt_tokens: 2000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 1536 } })
    ).toEqual({ promptTokens: 2000, cachedTokens: 1536, cacheCreationTokens: null });
  });

  it('GLM uses the same OpenAI-compatible field', () => {
    expect(
      readCacheUsage({ prompt_tokens: 900, total_tokens: 950, prompt_tokens_details: { cached_tokens: 640 } })
    ).toMatchObject({ promptTokens: 900, cachedTokens: 640 });
  });

  it('Anthropic via OpenAI-compat layer: cache_read_input_tokens + cache_creation_input_tokens', () => {
    expect(
      readCacheUsage({ prompt_tokens: 1200, cache_read_input_tokens: 1000, cache_creation_input_tokens: 150 })
    ).toEqual({ promptTokens: 1200, cachedTokens: 1000, cacheCreationTokens: 150 });
  });

  it('Anthropic native shape: input_tokens excludes cache, so prompt total is the sum', () => {
    expect(
      readCacheUsage({ input_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 150 })
    ).toEqual({ promptTokens: 1200, cachedTokens: 1000, cacheCreationTokens: 150 });
  });

  it('DeepSeek: prompt_cache_hit_tokens', () => {
    expect(
      readCacheUsage({ prompt_tokens: 800, prompt_cache_hit_tokens: 512, prompt_cache_miss_tokens: 288 })
    ).toMatchObject({ promptTokens: 800, cachedTokens: 512 });
  });

  it('Moonshot-style top-level cached_tokens', () => {
    expect(readCacheUsage({ prompt_tokens: 300, cached_tokens: 128 })).toMatchObject({ cachedTokens: 128 });
  });

  it('an explicit 0 is kept (provider says no hit), distinct from null (unknown)', () => {
    expect(readCacheUsage({ prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 0 } }).cachedTokens).toBe(0);
    expect(readCacheUsage({ prompt_tokens: 100 }).cachedTokens).toBeNull();
  });

  it('Ollama native: prompt_eval_count, no cache field', () => {
    expect(readCacheUsage({ prompt_eval_count: 420, eval_count: 30 })).toEqual({
      promptTokens: 420,
      cachedTokens: null,
      cacheCreationTokens: null,
    });
  });

  it('returns nulls for missing or malformed usage', () => {
    const empty = { promptTokens: null, cachedTokens: null, cacheCreationTokens: null };
    expect(readCacheUsage(undefined)).toEqual(empty);
    expect(readCacheUsage(null)).toEqual(empty);
    expect(readCacheUsage('x')).toEqual(empty);
    expect(readCacheUsage({ prompt_tokens: 'many', prompt_tokens_details: { cached_tokens: -5 } })).toEqual(empty);
  });
});

describe('cache usage logging', () => {
  const originalLayout = process.env.PROMPT_LAYOUT;
  const request: ChatCompletionRequest = {
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false,
  };
  let service: LLMService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LLMService();
    process.env.PROMPT_LAYOUT = 'cache_friendly';
  });

  afterEach(() => {
    if (originalLayout === undefined) delete process.env.PROMPT_LAYOUT;
    else process.env.PROMPT_LAYOUT = originalLayout;
  });

  it('non-stream: logs layout, promptTokens, cachedTokens, chatId, model at info', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'x',
        choices: [{ message: { role: 'assistant', content: 'yo' } }],
        usage: { prompt_tokens: 2000, completion_tokens: 10, total_tokens: 2010, prompt_tokens_details: { cached_tokens: 1500 } },
      }),
    });

    await service.chatCompletion(request, { chatId: 'chat-1' });

    expect(log.info).toHaveBeenCalledWith(
      'LLM prompt cache usage',
      expect.objectContaining({
        layout: 'cache_friendly',
        model: 'gpt-4',
        chatId: 'chat-1',
        stream: false,
        promptTokens: 2000,
        cachedTokens: 1500,
        cacheHitRatio: 0.75,
      })
    );
  });

  it('non-stream without chatId (internal calls) logs at debug only', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'x', choices: [], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } }),
    });
    await service.chatCompletion(request);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalledWith(
      'LLM prompt cache usage',
      expect.objectContaining({ chatId: null, cachedTokens: null, cacheHitRatio: null })
    );
  });

  it('stream: forwards bytes untouched and logs usage found in the final SSE chunk', async () => {
    const encoder = new TextEncoder();
    const lines = [
      'data: {"choices":[{"delta":{"content":"He"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
      // usage 行被拆成两个网络分片，验证跨分片缓冲
      'data: {"choices":[],"usage":{"prompt_tokens":3000,"completion_tokens":20,',
      '"prompt_tokens_details":{"cached_tokens":2048}}}\n\n',
      'data: [DONE]\n\n',
    ];
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        lines.forEach((l) => controller.enqueue(encoder.encode(l)));
        controller.close();
      },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: upstream,
    });

    const response = await service.streamChatCompletion({ ...request, stream: true }, undefined, { chatId: 'chat-2' });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toBe(lines.join(''));

    expect(log.info).toHaveBeenCalledWith(
      'LLM prompt cache usage',
      expect.objectContaining({
        layout: 'cache_friendly',
        chatId: 'chat-2',
        model: 'gpt-4',
        stream: true,
        promptTokens: 3000,
        cachedTokens: 2048,
      })
    );
  });

  it('stream without any usage chunk logs nothing and does not break the stream', async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: upstream });

    const response = await service.streamChatCompletion({ ...request, stream: true }, undefined, { chatId: 'c' });
    expect(await response.text()).toBe('data: [DONE]\n\n');
    expect(log.info).not.toHaveBeenCalled();
  });
});
