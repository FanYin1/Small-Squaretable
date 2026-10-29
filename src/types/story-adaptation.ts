import { z } from 'zod';
import { openingReferenceSchema } from './story-opening';
import { ritualEffect, ritualIdentityEffect } from './story-ritual';
import { storyRuleScopes } from './story-rule-scope';

export const adaptationFindingCodeSchema = z.enum([
  'dynamic-pricing', 'nested-state', 'model-updates', 'monthly-settlement', 'dice-resolution',
]);
export const storyAdaptationReportSchema = z.object({
  version: z.literal(1),
  entryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  opening: openingReferenceSchema,
  initial: z.enum(['recorded', 'native', 'unavailable', 'conflict']),
  runtime: z.enum(['native', 'adapted', 'unsupported', 'unverified', 'invalid', 'conflict']),
  turnEffect: z.enum([ritualEffect, ritualIdentityEffect]).optional(),
  ruleScope: z.enum(storyRuleScopes).optional(),
  findings: z.array(z.object({
    code: adaptationFindingCodeSchema,
    sourceDigests: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(8),
  }).strict()).max(5),
}).strict().superRefine((report, context) => {
  if (new Set(report.findings.map(finding => finding.code)).size !== report.findings.length
    || report.findings.some(finding => new Set(finding.sourceDigests).size !== finding.sourceDigests.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate compatibility findings or sources' });
  }
  if ((report.runtime === 'unsupported' && !report.findings.length)
    || (report.turnEffect && report.runtime !== 'adapted')
    || (report.ruleScope && (report.runtime !== 'adapted' || report.turnEffect))
    || (report.initial === 'conflict' && !['conflict', 'invalid'].includes(report.runtime))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Inconsistent compatibility conclusion' });
  }
});
export type StoryAdaptationReport = z.infer<typeof storyAdaptationReportSchema>;
export type AdaptationFindingCode = z.infer<typeof adaptationFindingCodeSchema>;

export const adaptationFindingMessages: Record<AdaptationFindingCode, string> = {
  'dynamic-pricing': '价格依赖动态系数，尚不能自动计算报价或结算交易。',
  'nested-state': '库存、装备或成长数据相互关联，尚不能自动维护这些联动状态。',
  'model-updates': '原卡让模型根据剧情改写数值；这些改写尚不会成为已核实的当前状态。',
  'monthly-settlement': '班级点数与个人点数依赖周期结算，尚不会自动发放或扣除。',
  'dice-resolution': '掷骰依赖难度与修正项，尚不会执行作者的判定机制。',
};
export const adaptationRuntimeMessages: Record<StoryAdaptationReport['runtime'], string> = {
  native: '本卡的原生声明可运行，不代表外部机制已兼容。',
  adapted: '已校验的有限规则可运行；不代表其他外部机制已兼容。',
  unsupported: '可继续剧情，已识别的数值机制尚未运行。',
  unverified: '尚未验证此卡的持续数值机制，不会猜测当前数值。',
  invalid: '原生规则配置无效，需修复后再开始。',
  conflict: '原生规则与外部初始化存在未核对配置，需修复后再开始。',
};
export const adaptationInitialMessages: Record<StoryAdaptationReport['initial'], string> = {
  recorded: '开局记录可保存，不代表当前余额，也不会自动更新。',
  native: '初始状态使用本次故事已冻结的规则声明。',
  unavailable: '此开场没有可适配的玩家初值，不补零、不借用其他开场。',
  conflict: '初始状态来源尚未核对。',
};
