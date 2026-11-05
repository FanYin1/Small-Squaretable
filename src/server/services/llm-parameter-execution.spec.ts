import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LLMProviderConfig, ModelMeta } from '../../types/llm';
const state = vi.hoisted(() => ({ provider: {} as LLMProviderConfig, meta: {} as ModelMeta }));
vi.mock('../config/llm.config', () => ({ findProviderForModel: () => state.provider,
  getDefaultModel: () => 'alias', getModelMeta: () => state.meta }));
vi.mock('./spend-breaker.service', () => ({ spendBreaker: { assertAllowed: vi.fn(), record: vi.fn() } }));
vi.mock('./engineering-story-provider', () => ({ resolveEngineeringStoryProvider: (provider: unknown) => provider }));
import { config } from '../../core/config';
import { LLMService } from './llm.service';
const original = { timeout: config.llmRequestTimeoutMs, retries: config.llmMaxRetries };
const request = { model: 'alias', messages: [{ role: 'user' as const, content: 'synthetic' }], stream: false, n: 1,
  temperature: 0.7, presence_penalty: 0, frequency_penalty: 0 };
beforeEach(() => {
  state.provider = { provider: 'custom', baseUrl: 'https://test.invalid/v1', apiKey: 'synthetic', models: ['alias'] };
  state.meta = { id: 'alias', provider: 'custom', contextWindow: 200000, maxOutputTokens: 128000,
    outputCapabilityTokens: 128000, defaultTemperature: 0.7 };
});
afterEach(() => {
  config.llmRequestTimeoutMs = original.timeout; config.llmMaxRetries = original.retries;
  vi.unstubAllGlobals(); vi.useRealTimers();
});

it.each([false, true])('sends configured capacity to native Ollama for stream=%s', async stream => {
  state.provider = { ...state.provider, provider: 'ollama', baseUrl: 'http://localhost:11434/v1', modelAliases: { alias: 'qwen3.5:4b' } };
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ message: { content: 'done' }, done: true, done_reason: 'stop' }));
  vi.stubGlobal('fetch', fetchMock);
  const service = new LLMService();
  if (stream) await service.streamChatCompletion({ ...request, max_tokens: 10000 });
  else await service.chatCompletion({ ...request, max_tokens: 10000 });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://localhost:11434/api/chat');
  expect(JSON.parse(init.body)).toMatchObject({ model: 'qwen3.5:4b', stream,
    options: { num_ctx: 200000, num_predict: 10000 } });
  expect(JSON.parse(init.body)).not.toHaveProperty('think');
});

it('streams formatted templates with compatibility settings and forwards cancellation', async () => {
  state.provider.requestOptions = { temperature: false, penalties: false, tokenParameter: 'max_completion_tokens' };
  const fetchMock = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n'));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  await new LLMService().streamChatCompletion({ ...request, max_tokens: 10000 }, controller.signal, { templatePrompt: 'formatted prompt' });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://test.invalid/v1/completions');
  const body = JSON.parse(init.body);
  expect(body).toMatchObject({ prompt: 'formatted prompt', max_completion_tokens: 10000, stream: true });
  expect(body).not.toHaveProperty('messages'); expect(body).not.toHaveProperty('temperature');
  expect(body).not.toHaveProperty('presence_penalty');
  controller.abort(); expect(init.signal.aborted).toBe(true);
});

it('preserves the frozen capacity when administrator settings change during a turn', async () => {
  const limits = { ...state.meta, maxOutputTokens: 10000 };
  state.meta.maxOutputTokens = 512;
  const fetchMock = vi.fn().mockResolvedValue(new Response(''));
  vi.stubGlobal('fetch', fetchMock);
  await new LLMService().streamChatCompletion(request, undefined, { limits });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_tokens).toBe(10000);
});

