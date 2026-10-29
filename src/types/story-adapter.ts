import { z } from 'zod';
import { getStoryRules, storyRulesSchema, type StoryRules } from './story-state';
import type { StoryRuleInspection } from './story-rule-inspection';
import { ritualEffect, ritualIdentityEffect, ritualRules, ritualSourceDigest } from './story-ritual';
import { openingModeRules, openingModeSourceDigest, openingModeScopeMessage } from './story-opening-mode';
import { firstTaskRules, firstTaskSourceDigest, firstTaskScopeMessage } from './story-first-task';

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const adapterSourceSchema = z.object({
  bookId: z.string().uuid(), entryIndex: z.number().int().nonnegative(), digest: digestSchema,
}).strict();
export const adapterArtifactSchema = z.object({
  version: z.literal(1), compiler: z.literal('finite-rules-v1'), jobId: z.string().uuid(),
  characterId: z.string().uuid(), sourceRevision: digestSchema,
  conclusion: z.enum(['supported', 'native', 'unsupported', 'review', 'invalid']),
  reason: z.enum(['compiled', 'reviewed-ritual', 'reviewed-opening-mode', 'reviewed-first-task', 'native', 'no-declaration', 'multiple-declarations', 'external-mechanisms', 'conditional-source', 'native-conflict', 'invalid-declaration', 'source-limit']),
  sources: z.array(adapterSourceSchema).max(2), rules: storyRulesSchema.optional(),
  turnEffect: z.enum([ritualEffect, ritualIdentityEffect]).optional(),
}).strict().superRefine((artifact, context) => {
  if ((artifact.conclusion === 'supported') !== Boolean(artifact.rules)
    || artifact.rules && (artifact.sources.length !== 1 || !['compiled', 'reviewed-ritual', 'reviewed-opening-mode', 'reviewed-first-task'].includes(artifact.reason))
    || artifact.rules?.map) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid finite adapter artifact' });
  }
  if (artifact.reason === 'reviewed-first-task' && (artifact.conclusion !== 'supported' || artifact.turnEffect
    || artifact.sources.length !== 1 || artifact.sources[0].digest !== firstTaskSourceDigest || artifact.sources[0].entryIndex >= 5
    || JSON.stringify(artifact.rules) !== JSON.stringify(firstTaskRules()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid reviewed first task artifact' });
  }
  if (artifact.reason === 'reviewed-opening-mode' && (artifact.conclusion !== 'supported' || artifact.turnEffect
    || artifact.sources.length !== 1 || artifact.sources[0].digest !== openingModeSourceDigest || artifact.sources[0].entryIndex !== 0
    || JSON.stringify(artifact.rules) !== JSON.stringify(openingModeRules()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid reviewed opening mode artifact' });
  }
  if (artifact.reason === 'reviewed-ritual' || artifact.turnEffect) {
    if (artifact.reason !== 'reviewed-ritual' || !artifact.turnEffect || artifact.conclusion !== 'supported'
      || artifact.sources.length !== 1 || artifact.sources[0].digest !== ritualSourceDigest || artifact.sources[0].entryIndex > 2
      || JSON.stringify(artifact.rules) !== JSON.stringify(ritualRules(artifact.turnEffect))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid reviewed ritual artifact' });
    }
  }
});
export type AdapterArtifact = z.infer<typeof adapterArtifactSchema>;
export const adapterRequestSchema = z.object({ requestId: z.string().uuid() }).strict();
export type AdapterJobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'cancelled' | 'stale';
export type AdapterJobView = {
  id: string; status: AdapterJobStatus; stage: 'collect' | 'inspect' | 'compile' | 'complete';
  sourceRevision: string; attempt: number; current: boolean; createdAt: string;
  result: Omit<AdapterArtifact, 'rules' | 'sources'> & { sourceCount: number; fieldCount: number; actionCount: number; inspection?: StoryRuleInspection } | null;
};
export const adapterReasonMessages: Record<AdapterArtifact['reason'], string> = {
  compiled: '已校验显式有限规则；新故事可持续记录其中的数值变化，其他机制仍需单独验证。',
  'reviewed-ritual': '已核对该版本咔咔的来源。力量从0开始，每轮完整保存的已确认对话后+3；当前检查还支持明确自我声明触发的角色回应变化，对应记录触发后才出现。不是玩家属性，不包含战斗、交易或奖励；已有故事以冻结报告为准。',
  'reviewed-opening-mode': openingModeScopeMessage,
  'reviewed-first-task': firstTaskScopeMessage,
  native: '本卡已有原生规则，继续使用作者声明，不重复转换。',
  'no-declaration': '未找到受支持的显式规则声明。可以体验剧情，但不会自动维护外部数值。',
  'multiple-declarations': '发现多个规则声明，无法确认哪个具有优先权，尚未启用。',
  'external-mechanisms': '存在外部控制或尚未支持的机制，不能确认有限规则独立成立，尚未启用。',
  'conditional-source': '规则所在条目带有关键词、概率、时序或人物限制，或缺少明确的常驻声明。目前不能将这些触发条件转换为持续规则，因此未启用数值与行动；请核对来源，不要仅为通过检查删除原有条件。',
  'native-conflict': '外部声明与原生规则同时存在，需作者核对后再启用。',
  'invalid-declaration': '规则声明不符合首版支持范围，需修复后重试。',
  'source-limit': '资料超出本次有界检查范围，未截取部分内容后宣称适配成功。',
};
export function frozenStoryRules(character: { cardData: Record<string, unknown>; adaptation?: AdapterArtifact }, source: 'author' | 'snapshot' = 'snapshot'): StoryRules | null {
  const native = getStoryRules(character.cardData, source);
  if (native && character.adaptation?.rules) throw new Error('Conflicting saved rule sources');
  return native ?? character.adaptation?.rules ?? null;
}
