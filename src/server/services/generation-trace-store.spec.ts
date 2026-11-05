import { beforeEach, expect, it, vi } from 'vitest';
import { getRedisClient } from '../../core/redis';
import { GenerationTraceRecorder } from './generation-trace';
import { recordGenerationTrace, readGenerationTraces } from './generation-trace-store';
vi.mock('../../core/redis', () => ({ getRedisClient: vi.fn() }));
const redis = { isReady: true, eval: vi.fn().mockResolvedValue(1), lRange: vi.fn(), mGet: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); redis.isReady = true; vi.mocked(getRedisClient).mockResolvedValue(redis as never); });
it('writes bounded records with individual seven day TTL and owner isolation', async () => {
  const trace = new GenerationTraceRecorder('request', 'model').finish('completed');
  recordGenerationTrace('tenant', 'owner', 'chat', { ...trace, secret: 'PRIVATE' } as typeof trace);
  await vi.waitFor(() => expect(redis.eval).toHaveBeenCalledOnce());
  const options = redis.eval.mock.calls[0][1];
  expect(options.keys).toEqual(['generation-trace:v1:tenant:owner:chat']);
  expect(options.arguments.slice(2)).toEqual(['604800','30']);
  expect(options.arguments[1]).not.toContain('PRIVATE');
});
it('skips malformed, expired or corrupt records independently and filters malicious index members', async () => {
  const trace = new GenerationTraceRecorder('request', 'model').finish('failed');
  redis.lRange.mockResolvedValue([trace.id, 'arbitrary-secret-key']);
  redis.mGet.mockResolvedValue(['{bad', JSON.stringify({...trace, finishedAt:'2020-01-01T00:00:00.000Z'}), JSON.stringify(trace)]);
  const result = await readGenerationTraces('t','u','c');
  expect(result.traces).toEqual([trace]);
  expect(redis.mGet).toHaveBeenCalledWith([`generation-trace:v1:t:u:c:${trace.id}`]);
});
it('does not enqueue reconnecting writes and returns safe read failure', async () => {
  redis.isReady = false;
  recordGenerationTrace('t','u','c',new GenerationTraceRecorder('r','m').finish('failed'));
  await new Promise(resolve => setTimeout(resolve,0));
  expect(redis.eval).not.toHaveBeenCalled();
  await expect(readGenerationTraces('t','u','c')).rejects.toMatchObject({code:'GENERATION_TRACE_UNAVAILABLE'});
});
it('limits stalled reads without including Redis errors', async () => {
  vi.useFakeTimers(); redis.lRange.mockReturnValue(new Promise(()=>{}));
  try {
    const result = expect(readGenerationTraces('t','u','c')).rejects.toMatchObject({code:'GENERATION_TRACE_UNAVAILABLE'});
    await vi.advanceTimersByTimeAsync(301); await result;
  } finally { vi.useRealTimers(); }
});
