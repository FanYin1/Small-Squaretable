import { getRedisClient } from '../../core/redis';
import { AppError } from '../../core/errors';
import type { PromptTrace, PromptTraceList } from '../../types/prompt-trace';

export const PROMPT_TRACE_TTL_SECONDS = 24 * 60 * 60;
export const PROMPT_TRACE_LIMIT = 10;
const MAX_BYTES = 128 * 1024;
const keyFor = (tenantId: string, userId: string, chatId: string) => `prompt-trace:v1:${tenantId}:${userId}:${chatId}`;
let pendingWrites = 0;
let pendingReads = 0;

// Individual TTLs prevent later requests from extending an older record's lifetime.
export const WRITE_PROMPT_TRACE = `
local key = KEYS[1]
redis.call('SET', key .. ':' .. ARGV[1], ARGV[2], 'EX', ARGV[3])
redis.call('LREM', key, 0, ARGV[1])
redis.call('LPUSH', key, ARGV[1])
local removed = redis.call('LRANGE', key, tonumber(ARGV[4]), -1)
for _, id in ipairs(removed) do redis.call('DEL', key .. ':' .. id) end
redis.call('LTRIM', key, 0, tonumber(ARGV[4]) - 1)
redis.call('EXPIRE', key, ARGV[3])
return 1
`;

/** Best effort and bounded; Redis latency/outage must never hold up model dispatch. */
export function recordPromptTrace(tenantId: string, userId: string, chatId: string, trace: PromptTrace): void {
  if (pendingWrites >= 32) return;
  const serialized = JSON.stringify(trace);
  if (Buffer.byteLength(serialized) > MAX_BYTES) return;
  pendingWrites++;
  void (async () => {
    const redis = await getRedisClient();
    // Do not queue stale records during reconnection.
    if (!redis.isReady) return;
    await redis.eval(WRITE_PROMPT_TRACE, { keys: [keyFor(tenantId, userId, chatId)],
      arguments: [trace.id, serialized, String(PROMPT_TRACE_TTL_SECONDS), String(PROMPT_TRACE_LIMIT)] });
  })().catch(() => { /* Never log potentially sensitive request payloads or Redis errors here. */ })
    .finally(() => { pendingWrites--; });
}

export async function readPromptTraces(tenantId: string, userId: string, chatId: string): Promise<PromptTraceList> {
  if (pendingReads >= 32) throw new AppError('提示词诊断暂时不可用，请稍后重试。', 503, 'PROMPT_TRACE_UNAVAILABLE');
  pendingReads++;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const redis = await getRedisClient();
        if (!redis.isReady) throw new Error('Unavailable');
        const key = keyFor(tenantId, userId, chatId);
        const ids = await redis.lRange(key, 0, PROMPT_TRACE_LIMIT - 1);
        const rows = ids.length ? await redis.mGet(ids.map(id => `${key}:${id}`)) : [];
        const cutoff = Date.now() - PROMPT_TRACE_TTL_SECONDS * 1000;
        const traces = rows.filter((row): row is string => row !== null && Buffer.byteLength(row) <= MAX_BYTES).map(row => JSON.parse(row) as PromptTrace)
          .filter(trace => trace.version === 1 && Date.parse(trace.capturedAt) >= cutoff)
          .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt));
        return { traces, retentionHours: 24, limit: PROMPT_TRACE_LIMIT };
      })().finally(() => { pendingReads--; }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Timeout')), 300); }),
    ]);
  } catch {
    throw new AppError('提示词诊断暂时不可用，请稍后重试。', 503, 'PROMPT_TRACE_UNAVAILABLE');
  } finally { clearTimeout(timer); }
}
