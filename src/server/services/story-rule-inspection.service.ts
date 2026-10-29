import { createHash } from 'node:crypto';
import { ruleClueKinds, type RuleClueKind, type RuleClueSource, type StoryRuleInspection } from '../../types/story-rule-inspection';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';

const patterns: Record<RuleClueKind, RegExp> = {
  'numeric-change': /(?:消耗|扣除|花费|支付|增加|减少|恢复|获得|设为|设置为)[^\r\n。！？;；]{0,20}?[+-]?\d+(?:\.\d+)?|\b_\.(?:add|set)\s*\(/gi,
  random: /随机|概率|掷骰|骰子|\b\d*[dD](?:4|6|8|10|12|20|100)\b|\b(?:random|rollDice)\s*\(/gi,
  periodic: /每(?:天|日|月|周|年|轮|回合)|每次(?:回复|对话|行动|互动)|周期结算|月初|月末/gi,
  conditional: /如果|若[是有无在当]|当[^\r\n。！？;；]{0,32}?(?:达到|超过|低于|高于|归零|归0)|重置|上限|下限/gi,
  'external-update': /<(?:UpdateVariable|VariableInsert|VariableUpdate|VariableEdit|VariableDelete|initvar|era_data)\b|\b_\.(?:set|add|assign|remove)\s*\(|\b(?:get_message_variable|set_message_variable)\b/gi,
};
const fields = ['description', 'personality', 'scenario', 'mes_example', 'system_prompt', 'post_history_instructions'] as const;

export function inspectStoryRuleSources(content: StoryContentSnapshot, sources: StorySources, sourceRevision: string): StoryRuleInspection {
  const character = content.characters[0];
  const report: StoryRuleInspection = { version: 1, sourceRevision, scope: 'selected-text-and-active-books',
    coverage: 'complete', sourceCount: 0, characterCount: 0, groups: [] };
  if (!character || content.characters.length !== 1) return { ...report, coverage: 'source-limit' };
  const collected: Array<{ source: RuleClueSource; text: string }> = [];
  const append = (source: RuleClueSource, value: unknown) => {
    if (typeof value !== 'string' || !value) return;
    report.sourceCount++;
    report.characterCount += value.length;
    if (report.sourceCount > 2000 || report.characterCount > 2_000_000) report.coverage = 'source-limit';
    if (report.coverage === 'complete') collected.push({ source, text: value });
  };
  for (const field of fields) append({ kind: 'card', field }, character.cardData[field]);
  append({ kind: 'card', field: 'promptTemplate' }, character.promptTemplate);
  append({ kind: 'opening', field: 'first_mes', index: 0 }, character.cardData.first_mes);
  const alternatives = character.cardData.alternate_greetings;
  if (Array.isArray(alternatives)) alternatives.forEach((value, index) => append({ kind: 'opening', field: 'alternate_greetings', index }, value));
  const extensions = character.cardData.extensions;
  if (extensions && typeof extensions === 'object' && !Array.isArray(extensions)) {
    for (const field of ['regex_scripts', 'scripts', 'tavern_helper', 'TavernHelper_scripts', 'depth_prompt']) {
      const value = (extensions as Record<string, unknown>)[field];
      if (value != null) append({ kind: 'extension', field }, JSON.stringify(value));
    }
  }
  for (const book of sources.books) {
    if (book.characterId !== character.id || book.scope !== 'character' || !book.isEnabled) continue;
    book.entries.forEach((entry, entryIndex) => {
      if (entry.isEnabled) append({ kind: 'book', bookId: book.id, entryIndex }, entry.content);
    });
  }
  if (report.coverage !== 'complete') return report;
  for (const kind of ruleClueKinds) {
    const group: StoryRuleInspection['groups'][number] = { kind, occurrences: 0, examples: [] };
    for (const entry of collected) {
      const expression = new RegExp(patterns[kind]);
      let exampleAdded = false;
      for (const match of entry.text.matchAll(expression)) {
        group.occurrences++;
        if (exampleAdded || group.examples.length >= 3) continue;
        const start = match.index;
        group.examples.push({ source: entry.source, digest: createHash('sha256').update(entry.text).digest('hex'),
          start, end: start + match[0].length, line: entry.text.slice(0, start).split('\n').length });
        exampleAdded = true;
      }
    }
    if (group.occurrences) report.groups.push(group);
  }
  return report;
}