it('rejects over-capacity input before making a provider request', async () => {
  state.meta = { ...state.meta, contextWindow: 1000, maxOutputTokens: 500, outputCapabilityTokens: 500 };
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  await expect(new LLMService().chatCompletion({ ...request, messages: [{ role: 'user', content: '字'.repeat(1000) }] }))
    .rejects.toMatchObject({ code: 'CONTEXT_BUDGET_EXCEEDED' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('uses configured total attempts for ordinary completions', async () => {
  config.llmMaxRetries = 1;
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ error: { message: 'synthetic' } }, { status: 503 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(new LLMService().completion({ ...request, prompt: 'synthetic' })).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('cancels a retry backoff without starting another request', async () => {
  config.llmMaxRetries = 3;
  const controller = new AbortController();
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({}, { status: 503 }));
  vi.stubGlobal('fetch', fetchMock);
  const result = new LLMService().completion({ ...request, prompt: 'synthetic' }, { signal: controller.signal });
  const rejected = expect(result).rejects.toThrow();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  controller.abort(); await rejected;
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each(['ordinary', 'stream-body'] as const)('enforces the configured deadline through %s', async mode => {
  config.llmRequestTimeoutMs = 25;
  const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
    const signal = init.signal as AbortSignal;
    if (mode === 'ordinary') return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    return new Response(new ReadableStream({ start(controller) {
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    } }));
  });
  vi.stubGlobal('fetch', fetchMock);
  const service = new LLMService();
  if (mode === 'ordinary') await expect(service.completion({ ...request, prompt: 'synthetic' })).rejects.toMatchObject({ name: 'TimeoutError' });
  else {
    const response = await service.streamChatCompletion(request);
    await expect(response.text()).rejects.toMatchObject({ name: 'TimeoutError' });
  }
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each(['chat', 'stream', 'template'] as const)('rejects story closing-tag stops before I/O for %s', async mode => {
  const { buildStoryControlSystemPrompt } = await import('./story-control-protocol');
  const prompt = buildStoryControlSystemPrompt();
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const service = new LLMService();
  const story = { ...request, messages: [{ role: 'system' as const, content: prompt }], stop: '</story-intent>' };
  const result = mode === 'chat' ? service.chatCompletion(story) : mode === 'stream' ? service.streamChatCompletion(story)
    : service.streamChatCompletion({ ...request, stop: '</story-intent>' }, undefined, { templatePrompt: prompt });
  await expect(result).rejects.toMatchObject({ code: 'STORY_OUTPUT_CONFIG_CONFLICT' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(['openai_chat', 'text_completion', 'anthropic', 'gemini', 'ollama'] as const)('traces the exact serialized %s request without secrets', async adapter => {
  if (adapter === 'anthropic' || adapter === 'gemini') state.provider.apiFormat = adapter;
  if (adapter === 'ollama') state.provider = { ...state.provider, provider: 'ollama', baseUrl: 'http://localhost:11434/v1' };
  const onDispatch = vi.fn();
  const fetchMock = vi.fn().mockImplementation(async (_url: string, _init: RequestInit) => {
    expect(onDispatch).toHaveBeenCalledOnce();
    return new Response('', { headers: { 'Content-Type': 'text/event-stream' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  await new LLMService().streamChatCompletion({ ...request, max_tokens: 1000 }, undefined,
    { onDispatch, ...(adapter === 'text_completion' ? { templatePrompt: 'PRIVATE_TEMPLATE' } : {}) });
  const body = String(fetchMock.mock.calls[0][1].body);
  const { createHash } = await import('node:crypto');
  expect(onDispatch.mock.calls[0][0]).toEqual({ adapter, outputTokens: 1000, bodyBytes: Buffer.byteLength(body), bodySha256: createHash('sha256').update(body).digest('hex') });
  expect(JSON.stringify(onDispatch.mock.calls)).not.toMatch(/synthetic|PRIVATE_TEMPLATE|test.invalid/);
});
it('diagnostic failure cannot block the actual model request', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(''));
  vi.stubGlobal('fetch', fetchMock);
  await new LLMService().streamChatCompletion(request, undefined, { onDispatch: () => { throw new Error('diagnostic failure'); } });
  expect(fetchMock).toHaveBeenCalledOnce();
});
it('does not record a dispatched request when capacity preflight fails', async () => {
  state.meta = { ...state.meta, contextWindow: 1000, maxOutputTokens: 500, outputCapabilityTokens: 500 };
  const onDispatch = vi.fn(); const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  await expect(new LLMService().streamChatCompletion({ ...request, messages: [{ role: 'user', content: '字'.repeat(1000) }] }, undefined, { onDispatch })).rejects.toThrow();
  expect(onDispatch).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
});
