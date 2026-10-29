import { storyRulesSchema } from './story-state';

export const firstTaskScope = 'stomach-first-task-v1' as const;
export const firstTaskSourceDigest = '978743acafe91e2945486d0f8131c2f641a32d817b058ff28c8c92ad27bc63b1';
export const firstTaskOpeningDigest = '69ed594e2a5b0c03d111474790548a0d36ac30219780fbe10a3053e2ff19ed60';
export const firstTaskScopeMessage = '仅支持该版本大胃袋逆袭系统的首次任务：在房间内连续原地踏步10分钟，中途不休息。明确确认剧情中的完整行动并保存成功后，本任务一次性奖励2点；开始、未满10分钟、中途休息或仅询问均不领奖。不计现实时间，不验证现实运动。仅记录本任务已获奖励，不代表当前总余额；原卡初值条目保持禁用，身体变化、后续动态任务、商城和外部脚本尚未适配。';

export function firstTaskRules() {
  return storyRulesSchema.parse({
    version: 1, summary: firstTaskScopeMessage,
    fields: [
      { id: 'first-task-status', label: '首次踏步任务', type: 'string', initial: '待完成' },
      { id: 'first-task-earned', label: '本任务已获奖励（非总余额）', type: 'number', initial: 0, min: 0, max: 2, unit: '点' },
    ],
    actions: [{ id: 'complete-first-stepping', label: '在房间内连续原地踏步10分钟，中途不休息', intent: 'act', once: true,
      requires: [{ field: 'first-task-status', operator: 'eq', value: '待完成' },
        { field: 'first-task-earned', operator: 'eq', value: 0 }],
      changes: [{ field: 'first-task-status', operation: 'set', value: '已完成' },
        { field: 'first-task-earned', operation: 'add', value: 2 }],
      outcome: '已在剧情中完成首次任务：在房间内连续原地踏步10分钟，中途没有休息。本任务已获奖励2点，本分支不能重复领取。此记录不是当前总余额，不执行商城、身体变化或后续任务。' }],
  });
}
