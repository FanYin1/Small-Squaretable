import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const openingRecordSchema = z.object({
  version: z.literal(1),
  status: z.enum(['initial-only', 'unsupported', 'unavailable', 'conflict', 'native']),
  reason: z.enum(['recorded', 'reviewed-first-task', 'unknown-format', 'missing-initialization', 'invalid-initialization', 'unsupported-update', 'player-unverified', 'native-conflict', 'native']),
  adapter: z.enum(['azure-json-credit-v1', 't1-yaml-money-v1']).nullable(),
  source: z.object({
    opening: z.object({ source: z.enum(['first_mes', 'alternate_greetings', 'none']), index: z.number().int().nonnegative() }).strict(),
    digest,
  }).strict(),
  fields: z.array(z.object({
    id: z.enum(['opening-credit', 'opening-money']), label: z.string().min(1).max(80), value: z.number().int().safe(),
    path: z.array(z.string().min(1).max(80)).min(1).max(8),
  }).strict()).max(2),
}).strict().superRefine((record, context) => {
  if ((record.status === 'initial-only') !== (record.fields.length > 0) || (record.fields.length > 0 && !record.adapter)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Only an adapted initial record can contain initial fields' });
  }
  if (record.source.opening.source !== 'alternate_greetings' && record.source.opening.index !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid opening source index' });
  }
});
export type OpeningRecord = z.infer<typeof openingRecordSchema>;

export const openingRecordMessages: Record<OpeningRecord['reason'], string> = {
  'reviewed-first-task': '已核对首次任务及2点奖励，只维护该任务的完成与已获奖励记录；不执行原卡初始化脚本，不建立总余额。',
  recorded: '已读取有来源的开局数值。它是开局记录，不会随剧情自动更新；当前余额和交易规则尚未适配。',
  'unknown-format': '此卡的数值格式尚未适配，不会猜测或自动生成数值。',
  'missing-initialization': '这个开场没有可读取的初始化记录，不会借用其他开场的数值。',
  'invalid-initialization': '这个开场的初始化资料无法可靠解析；继续时仅保留剧情，不建立数值记录。',
  'unsupported-update': '这个开场同时包含尚未支持的数值更新，无法确定开局结果；继续时仅保留剧情。',
  'player-unverified': '无法核实这些数值属于当前玩家；继续时不将其作为玩家资产。',
  'native-conflict': '此卡同时提供原生数值规则和外部初始化，尚未核对两者是否一致。请先修复规则配置再开始。',
  native: '使用本卡已声明的原生数值规则。',
};
