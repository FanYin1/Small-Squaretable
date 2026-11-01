import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChatCompletionRequest, LLMProviderConfig } from '../../types/llm';
const state = vi.hoisted(() => ({ provider: {} as LLMProviderConfig, record: vi.fn() }));
vi.mock('../config/llm.config', () => ({ findProviderForModel: () => state.provider, getDefaultModel: () => 'public-alias' }));
vi.mock('./spend-breaker.service', () => ({ spendBreaker: { assertAllowed: vi.fn(), record: state.record } }));
vi.mock('./engineering-story-provider', () => ({ resolveEngineeringStoryProvider: (provider: unknown) => provider }));
import { LLMService } from './llm.service';
const request: ChatCompletionRequest = { model: 'public-alias', messages: [{ role: 'user', content: 'Hi' }], stream: false, n: 1, temperature: 0.7, presence_penalty: 0, frequency_penalty: 0 };
beforeEach(() => {
  state.provider = { provider: 'custom', apiKey: 'synthetic-key', baseUrl: 'https://test.invalid/v1/', models: ['public-alias'], modelAliases: { 'public-alias': 'upstream-id' } };
  state.record.mockClear();
});
afterEach(() => vi.unstubAllGlobals());
it('routes ordinary Anthropic calls to Messages and records actual usage', async () => {
  state.provider.apiFormat = 'anthropic';
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'm', type: 'message', content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn', usage: { input_tokens: 11, output_tokens: 2 } }));
  vi.stubGlobal('fetch', fetchMock);
  const result = await new LLMService().chatCompletion(request);
  expect(fetchMock.mock.calls[0][0]).toBe('https://test.invalid/v1/messages');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: 'upstream-id' });
  expect(result.model).toBe('public-alias'); expect(state.record).toHaveBeenCalledWith(13);
});
it('routes native Gemini aliases without exposing upstream IDs as public models', async () => {
  state.provider.apiFormat = 'gemini';
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: 'Hello' }] }, finishReason: 'STOP' }] }));
  vi.stubGlobal('fetch', fetchMock);
  const result = await new LLMService().chatCompletion(request);
  expect(fetchMock.mock.calls[0][0]).toBe('https://test.invalid/v1/models/upstream-id:generateContent');
  expect(result.model).toBe('public-alias');
});
it('uses per-channel compatibility options on ordinary and streamed OpenAI calls', async () => {
  state.provider.requestOptions = { temperature: false, penalties: false, tokenParameter: 'max_completion_tokens', streamUsage: false };
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ model: 'upstream-id', choices: [] }));
  vi.stubGlobal('fetch', fetchMock);
  await new LLMService().chatCompletion({ ...request, max_tokens: 200 });
  const controller = new AbortController();
  await new LLMService().streamChatCompletion({ ...request, max_tokens: 200 }, undefined, { signal: controller.signal });
  for (const [url, init] of fetchMock.mock.calls) {
    expect(url).toBe('https://test.invalid/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'upstream-id', max_completion_tokens: 200 });
    expect(body.temperature).toBeUndefined(); expect(body.presence_penalty).toBeUndefined(); expect(body.stream_options).toBeUndefined();
  }
  expect(fetchMock.mock.calls[1][1].signal).toBe(controller.signal);
});
it('normalizes the Anthropic stream through the service and preserves cancellation signal', async () => {
  state.provider.apiFormat = 'anthropic';
  const events = [{ type: 'message_start', message: { usage: { input_tokens: 3, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'Hello' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }, { type: 'message_stop' }];
  const fetchMock = vi.fn().mockResolvedValue(new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } }));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  const result = await new LLMService().streamChatCompletion(request, controller.signal);
  expect(fetchMock.mock.calls[0][0]).toBe('https://test.invalid/v1/messages');
  expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  const text = await result.text();
  expect(text).toContain('Hello'); expect(text).toContain('"total_tokens":5'); expect(text).toContain('[DONE]');
  expect(state.record).not.toHaveBeenCalled(); // Stream caller performs settlement.
});
