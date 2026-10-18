/**
 * Prompt 拼装的纯函数部分（P3-3）
 *
 * 不依赖数据库 / Redis / 宏引擎，所以 chat.service 和离线对比脚本
 * （scripts/prompt-layout-compare.ts）可以共用同一份拼装逻辑，不会各写一套后漂移。
 */

import { DYNAMIC_BLOCK_DEPTH, type PromptLayout } from './prompt-layout';
import type { WorldInfoResult } from './worldinfo-engine.service';

export type AtDepthRole = 'system' | 'user' | 'assistant';

export interface AtDepthEntry {
  depth: number;
  content: string;
  role: AtDepthRole;
}

/**
 * 按 legacy 顺序排好的 system prompt 片段。
 * dynamic = 内容随本轮用户消息 / 状态变化（检索到的记忆、情绪、关键词触发的世界书）。
 * legacy 布局忽略 dynamic，全部按顺序拼进 system prompt；
 * cache_friendly 把 dynamic 片段按原有相对顺序抽出来，作为靠近末尾的注入块。
 */
export interface PromptSection {
  parts: string[];
  dynamic: boolean;
}

export interface AssembleInput {
  layout: PromptLayout;
  sections: PromptSection[];
  /** 排在变动内容块之前的 atDepth 条目（世界书 atDepth） */
  atDepthLeading: AtDepthEntry[];
  /** 排在变动内容块之后的 atDepth 条目（Author's Note / post_history_instructions / depth_prompt） */
  atDepthTrailing: AtDepthEntry[];
}

export interface AssembleResult {
  systemPrompt: string;
  atDepthEntries: AtDepthEntry[];
  /** cache_friendly 下的变动内容块；没有变动内容或 legacy 时为 null */
  dynamicBlock: string | null;
}

export function assemblePrompt(input: AssembleInput): AssembleResult {
  const { layout, sections, atDepthLeading, atDepthTrailing } = input;

  if (layout === 'legacy') {
    return {
      systemPrompt: sections.flatMap((s) => s.parts).join('\n'),
      atDepthEntries: [...atDepthLeading, ...atDepthTrailing],
      dynamicBlock: null,
    };
  }

  const stableParts = sections.filter((s) => !s.dynamic).flatMap((s) => s.parts);
  const dynamicParts = sections.filter((s) => s.dynamic).flatMap((s) => s.parts);
  // 记忆 / 情绪的标题行以 "\n" 开头（为了在 system prompt 里和上文隔开），独立成消息后不需要
  const dynamicBlock = dynamicParts.length > 0 ? dynamicParts.join('\n').replace(/^\n+/, '') : null;

  const atDepthEntries: AtDepthEntry[] = [...atDepthLeading];
  if (dynamicBlock) {
    atDepthEntries.push({ depth: DYNAMIC_BLOCK_DEPTH, content: dynamicBlock, role: 'system' });
  }
  atDepthEntries.push(...atDepthTrailing);

  return { systemPrompt: stableParts.join('\n'), atDepthEntries, dynamicBlock };
}

/**
 * 把 atDepth 条目插入已构造好的消息数组。
 * depth N = 距离末尾 N 条消息（depth 0 = 追加在最后一条之后，depth 1 = 最后一条之前）。
 * 深的先插，避免浅的插入后移动深的位置；同深度的条目保持传入顺序。
 * 第 0 条（system prompt）之前不会插入。
 */
export function injectAtDepth<M extends { role: AtDepthRole; content: string }>(
  messages: M[],
  entries: AtDepthEntry[] | null | undefined
): M[] {
  if (!entries || entries.length === 0) return messages;

  const result = [...messages];
  const sorted = [...entries].sort((a, b) => b.depth - a.depth);

  for (const entry of sorted) {
    const insertIdx = Math.max(1, result.length - entry.depth);
    result.splice(insertIdx, 0, { role: entry.role, content: entry.content } as M);
  }

  return result;
}

/** 角色卡默认 system prompt 片段（也是 {{original}} 宏的取值来源，未做宏展开） */
export function buildDefaultPromptParts(
  name: string,
  description: string | null | undefined,
  cardData: Record<string, string>
): string[] {
  const parts: string[] = [`You are ${name}.`];
  if (description) parts.push(description);
  if (cardData.personality) parts.push(`Personality: ${cardData.personality}`);
  if (cardData.scenario) parts.push(`Scenario: ${cardData.scenario}`);
  return parts;
}

