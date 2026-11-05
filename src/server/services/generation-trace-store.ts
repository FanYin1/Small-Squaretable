import { getRedisClient } from '../../core/redis';
import { AppError } from '../../core/errors';
import { createLogger } from './logger.service';
import { generationTraceSchema, type GenerationTrace, type GenerationTraceList } from '../../types/generation-trace';
import { WRITE_PROMPT_TRACE } from './prompt-trace-store';
const log = createLogger({ module: 'generation-trace' });
export const GENERATION_TRACE_TTL = 7 * 24 * 3600;
export const GENERATION_TRACE_LIMIT = 30;
const MAX_BYTES = 24 * 1024;
const key = (tenant: string, owner: string, chat: string) => `generation-trace:v1:${tenant}:${owner}:${chat}`;
let writes = 0, reads = 0, lastWarning = 0;
function unavailable(reason: 'capacity' | 'unavailable' | 'invalid_record') {
  if (Date.now() - lastWarning < 60000) return;
  lastWarning = Date.now(); log.warn('Generation diagnostic record unavailable', { reason });
}
export function recordGenerationTrace(tenant: string, owner: string, chat: string, input: GenerationTrace): void {
  if (writes >= 32) { unavailable('capacity'); return; }
  const parsed = generationTraceSchema.safeParse(input);
  if (!parsed.success) { unavailable('invalid_record'); return; }
  const serialized = JSON.stringify(parsed.data);
  if (Buffer.byteLength(serialized) > MAX_BYTES) { unavailable('capacity'); return; }
  writes++;
  void (async () => {
    const redis = await getRedisClient();
    if (!redis.isReady) { unavailable('unavailable'); return; }
    await redis.eval(WRITE_PROMPT_TRACE, { keys: [key(tenant, owner, chat)],
      arguments: [parsed.data.id, serialized, String(GENERATION_TRACE_TTL), String(GENERATION_TRACE_LIMIT)] });
  })().catch(() => unavailable('unavailable')).finally(() => { writes--; });
}
export async function readGenerationTraces(tenant: string, owner: string, chat: string): Promise<GenerationTraceList> {
  if (reads >= 32) throw new AppError('生成诊断暂时不可用。', 503, 'GENERATION_TRACE_UNAVAILABLE');
  reads++;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const redis = await getRedisClient();
        if (!redis.isReady) throw new Error('Unavailable');
        const prefix = key(tenant, owner, chat);
        const ids = await redis.lRange(prefix, 0, GENERATION_TRACE_LIMIT - 1);
        // Do not permit a malformed index to read arbitrary Redis keys.
        const safeIds = ids.filter(id => /^[a-f0-9-]{36}$/.test(id)).slice(0, GENERATION_TRACE_LIMIT);
        const rows = safeIds.length ? await redis.mGet(safeIds.map(id => `${prefix}:${id}`)) : [];
        const cutoff = Date.now() - GENERATION_TRACE_TTL * 1000;
        const traces: GenerationTrace[] = [];
        for (const row of rows) {
          if (!row || Buffer.byteLength(row) > MAX_BYTES) continue;
          try {
            const parsed = generationTraceSchema.safeParse(JSON.parse(row));
            if (parsed.success && Date.parse(parsed.data.finishedAt) >= cutoff) traces.push(parsed.data);
          } catch { /* A damaged record must not hide other evidence. */ }
        }
        traces.sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt));
        return { traces, retentionHours: GENERATION_TRACE_TTL / 3600, limit: GENERATION_TRACE_LIMIT };
      })().finally(() => { reads--; }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Timeout')), 300); }),
    ]);
  } catch { throw new AppError('生成诊断暂时不可用，请稍后重试。', 503, 'GENERATION_TRACE_UNAVAILABLE'); }
  finally { clearTimeout(timer); }
}
