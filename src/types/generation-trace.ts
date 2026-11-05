import { z } from 'zod';
import { contextBudgetDetailsSchema } from './context-budget';
const count = z.number().int().nonnegative().finite();
const identifier = z.string().max(200);
export const generationStages = ['preflight', 'input_save', 'prompt', 'context', 'reserve', 'upstream', 'usage', 'commit', 'settlement', 'aftercare', 'outcome'] as const;
export type GenerationStage = typeof generationStages[number];
export const generationTraceSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), requestId: identifier,
  capturedAt: z.string().datetime(), finishedAt: z.string().datetime(),
  model: z.string().max(200).optional(), generationId: identifier.optional(), userMessageId: count.optional(), assistantMessageId: count.optional(),
  promptTraceIds: z.array(z.string().uuid()).max(8),
  status: z.enum(['completed', 'failed', 'stopped']), stage: z.enum(generationStages),
  errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/).optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  errorCategory: z.enum(['authentication', 'permission', 'rate_limit', 'context', 'output', 'sampling', 'model', 'messages', 'unavailable', 'unknown', 'timeout', 'network', 'internal', 'cancelled']).optional(),
  errorBodyState: z.enum(['read', 'empty', 'too_large', 'timeout', 'unreadable']).optional(),
  stackFrames: z.array(z.string().max(180)).max(8),
  outcomePersisted: z.boolean(),
  contextFailure: contextBudgetDetailsSchema.optional(),
  usage: z.object({ promptTokens: count.optional(), completionTokens: count.optional(), totalTokens: count.optional() }).optional(),
  response: z.object({ characters: count, sha256: z.string().regex(/^[a-f0-9]{64}$/),
    finishReason: z.enum(['stop', 'length', 'content_filter', 'tool_calls', 'other']).optional(),
    streamIncomplete: z.boolean(), outputTruncated: z.boolean(), firstTokenMs: count.optional(), firstVisibleMs: count.optional(),
  }).optional(),
  validation: z.object({ result: z.enum(['passed', 'failed', 'interrupted']), code: z.string().regex(/^[a-z_]{1,60}$/).optional(),
    warnings: z.array(z.string().regex(/^[a-z_]{1,60}$/)).max(16),
    jsonFailure: z.object({ kind: z.string().regex(/^[a-z_]{1,40}$/), length: count, offset: count.optional(), token: z.string().regex(/^[a-z_]{1,40}$/).optional() }).optional(),
    protocolFailure: z.object({ kind: z.enum(['partial_open', 'missing_close', 'trailing_content']), controlCharacters: count, trailingCharacters: count }).optional(),
    schemaIssues: z.array(z.object({ path: z.string().max(180), code: z.string().regex(/^[a-z_]{1,40}$/) })).max(12).optional(),
  }).optional(),
  stateStatus: z.enum(['confirmed', 'interrupted', 'proposed', 'unknown']).optional(),
  events: z.array(z.object({ stage: z.enum(generationStages), elapsedMs: count })).max(32),
  durationMs: count,
});
export type GenerationTrace = z.infer<typeof generationTraceSchema>;
export interface GenerationTraceList { traces: GenerationTrace[]; retentionHours: number; limit: number }
export const generationStageLabels: Record<GenerationStage, string> = {
  preflight: '权限、设定与额度检查', input_save: '保存用户输入', prompt: '提示词组装', context: '上下文容量检查',
  reserve: '预留生成额度', upstream: '上游请求与流式接收', usage: '记录用量', commit: '剧情校验与消息保存',
  settlement: '结算', aftercare: '保存后处理', outcome: '持久化生成结果',
};