/**
 * 角色卡自带 system_prompt 与默认片段的合并规则：
 * 自带 prompt 含 {{original}} 时由宏展开代入默认片段；不含时默认片段在前、自带 prompt 在后。
 */
export function buildCardParts(
  defaultParts: string[],
  customSystemPrompt: string | undefined,
  expand: (text: string) => string
): string[] {
  const parts: string[] = [];
  if (customSystemPrompt) {
    if (!/\{\{original\}\}/i.test(customSystemPrompt)) {
      parts.push(...defaultParts.map(expand));
    }
    parts.push(expand(customSystemPrompt));
  } else {
    parts.push(...defaultParts.map(expand));
  }
  return parts;
}

/**
 * 把 SillyTavern 格式的 mes_example 整理成对话块：按 <START> 分段，逐行 expand，
 * 全空时返回空串。
 */
export function formatExampleMessages(mesExample: string, expand: (line: string) => string): string {
  if (!mesExample || !mesExample.trim()) {
    return '';
  }

  const blocks = mesExample
    .split(/<START>/i)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const formattedBlocks: string[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      continue;
    }

    const formattedLines = lines.map(expand);
    const conversationNumber = formattedBlocks.length + 1;
    formattedBlocks.push(`[Example conversation ${conversationNumber}]\n${formattedLines.join('\n')}`);
  }

  if (formattedBlocks.length === 0) {
    return '';
  }

  return `\n## Example Dialogue\n\n${formattedBlocks.join('\n\n')}`;
}

/** 记忆块（按类型分组），与 legacy 的文本逐字一致；没有记忆返回空数组 */
export function buildMemoryParts(memories: Array<{ type: string; content: string }>): string[] {
  if (memories.length === 0) return [];

  const parts: string[] = ['\n## 关于用户的记忆'];
  const memoryByType: Record<string, string[]> = { fact: [], preference: [], relationship: [], event: [] };

  for (const mem of memories) {
    memoryByType[mem.type]?.push(mem.content);
  }

  if (memoryByType.fact.length > 0) parts.push(`【事实】${memoryByType.fact.join('；')}`);
  if (memoryByType.preference.length > 0) parts.push(`【偏好】${memoryByType.preference.join('；')}`);
  if (memoryByType.relationship.length > 0) parts.push(`【关系】${memoryByType.relationship.join('；')}`);
  if (memoryByType.event.length > 0) parts.push(`【事件】${memoryByType.event.join('；')}`);
  return parts;
}

const EMOTION_GUIDELINES: Record<string, string> = {
  angry: '回复更简短直接，可能提及不满的原因，语气较冲',
  sad: '语气低沉，可能回忆过去的事情，表达需要安慰',
  happy: '语气轻快积极，乐于分享和交流，可能开玩笑',
  excited: '语气热情高涨，说话可能更快更多，充满活力',
  loving: '语气温柔亲密，表达关心和爱意，用词更柔和',
  calm: '语气平和稳定，回复从容不迫，思路清晰',
  curious: '多提问，表现出对话题的兴趣，积极探索',
  surprised: '表达惊讶，可能追问细节，语气中带有意外感',
  confused: '表达困惑，可能请求澄清，语气不确定',
  bored: '回复较简短，缺乏热情，可能试图转换话题',
  fearful: '语气紧张不安，可能表达担忧，寻求安全感',
  disgusted: '表达反感，可能回避某些话题，语气中带有排斥',
};

/** 情绪块，与 legacy 的文本逐字一致；没有情绪返回空数组 */
export function buildEmotionParts(
  emotion: { label: string; valence: number; arousal: number } | null | undefined
): string[] {
  if (!emotion) return [];

  const parts: string[] = [
    `\n## 当前情感状态`,
    `当前情感: ${emotion.label}, Valence: ${emotion.valence.toFixed(2)}, Arousal: ${emotion.arousal.toFixed(2)}`,
  ];
  const guideline = EMOTION_GUIDELINES[emotion.label];
  if (guideline) parts.push(`情感表现指引: ${guideline}`);
  return parts;
}

export type WorldInfoPosition = 'before' | 'EMTop' | 'EMBottom' | 'ANTop' | 'ANBottom' | 'after';

/**
 * 世界书某个位置对应的拼装段。
 * legacy：读合并字段，一段；cache_friendly：稳定部分 + 变动部分两段。
 * 引擎没有给出 stable/volatile 拆分时（旧形态），整段当作变动内容，宁可放进变动块也不污染前缀。
 */
