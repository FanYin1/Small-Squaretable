import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGeminiRequest, convertGeminiStream, readGeminiCompletion } from './gemini-adapter';
import { LLMService } from './llm.service';
import type { ChatCompletionRequest } from '../../types/llm';

const billing = vi.hoisted(() => ({ assertAllowed: vi.fn(), record: vi.fn() }));
vi.mock('./spend-breaker.service', () => ({ spendBreaker: billing }));
vi.mock('./logger.service', () => ({ logger: { child: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn() }) } }));
vi.mock('../config/llm.config', () => ({
  findProviderForModel: () => ({ provider: 'custom', apiFormat: 'gemini', apiKey: 'synthetic-key', baseUrl: 'https://provider.invalid', models: ['gemini-test'] }),
  getDefaultModel: () => 'gemini-test',
}));

const request = { model: 'gemini-test', messages: [
  { role: 'system', content: '保留玩家主动权' }, { role: 'user', content: '你好' },
  { role: 'assistant', content: '请进' }, { role: 'user', content: '继续' },
], max_tokens: 128, temperature: 0.6, top_p: 0.9, stop: '结束', stream: false } as ChatCompletionRequest;
const result = { candidates: [{ content: { parts: [{ text: '私有思考', thought: true }, { text: '请进。' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, thoughtsTokenCount: 5, totalTokenCount: 20, cachedContentTokenCount: 4 } };

function eventStream(events: unknown[], end = '\r\n\r\n') {
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}${end}`).join(''));
  let offset = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(offset, offset + 3));
      offset += 3;
    },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('native Gemini adapter', () => {
  it('maps system instructions, complete conversation roles and generation limits without exposing the key in the URL', () => {
    const native = buildGeminiRequest('https://provider.invalid/', 'synthetic-key', request);
    expect(native.url).toBe('https://provider.invalid/v1beta/models/gemini-test:generateContent');
    expect(native.init.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': 'synthetic-key' });
    expect(native.init.redirect).toBe('error');
    expect(JSON.parse(native.init.body)).toEqual({
      systemInstruction: { parts: [{ text: '保留玩家主动权' }] },
      contents: [
        { role: 'user', parts: [{ text: '你好' }] }, { role: 'model', parts: [{ text: '请进' }] }, { role: 'user', parts: [{ text: '继续' }] },
      ], generationConfig: { temperature: 0.6, topP: 0.9, maxOutputTokens: 128, stopSequences: ['结束'] },
    });
    expect(buildGeminiRequest('https://provider.invalid/v1beta/', 'key', request, true).url)
      .toBe('https://provider.invalid/v1beta/models/gemini-test:streamGenerateContent?alt=sse');
  });

  it('rejects unsupported function messages and multiple candidates before network access', () => {
    expect(() => buildGeminiRequest('https://provider.invalid', 'key', { ...request, n: 2 })).toThrow('one text candidate');
    expect(() => buildGeminiRequest('https://provider.invalid', 'key', { ...request, messages: [{ role: 'function', content: 'value' }] })).toThrow();
  });

  it('uses native JSON mode for structured memory extraction', () => {
    const native = buildGeminiRequest('https://provider.invalid', 'key', { ...request, response_format: { type: 'json_object' } });
    expect(JSON.parse(native.init.body).generationConfig.responseMimeType).toBe('application/json');
  });

  it('keeps generated text separate from thoughts and includes thought tokens in usage', async () => {
    const normalized = await readGeminiCompletion(Response.json(result), request.model);
    expect(normalized.choices[0].message.content).toBe('请进。');
    expect(normalized.usage).toMatchObject({ prompt_tokens: 12, completion_tokens: 8, total_tokens: 20,
      prompt_tokens_details: { cached_tokens: 4 } });
  });

  it('does not invent zero usage when metadata is absent', async () => {
    const normalized = await readGeminiCompletion(Response.json({ candidates: result.candidates }), request.model);
    expect(normalized.usage).toBeUndefined();
  });

  it.each([
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ content: { parts: [{ text: 'blocked' }] }, finishReason: 'SAFETY' }] },
    { candidates: [{ content: { parts: [{ text: 'unfinished' }] } }] },
    { error: { message: 'private provider details' } },
  ])('rejects incomplete or blocked non-stream responses', async value => {
    await expect(readGeminiCompletion(Response.json(value), request.model)).rejects.toThrow();
  });

  it('rejects a successful HTML page and sanitizes upstream error details', async () => {
    await expect(readGeminiCompletion(new Response('<html>login</html>'), request.model)).rejects.toThrow('invalid');
    await expect(readGeminiCompletion(Response.json({ error: 'secret' }, { status: 403 }), request.model))
      .rejects.toThrow('Gemini API returned HTTP 403');
  });

  it('converts UTF-8 and CRLF split chunks and emits one final usage frame and DONE', async () => {
    const response = convertGeminiStream(eventStream([
      { candidates: [{ content: { parts: [{ text: '隐藏', thought: true }, { text: '你' }] } }] },
      { candidates: [{ content: { parts: [{ text: '好。' }] }, finishReason: 'STOP' }], usageMetadata: result.usageMetadata },
    ]), request.model);
    const text = await response.text();
    expect(text).not.toContain('隐藏');
    const frames = text.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
    expect(frames.flatMap(frame => frame.choices).map(choice => choice.delta.content).join('')).toBe('你好。');
    expect(frames.filter(frame => frame.usage)).toHaveLength(1);
    expect(frames.at(-1).usage.total_tokens).toBe(20);
    expect(text.endsWith('data: [DONE]\n\n')).toBe(true);
  });

  it('rejects truncated, malformed, empty or blocked streams', async () => {
    for (const events of [[], [{ candidates: [{ content: { parts: [{ text: 'partial' }] } }] }],
      [{ error: { message: 'private' } }], [{ candidates: [{ finishReason: 'SAFETY' }] }]]) {
      await expect(convertGeminiStream(eventStream(events), request.model).text()).rejects.toThrow();
    }
    await expect(convertGeminiStream(new Response('data: broken\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    }), request.model).text()).rejects.toThrow('invalid JSON');
    expect(() => convertGeminiStream(new Response('<html/>'), request.model)).toThrow('event stream');
  });

  it('propagates downstream cancellation to the provider stream', async () => {
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ cancel });
    const response = convertGeminiStream(new Response(source, { headers: { 'Content-Type': 'text/event-stream' } }), request.model);
    await response.body!.cancel();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it('routes production non-stream calls through Gemini and records the returned token total once', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result)));
    const signal = new AbortController().signal;
    const response = await new LLMService().chatCompletion(request, { signal, maxAttempts: 1 });
    expect(response.choices[0].message.content).toBe('请进。');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(':generateContent'), expect.objectContaining({ signal }));
    expect(billing.record).toHaveBeenCalledExactlyOnceWith(20);
  });

  it('routes production streaming calls without OpenAI-only parameters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(eventStream([result])));
    const response = await new LLMService().streamChatCompletion(request);
    expect(await response.text()).toContain('[DONE]');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain(':streamGenerateContent?alt=sse');
    expect(init!.body).not.toContain('stream_options');
  });

  it('honors cancellation and queue-owned retry limits', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(new LLMService().chatCompletion(request, { signal: controller.signal, maxAttempts: 1 })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    await expect(new LLMService().chatCompletion(request, { maxAttempts: 1 })).rejects.toThrow('503');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('supports a single text-template prompt without inventing provider usage or double charging', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ candidates: result.candidates })));
    const response = await new LLMService().completion({ ...request, prompt: '只回应一句话。' });
    expect(response.object).toBe('text_completion');
    expect(response.choices[0].text).toBe('请进。');
    expect(response.usage).toBeUndefined();
    expect(billing.record).toHaveBeenCalledOnce();
  });

  it('rejects text-template prompt batches before network access', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(new LLMService().completion({ ...request, prompt: ['first', 'second'] })).rejects.toThrow('one prompt');
    expect(fetch).not.toHaveBeenCalled();
  });
});
