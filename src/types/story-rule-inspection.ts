export const ruleClueKinds = ['numeric-change', 'random', 'periodic', 'conditional', 'external-update'] as const;
export type RuleClueKind = typeof ruleClueKinds[number];
export type RuleClueSource =
  | { kind: 'card'; field: string }
  | { kind: 'opening'; index: number; field: 'first_mes' | 'alternate_greetings' }
  | { kind: 'book'; bookId: string; entryIndex: number }
  | { kind: 'extension'; field: string };
export type RuleClue = {
  source: RuleClueSource; digest: string; start: number; end: number; line: number;
};
export type StoryRuleInspection = {
  version: 1; sourceRevision: string; scope: 'selected-text-and-active-books';
  coverage: 'complete' | 'source-limit'; sourceCount: number; characterCount: number;
  groups: Array<{ kind: RuleClueKind; occurrences: number; examples: RuleClue[] }>;
};
export const ruleClueLabels: Record<RuleClueKind, string> = {
  'numeric-change': '数值增减线索', random: '随机与掷骰线索', periodic: '周期与轮次线索',
  conditional: '条件与阈值线索', 'external-update': '外部变量更新线索',
};
export const ruleClueExplanations: Record<RuleClueKind, string> = {
  'numeric-change': '出现带数字的消耗、增加或赋值表达；仍需核对归属、前置条件和完整效果，不能仅凭价格生成交易。',
  random: '出现随机、概率或掷骰表达；需要明确范围、分布和修正项，不能用固定值替代。',
  periodic: '出现每日、每月或每轮等表达；需要明确时钟、触发点、重复结算和重置规则。',
  conditional: '出现条件、阈值或重置表达；可能与其他状态关联，不能只实现局部扣值。',
  'external-update': '出现外部变量标记或更新命令；原文保留，但这些命令不会因被识别而获得执行权限。',
};
export function ruleClueSourceLabel(source: RuleClueSource): string {
  if (source.kind === 'book') return `绑定资料 ${source.bookId.slice(0, 8)} · 第 ${source.entryIndex + 1} 条`;
  if (source.kind === 'opening') return source.field === 'first_mes' ? '默认开场' : `备用开场 ${source.index + 1}`;
  return source.kind === 'extension' ? `扩展 ${source.field}` : `角色字段 ${source.field}`;
}
