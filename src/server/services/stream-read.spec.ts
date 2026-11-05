import { afterEach, expect, it, vi } from 'vitest';
import { readStreamChunk, STREAM_DRAIN_TIMEOUT } from './stream-read';
afterEach(() => vi.useRealTimers());
it('honors cancellation even when the source never produces another chunk', async () => {
  const cancel = vi.fn(); const reader = new ReadableStream<Uint8Array>({ cancel }).getReader();
  const controller = new AbortController();
  const result = readStreamChunk(reader, controller.signal);
  controller.abort(); await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await reader.cancel(); reader.releaseLock(); expect(cancel).toHaveBeenCalledOnce();
});
it('bounds only the post-finish drain, not the generation itself', async () => {
  vi.useFakeTimers();
  const reader = new ReadableStream<Uint8Array>().getReader();
  const result = readStreamChunk(reader, undefined, performance.now() + 1000);
  await vi.advanceTimersByTimeAsync(1001);
  expect(await result).toBe(STREAM_DRAIN_TIMEOUT);
  await reader.cancel(); reader.releaseLock();
});
it('clears timer and listener after a normal read and does not consume another frame', async () => {
  vi.useFakeTimers(); const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const reader = new ReadableStream<Uint8Array>({ start(stream) { stream.enqueue(new Uint8Array([1])); stream.enqueue(new Uint8Array([2])); stream.close(); } }).getReader();
  expect(await readStreamChunk(reader, controller.signal, performance.now() + 1000)).toMatchObject({ value: new Uint8Array([1]) });
  expect(remove).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  expect(await reader.read()).toMatchObject({ value: new Uint8Array([2]) }); reader.releaseLock();
});
it('does not read again once the absolute deadline has passed', async () => {
  const read = vi.fn();
  expect(await readStreamChunk({ read } as unknown as ReadableStreamDefaultReader<Uint8Array>, undefined, performance.now() - 1)).toBe(STREAM_DRAIN_TIMEOUT);
  expect(read).not.toHaveBeenCalled();
});