export function worldInfoPositionSections(
  worldInfo: WorldInfoResult | null,
  position: WorldInfoPosition,
  layout: PromptLayout,
  personaStable: string
): PromptSection[] {
  const toParts = (text: string): string[] => (text ? [text] : []);

  if (layout === 'legacy') {
    return [{ parts: toParts(worldInfo?.[position] ?? ''), dynamic: false }];
  }

  const hasSplit = !!(worldInfo?.stable || worldInfo?.volatile);
  const stableText = hasSplit ? (worldInfo?.stable?.[position] ?? '') : '';
  const volatileText = hasSplit ? (worldInfo?.volatile?.[position] ?? '') : (worldInfo?.[position] ?? '');
  // persona 与 legacy 一样放在该位置最前，并用空行与世界书文本隔开
  const stableWithPersona = personaStable
    ? personaStable + (stableText ? '\n\n' + stableText : '')
    : stableText;

  return [
    { parts: toParts(stableWithPersona), dynamic: false },
    { parts: toParts(volatileText), dynamic: true },
  ];
}

export interface PromptSectionInput {
  layout: PromptLayout;
  worldInfo: WorldInfoResult | null;
  /** cache_friendly 下的 persona 稳定块（放在 ANTop 位置最前）；legacy 下 persona 已并入 worldInfo.ANTop，传空串 */
  personaStableBlock: string;
  cardParts: string[];
  exampleParts: string[];
  memoryParts: string[];
  emotionParts: string[];
}

/**
 * 按 legacy 顺序排列各段；dynamic 段在 cache_friendly 下抽到历史之后。
 * chat.service 与离线对比脚本共用这一份顺序，避免两边各写一套后漂移。
 */
export function buildPromptSections(input: PromptSectionInput): PromptSection[] {
  const { layout, worldInfo, personaStableBlock, cardParts, exampleParts, memoryParts, emotionParts } = input;
  const wi = (position: WorldInfoPosition): PromptSection[] =>
    worldInfoPositionSections(worldInfo, position, layout, position === 'ANTop' ? personaStableBlock : '');

  return [
    ...wi('before'),
    { parts: cardParts, dynamic: false },
    { parts: exampleParts, dynamic: false },
    ...wi('EMTop'),
    ...wi('EMBottom'),
    ...wi('ANTop'),
    { parts: [...BEHAVIOR_GUIDELINE_PARTS], dynamic: false },
    { parts: memoryParts, dynamic: true },
    { parts: emotionParts, dynamic: true },
    ...wi('ANBottom'),
    ...wi('after'),
  ];
}

const DEPTH_PROMPT_ROLES = { 0: 'system', 1: 'user', 2: 'assistant' } as const;

/**
 * 角色卡自带的 atDepth 条目：Author's Note（depth 0）、post_history_instructions
 * （默认 depth 1，可被 depth_prompt.depth 覆盖）、depth_prompt（默认 depth 4）。
 * 顺序固定为 AN、PHI、depth_prompt，与 legacy 一致。
 */
export function buildCardAtDepthEntries(
  cardData: {
    character_author_note?: string;
    post_history_instructions?: string;
    extensions?: { depth_prompt?: { prompt?: string; depth?: number; role?: number } };
  },
  expand: (text: string) => string
): AtDepthEntry[] {
  const entries: AtDepthEntry[] = [];
  const depthPrompt = cardData.extensions?.depth_prompt;

  if (cardData.character_author_note) {
    entries.push({ depth: 0, content: expand(cardData.character_author_note), role: 'system' });
  }
  if (cardData.post_history_instructions) {
    entries.push({
      depth: depthPrompt?.depth ?? 1,
      content: expand(cardData.post_history_instructions),
      role: 'system',
    });
  }
  if (depthPrompt?.prompt) {
    entries.push({
      depth: depthPrompt.depth ?? 4,
      content: expand(depthPrompt.prompt),
      role: DEPTH_PROMPT_ROLES[depthPrompt.role as 0 | 1 | 2] ?? 'system',
    });
  }
  return entries;
}

/** 行为指引（固定文本，稳定） */
export const BEHAVIOR_GUIDELINE_PARTS: readonly string[] = [
  '\n## 行为指引',
  '- 根据记忆中的信息个性化回复',
  '- 保持情感状态的一致性，情感变化应自然过渡',
  '- 可以主动提及相关记忆，但不要生硬',
  'Stay in character at all times.',
];
