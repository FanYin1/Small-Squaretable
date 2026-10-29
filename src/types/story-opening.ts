import { z } from 'zod';
import { marked } from 'marked';
import type { StoryCapabilityIssue } from './story-capabilities';
import type { OpeningRecord } from './story-opening-record';
import type { StoryAdaptationReport } from './story-adaptation';
import type { AdapterArtifact } from './story-adapter';
import type { PresentationVersion } from './story-presentation';

export const openingReferenceSchema = z.object({
  source: z.enum(['first_mes', 'alternate_greetings', 'none']),
  index: z.number().int().min(0),
}).strict().refine(reference => reference.source === 'alternate_greetings' || reference.index === 0);

export const openingSelectionSchema = z.object({
  characterId: z.string().uuid(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  reference: openingReferenceSchema,
  reviewed: z.boolean().default(false),
}).strict();

export type OpeningReference = z.infer<typeof openingReferenceSchema>;
export type OpeningSelection = z.infer<typeof openingSelectionSchema>;
export type OpeningKind = 'narrative' | 'empty' | 'initialization' | 'directory' | 'review';
export type StoryOpening = {
  reference: OpeningReference; kind: OpeningKind; preview: string; truncated: boolean; record?: OpeningRecord; adaptationReport?: StoryAdaptationReport;
};
export type StoryEntryProfile = {
  characterId: string; revision: string; name: string; avatarUrl: string | null;
  description: { text: string; source: 'description' | 'opening' | 'missing'; reference?: OpeningReference };
  openings: StoryOpening[];
  identity: { status: 'unverified' } | { status: 'invalid' } | { status: 'fixed_name'; fixedName: string };
  initialFields: Array<{ id: string; label: string; value: string | number | boolean | null; unit?: string }>;
  rulesStatus: 'native' | 'adapted' | 'unadapted' | 'invalid';
  adaptation?: Pick<AdapterArtifact, 'jobId' | 'conclusion' | 'reason' | 'compiler'>;
  presentation?: PresentationVersion;
  compatibilityIssues: StoryCapabilityIssue[];
};

function stripBlocks(content: string, names: string): string {
  const tags = new RegExp(`<\\/?(${names})\\b[^>]*(?:>|$)`, 'gi');
  const stack: string[] = [];
  const output: string[] = [];
  let cursor = 0;
  for (const match of content.matchAll(tags)) {
    if (stack.length === 0) output.push(content.slice(cursor, match.index));
    const name = match[1].toLowerCase();
    if (match[0].startsWith('</')) {
      if (stack.at(-1) === name) stack.pop();
    } else if (!match[0].endsWith('/>')) {
      stack.push(name);
    }
    cursor = match.index + match[0].length;
  }
  if (stack.length === 0) output.push(content.slice(cursor));
  return output.join('');
}

export function stripStoryControlBlocks(content: string): string {
  return stripBlocks(content, 'VariableInsert|VariableEdit|VariableUpdate|VariableDelete|UpdateVariable|era_data|variablethink');
}

export function openingDisplayText(content: string): string {
  const cleaned = stripStoryControlBlocks(content).replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/```(?:html)?\s*\n([\s\S]*?)```/gi, '$1');
  const html = marked.parse(cleaned, { async: false });
  return stripBlocks(html, 'script|style|iframe|object|embed|template|svg|math|head')
    .replace(/<\/(?:p|div|li|h[1-6]|section|article)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(x[\da-f]+|\d+);/gi, (entity, code: string) => {
      const point = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_entity, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[name]!)
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function openingReferences(card: Record<string, unknown>): OpeningReference[] {
  return [
    { source: 'first_mes', index: 0 },
    ...(Array.isArray(card.alternate_greetings) ? card.alternate_greetings.map((_value, index) => ({ source: 'alternate_greetings' as const, index })) : []),
  ];
}

export function openingContent(card: Record<string, unknown>, reference: OpeningReference): string | null {
  if (reference.source === 'none') return null;
  const value = reference.source === 'first_mes' ? card.first_mes
    : Array.isArray(card.alternate_greetings) ? card.alternate_greetings[reference.index] : undefined;
  return typeof value === 'string' ? value : null;
}

export function inspectOpening(card: Record<string, unknown>, reference: OpeningReference): StoryOpening {
  const raw = openingContent(card, reference) ?? '';
  const preview = openingDisplayText(raw);
  const hasControls = stripStoryControlBlocks(raw) !== raw;
  const headingOnly = /^(?:[[【（(]?\s*(?:开场白?|初始化|序章|opening|initialization)\s*[\]】）)]?)$/i.test(preview);
  const interactive = /<(?:button|input|select|form)\b|\bonclick\s*=|javascript:/i.test(raw);
  const introduction = preview.slice(0, 240);
  const declaredDirectory = /(?:这是|这个是|这里是|本页为|本页是)(?:个|一个|一份)?(?:开场)?目录/.test(introduction)
    && /(?:不是用来玩|非正文|仅供选择)/.test(introduction)
    && /(?:右滑|左滑|点击|切换)/.test(introduction);
  const promotionalCover = /(?:本角色卡分享于以下|本模板由|角色卡发布地址)/.test(preview)
    && /(?:点击|右滑|左滑).{0,12}(?:开始|进入)正文(?:内容)?/.test(preview);
  const kind: OpeningKind = !preview || headingOnly ? hasControls ? 'initialization' : 'empty'
    : declaredDirectory || promotionalCover || interactive && /开场|选择|目录|opening|select/i.test(preview) ? 'directory'
      : interactive || /\{\{(?!\s*(?:char|user)\s*\}\})[^}]+\}\}/i.test(preview) ? 'review' : 'narrative';
  return { reference, kind, preview: preview.slice(0, 8000), truncated: preview.length > 8000 };
}

export function openingSelectable(opening: StoryOpening): boolean {
  return opening.kind === 'narrative' || opening.kind === 'review';
}

export function storyIntroduction(description: string | null | undefined, card: Record<string, unknown>, presentation?: PresentationVersion): StoryEntryProfile['description'] {
  const text = openingDisplayText(description ?? '');
  if (text) return { text: text.slice(0, 500), source: 'description' };
  const draft = presentation?.draft;
  if (draft?.status === 'draft' && draft.source) {
    const opening = openingContent(card, draft.source.reference);
    if (opening !== null && inspectOpening(card, draft.source.reference).kind === 'narrative'
      && openingDisplayText(opening).slice(draft.source.start, draft.source.end) === draft.text) {
      return { text: draft.text, source: 'opening', reference: draft.source.reference };
    }
  }
  const opening = openingReferences(card).map(reference => inspectOpening(card, reference)).find(item => item.kind === 'narrative');
  return opening ? { text: opening.preview.slice(0, 500), source: 'opening', reference: opening.reference } : { text: '', source: 'missing' };
}
