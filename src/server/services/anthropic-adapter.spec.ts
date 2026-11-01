import { describe, expect, it } from 'vitest';
import { buildAnthropicRequest, readAnthropicCompletion, convertAnthropicStream } from './anthropic-adapter';
import type { ChatCompletionRequest } from '../../types/llm';
const request = { model: 'claude-test', messages: [{ role: 'system', content: 'Rules' }, { role: 'user', content: 'Hello' }], max_tokens: 500,
  temperature: 0.7, n: 1, stream: false, presence_penalty: 0, frequency_penalty: 0 } satisfies ChatCompletionRequest;
const counts = { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 20, cache_creation_input_tokens: 5 };
function sse(events: unknown[], fragmented = false) {
  const bytes = new TextEncoder().encode(events.map(event => `event: ignored\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(''));
  return new Response(new ReadableStream({ start(controller) {
    if (fragmented) for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
    else controller.enqueue(bytes); controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
}
const events = [
  { type: 'message_start', message: { usage: { ...counts, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'private' } },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '你好🌟' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } },
  { type: 'message_stop' },
];
describe('Anthropic Messages adapter', () => {
  it('separates system instructions and authenticates using the native protocol', () => {
    const native = buildAnthropicRequest('https://example.invalid/', 'test-key', request);
    expect(native.url).toBe('https://example.invalid/v1/messages');
    expect(native.init.headers['x-api-key']).toBe('test-key');
    expect(JSON.parse(native.init.body)).toEqual({ model: 'claude-test', system: 'Rules', messages: [{ role: 'user', content: 'Hello' }], max_tokens: 500, temperature: 0.7, stream: false });
    expect(buildAnthropicRequest('https://example.invalid/v1/', '', request).url).toBe(native.url);
  });
  it('rejects unsupported candidate counts and functions before sending', () => {
    expect(() => buildAnthropicRequest('https://example.invalid', '', { ...request, n: 2 })).toThrow();
    expect(() => buildAnthropicRequest('https://example.invalid', '', { ...request, messages: [{ role: 'function', content: 'x' }] })).toThrow();
  });
  it('normalizes text, finish reason and cached input accounting', async () => {
    const result = await readAnthropicCompletion(Response.json({ id: 'm1', type: 'message', content: [{ type: 'thinking', text: 'hidden' }, { type: 'text', text: 'Hello' }], stop_reason: 'max_tokens', usage: counts }), 'alias');
    expect(result).toMatchObject({ model: 'alias', choices: [{ message: { content: 'Hello' }, finish_reason: 'length' }], usage: { prompt_tokens: 35, completion_tokens: 4, total_tokens: 39 } });
  });
  it('normalizes fragmented CRLF and UTF-8 SSE while excluding thinking', async () => {
    const text = await convertAnthropicStream(sse(events, true), 'alias').text();
    expect(text).toContain('你好🌟'); expect(text).not.toContain('private');
    expect(text).toContain('"prompt_tokens":35'); expect(text).toContain('"total_tokens":39');
    expect(text).toContain('"finish_reason":"stop"'); expect(text).toContain('[DONE]');
  });
  it.each([{ rows: events.slice(0, -1) }, { rows: [...events.slice(0, 4), { type: 'error', error: { message: 'overloaded' } }] },
    { rows: [...events.slice(0, 5), { type: 'message_delta', delta: { stop_reason: 'tool_use' } }, { type: 'message_stop' }] }])('fails incomplete, error and tool-only streams', async ({ rows }) => {
    await expect(convertAnthropicStream(sse(rows), 'model').text()).rejects.toThrow();
  });
  it('propagates downstream cancellation to the provider stream', async () => {
    let cancelled = false;
    const upstream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const response = convertAnthropicStream(new Response(upstream, { headers: { 'content-type': 'text/event-stream' } }), 'm');
    await response.body!.cancel();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(cancelled).toBe(true);
  });
  it('preserves HTTP errors and rejects empty or invalid completed messages', async () => {
    await expect(readAnthropicCompletion(new Response('', { status: 403 }), 'm')).rejects.toMatchObject({ statusCode: 403 });
    await expect(readAnthropicCompletion(Response.json({}), 'm')).rejects.toThrow();
    await expect(readAnthropicCompletion(Response.json({ id: 'm', type: 'message', content: [], stop_reason: 'end_turn' }), 'm')).rejects.toThrow();
  });
});
