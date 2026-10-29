import { getStoryRules } from './story-state';
import { cardRecord as record, characterFields } from './card-fields';
import { z } from 'zod';

const capabilityIssueSchema = z.enum(['author_scripts', 'regex_rules', 'variable_framework', 'external_assets', 'unknown_extensions', 'scan_incomplete']);
export type StoryCapabilityIssue = z.infer<typeof capabilityIssueSchema>;
export const storyCapabilitiesSchema = z.object({ native: z.boolean(), map: z.boolean(), scripted: z.boolean(), invalid: z.boolean(), issues: z.array(capabilityIssueSchema) });
export const storyCapabilityMessages: Record<StoryCapabilityIssue, string> = {
  author_scripts: '发现作者脚本声明或内嵌脚本线索。新故事保留资料，不运行这些脚本；依赖它们的小游戏、自动数值和界面需要适配。',
  regex_rules: '包含正则处理规则。不能保证新故事复现原平台的文本替换、提示词处理或脚本面板。',
  variable_framework: '发现外部变量框架线索。相关数值不会自动转换为本平台的持久状态，请以有来源的状态面板为准。',
  external_assets: '包含外部素材声明。素材包、模型或表达式资产不等于已经加载；新故事不保证显示原平台的素材效果。',
  unknown_extensions: '保留了其他作者扩展，但没有声明其运行支持；成功导入不代表这些扩展已经生效。',
  scan_incomplete: '资料超过诊断检查范围，部分内容尚未检查；没有提示不代表不存在依赖。',
};

export function inspectStoryCapabilities(card: Record<string, unknown>, boundEntries: Array<{ content: string; settings?: unknown }> = []) {
  const fields = characterFields(card);
  const extensions = record(fields.extensions);
  const declarations = ['tavern_helper', 'TavernHelper', 'TavernHelper_scripts', 'scripts'];
  const present = (value: unknown) => value != null && value !== false && (Array.isArray(value) ? value.length > 0 : typeof value === 'object' ? Object.keys(value).length > 0 : Boolean(value));
  const nodes = [fields, extensions, record(fields.character_book), record(record(fields.character_book).extensions)];
  let remaining = 1_000_000;
  let incomplete = false;
  const texts: string[] = [];
  const append = (value: unknown) => {
    if (typeof value !== 'string') return;
    if (value.length > remaining) incomplete = true;
    texts.push(value.slice(0, remaining));
    remaining = Math.max(0, remaining - value.length);
  };
  for (const key of ['first_mes', 'description', 'personality', 'scenario', 'mes_example', 'system_prompt', 'post_history_instructions', 'creator_notes', 'character_author_note']) append(fields[key]);
  append(record(extensions.depth_prompt).prompt);
  for (const key of ['alternate_greetings', 'group_only_greetings']) {
    const values = fields[key];
    if (Array.isArray(values)) {
      if (values.length > 1000) incomplete = true;
      values.slice(0, 1000).forEach(append);
    }
  }
  const entries = record(fields.character_book).entries;
  if (Array.isArray(entries)) {
    if (entries.length > 5000) incomplete = true;
    entries.slice(0, 5000).forEach(entry => {
      append(record(entry).content);
      nodes.push(record(entry), record(record(entry).extensions));
    });
  }
  if (boundEntries.length > 5000) incomplete = true;
  boundEntries.slice(0, 5000).forEach(entry => { append(entry.content); nodes.push(record(entry.settings)); });
  const text = texts.join('\n');
  const regex = nodes.some(node => Array.isArray(node.regex_scripts) && node.regex_scripts.some(script => record(script).disabled !== true));
  const scripted = nodes.some(node => declarations.some(key => present(node[key]))) || /<script\b|\bon[a-z]+\s*=/i.test(text);
  const variableFramework = /<UpdateVariable>|\bMvu\b|\bMVU\b|era:|<Variable(?:Insert|Update|Delete)>/i.test(text)
    || nodes.some(node => ['mvu', 'MVU', 'ERA', 'era', 'stat_data'].some(key => present(node[key])));
  const known = new Set([...declarations, 'regex_scripts', 'squaretable', 'world', 'mvu', 'MVU', 'ERA', 'era', 'stat_data', 'talkativeness', 'fav', 'depth_prompt']);
  const issues: StoryCapabilityIssue[] = [];
  if (scripted) issues.push('author_scripts');
  if (regex) issues.push('regex_rules');
  if (variableFramework) issues.push('variable_framework');
  if (Array.isArray(fields.assets) && fields.assets.length > 0) issues.push('external_assets');
  if (Object.keys(extensions).some(key => !known.has(key))) issues.push('unknown_extensions');
  if (incomplete) issues.push('scan_incomplete');
  try {
    const rules = getStoryRules(fields);
    return { native: Boolean(rules), map: Boolean(rules?.map), scripted, invalid: false, issues };
  } catch { return { native: false, map: false, scripted, invalid: true, issues }; }
}

export type StoryCapabilities = ReturnType<typeof inspectStoryCapabilities>;
