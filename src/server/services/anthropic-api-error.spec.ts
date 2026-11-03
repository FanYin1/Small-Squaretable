import { afterEach, expect, it, vi } from 'vitest';
import { assertAnthropicResponse } from './anthropic-api-error';

afterEach(() => vi.useRealTimers());
it.each([
  [400, 'prompt is too long: private input', 'context'],
  [400, 'max_tokens exceeds limit', 'output'],
  [400, 'temperature is not supported', 'sampling'],
  [400, 'model not found', 'model'],
  [400, 'messages: last message must be user', 'messages'],
  [401, 'private key', 'authentication'],
  [403, 'private account', 'permission'],
  [429, 'private quota', 'rate_limit'],
  [503, 'private gateway', 'unavailable'],
  [400, 'private unknown error', 'unknown'],
])('classifies HTTP %s / %s without reflecting raw text', async (status, message, category) => {
  const error = await assertAnthropicResponse(Response.json({ error: { message: `${message} SECRET_SENTINEL` } }, { status: Number(status) })).catch(e => e);
  expect(error).toMatchObject({ statusCode: status, code: 'LLM_API_ERROR', category, bodyState: 'read' });
  expect(error.message + JSON.stringify(error)).not.toContain('SECRET_SENTINEL');
});
it.each(['<html>SECRET_SENTINEL</html>', '{bad JSON', 'null', '[]'])('handles malformed/non-JSON gateways safely: %s', async body => {
  await expect(assertAnthropicResponse(new Response(body, { status: 400 }))).rejects.toMatchObject({ category: 'unknown' });
});
it('uses explicit parameter metadata without reflecting the value', async () => {
  await expect(assertAnthropicResponse(Response.json({ error: { param: 'max_tokens', message: 'SECRET' } }, { status: 400 })))
    .rejects.toMatchObject({ category: 'output' });
});
it('bounds bytes and cancels an oversized error', async () => {
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(16385)); }, cancel }), { status: 400 });
  await expect(assertAnthropicResponse(response)).rejects.toMatchObject({ category: 'unknown', bodyState: 'too_large' });
  expect(cancel).toHaveBeenCalledOnce();
});
it('bounds total read time even when cancellation never resolves', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const response = new Response(new ReadableStream({ cancel }), { status: 400 });
  const result = expect(assertAnthropicResponse(response)).rejects.toMatchObject({ bodyState: 'timeout' });
  await vi.advanceTimersByTimeAsync(1500);
  await result;
  expect(cancel).toHaveBeenCalledOnce();
});
it('preserves cancellation instead of reporting a configuration failure', async () => {
  const response = new Response(new ReadableStream({ start(c) { c.error(new DOMException('aborted', 'AbortError')); } }), { status: 400 });
  await expect(assertAnthropicResponse(response)).rejects.toMatchObject({ name: 'AbortError' });
});
it('does not consume successful streaming responses', async () => {
  const response = new Response('untouched');
  await assertAnthropicResponse(response);
  expect(response.bodyUsed).toBe(false);
  expect(await response.text()).toBe('untouched');
});
