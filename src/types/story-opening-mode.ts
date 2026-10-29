import { storyRulesSchema } from './story-state';

export const openingModeScope = 'sans-opening-modes-v1' as const;
export const openingModeSourceDigest = '5d8e52bb17cd5e3737fef740f194bbf43ce570f4b3b591a31da63a6d94541102';
export const openingModeScopeMessage = '仅支持该版本sans的首次模式选择：剧情模式以Lv0开局；战斗模式以Lv19进入审判长廊。确认并完整保存后不能在本分支重复选择，可从选择前另开分支。显示的是开局记录；击杀经验、后续等级、生命值、战斗裁决与地图尚未适配，不会自动更新。';

export function openingModeRules() {
  return storyRulesSchema.parse({
    version: 1, summary: openingModeScopeMessage,
    fields: [
      { id: 'sans-mode', label: '开局模式', type: 'string', initial: '未选择' },
      { id: 'sans-opening-lv', label: '开局Lv（不随经验更新）', type: 'number', initial: 0,
        visibleWhen: [{ field: 'sans-mode', operator: 'ne', value: '未选择' }] },
      { id: 'sans-opening-location', label: '开局地点（非当前位置）', type: 'string', initial: null,
        visibleWhen: [{ field: 'sans-mode', operator: 'eq', value: '战斗模式' }] },
    ],
    actions: [
      { id: 'sans-story-mode', label: '/剧情模式', intent: 'act', once: true,
        requires: [{ field: 'sans-mode', operator: 'eq', value: '未选择' }],
        changes: [{ field: 'sans-mode', operation: 'set', value: '剧情模式' }],
        outcome: '已选择剧情模式，以Lv0开始和平的地下世界探索。仅记录开局，后续经验与战斗数值尚未适配。' },
      { id: 'sans-battle-mode', label: '/战斗模式', intent: 'act', once: true,
        requires: [{ field: 'sans-mode', operator: 'eq', value: '未选择' }],
        changes: [{ field: 'sans-mode', operation: 'set', value: '战斗模式' },
          { field: 'sans-opening-lv', operation: 'set', value: 19 },
          { field: 'sans-opening-location', operation: 'set', value: '审判长廊' }],
        outcome: '已选择战斗模式，以Lv19进入审判长廊，遇见sans。仅记录开局，伤害、经验和后续等级尚未适配。' },
    ],
  });
}
