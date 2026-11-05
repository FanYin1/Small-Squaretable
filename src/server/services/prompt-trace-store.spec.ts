import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { getRedisClient } from '../../core/redis';
import { readPromptTraces, recordPromptTrace, PROMPT_TRACE_TTL_SECONDS, WRITE_PROMPT_TRACE } from './prompt-trace-store';
import type { PromptTrace } from '../../types/prompt-trace';
vi.mock('../../core/redis', () => ({ getRedisClient: vi.fn() }));
const trace = () => ({ version: 1, capturedAt: new Date().toISOString(), id: 'trace' } as PromptTrace);
const redis = { isReady: true, eval: vi.fn().mockResolvedValue(1), lRange: vi.fn(), mGet: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); redis.isReady = true; vi.mocked(getRedisClient).mockResolvedValue(redis as never); });
afterEach(() => vi.useRealTimers());
it('writes under owner/tenant/story key with bounded retention, never waits in dispatch', async () => {
  expect(recordPromptTrace('tenant', 'owner', 'story', trace())).toBeUndefined();
  await vi.waitFor(() => expect(redis.eval).toHaveBeenCalledOnce());
  expect(redis.eval).toHaveBeenCalledWith(WRITE_PROMPT_TRACE, { keys: ['prompt-trace:v1:tenant:owner:story'],
    arguments: ['trace', expect.any(String), String(PROMPT_TRACE_TTL_SECONDS), '10'] });
});
it('ignores failed writes and caps oversized records', async () => {
  vi.mocked(getRedisClient).mockRejectedValueOnce(new Error('private connection error'));
  recordPromptTrace('t', 'u', 'c', trace());
  await new Promise(resolve => setTimeout(resolve, 0));
  recordPromptTrace('t', 'u', 'c', { ...trace(), model: 'x'.repeat(140000) });
  expect(redis.eval).not.toHaveBeenCalled();
});
it('does not enqueue during reconnection', async () => {
  redis.isReady = false; recordPromptTrace('t', 'u', 'c', trace());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(redis.eval).not.toHaveBeenCalled();
});
it('skips expired or missing individual records even when the index TTL was extended', async () => {
  redis.lRange.mockResolvedValue(['trace', 'expired', 'missing']);
  redis.mGet.mockResolvedValue([JSON.stringify(trace()), JSON.stringify({ ...trace(), capturedAt: new Date(Date.now() - 25 * 3600000).toISOString() }), null]);
  const result = await readPromptTraces('t', 'u', 'c');
  expect(result.traces).toHaveLength(1);
  expect(redis.lRange).toHaveBeenCalledWith('prompt-trace:v1:t:u:c', 0, 9);
});
it('bounds read latency and returns a controlled error without connection details', async () => {
  vi.useFakeTimers(); redis.lRange.mockReturnValue(new Promise(() => {}));
  const check = expect(readPromptTraces('t', 'u', 'c')).rejects.toMatchObject({ code: 'PROMPT_TRACE_UNAVAILABLE', statusCode: 503 });
  await vi.advanceTimersByTimeAsync(301); await check;
});
