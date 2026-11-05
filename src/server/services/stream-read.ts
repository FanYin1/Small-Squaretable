/** A finish frame ends generation; allow a bounded tail for usage-only frames.
 * This is NOT a model generation deadline or an output token limit.
 */
export const STREAM_FINISH_DRAIN_MS = 1000;
export const STREAM_DRAIN_TIMEOUT = Symbol('stream_drain_timeout');

export async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>, signal?: AbortSignal, finishDeadline?: number,
): Promise<ReadableStreamReadResult<Uint8Array> | typeof STREAM_DRAIN_TIMEOUT> {
  signal?.throwIfAborted();
  if (finishDeadline !== undefined && performance.now() >= finishDeadline) return STREAM_DRAIN_TIMEOUT;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        abort = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      }),
      ...(finishDeadline === undefined ? [] : [new Promise<typeof STREAM_DRAIN_TIMEOUT>(resolve => {
        timer = setTimeout(() => resolve(STREAM_DRAIN_TIMEOUT), Math.max(0, finishDeadline - performance.now()));
      })]),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  }
}
