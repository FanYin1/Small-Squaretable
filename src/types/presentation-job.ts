import { z } from 'zod';

export const presentationJobStatuses = ['queued', 'dispatching', 'received', 'complete', 'skipped', 'cancelled', 'stale', 'unknown', 'failed'] as const;
export type PresentationJobStatus = typeof presentationJobStatuses[number];
export const presentationUsageSchema = z.object({
  ledgerId: z.string().uuid(), batchId: z.string().uuid(),
  tokens: z.number().int().nonnegative().safe(), responseDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PresentationUsage = z.infer<typeof presentationUsageSchema>;
export type PresentationJobView = {
  id: string; status: PresentationJobStatus; current: boolean; createdAt: string;
};
export const presentationJobMessages: Record<PresentationJobStatus, string> = {
  queued: '已排队，等待受额度约束的整理服务。可以先体验原卡；排队不代表已经调用模型。',
  dispatching: '正在选择一段有来源的公开开场。取消会阻止采用，但已发出的调用仍可能计费。',
  received: '结果已收到，等待复核来源并保存。恢复此步骤不会再次调用模型。',
  complete: '有来源的介绍摘录已保存，作者或你手写的介绍始终优先。',
  skipped: '保留已有介绍，或没有适合采用的公开摘录；不会补造故事介绍。',
  cancelled: '已停止采用本次整理。原卡不变，已发出的模型调用不因此免计用量。',
  stale: '卡片来源或可见性已改变，本次结果未采用。原卡与已有故事不变。',
  unknown: '请求结果尚不确定，已停止自动重发，避免重复消耗。可继续体验原卡，等待管理员核对。',
  failed: '整理结果未通过校验，未自动重试或修改原卡。可以继续体验或手动编辑介绍。',
};
