import { z } from 'zod';
import { storyRecommendationsSchema } from './story-recommendations';

const actionId = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const evidence = z.string().trim().min(1).max(1000);
export const storyIntentSchema = z.object({
  version: z.literal(1),
  disposition: z.enum(['proposal', 'clarification', 'expression']),
  question: z.string().max(500).optional(),
  steps: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('execute'), actionId, evidence }).strict(),
    z.object({ kind: z.literal('explore'), intent: z.enum(['observe', 'talk', 'act', 'travel']), description: evidence, evidence }).strict(),
    z.object({ kind: z.literal('refuse'), description: evidence, evidence }).strict(),
  ])).max(6),
  facts: z.array(z.object({ kind: z.enum(['claim', 'intention', 'inference', 'observation', 'style']),
    content: evidence, evidence, speaker: z.enum(['player', 'character']) }).strict()).max(6),
  recommendations: storyRecommendationsSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.disposition === 'clarification' && (!value.question?.trim() || value.steps.some(step => step.kind === 'execute'))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Clarification cannot execute an action' });
  }
  if (value.disposition === 'expression' && value.steps.some(step => step.kind === 'execute')) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Expression cannot execute an action' });
  }
  if (value.steps.some(step => step.kind === 'refuse') && value.steps.some(step => step.kind === 'execute')) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Mixed refusal and execution requires clarification' });
  }
  const actions = value.steps.flatMap(step => step.kind === 'execute' ? [step.actionId] : []);
  if (new Set(actions).size !== actions.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate action' });
  if (value.disposition === 'proposal' && !value.steps.length && !value.facts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Empty proposal' });
  }
});

export type StoryIntent = z.infer<typeof storyIntentSchema>;
export interface StoredStoryIntent { intent: StoryIntent; expectedVersion: number; input: string }
export const STORY_INTENT_MARKER = '\n<story-intent>';
export const STORY_INTENT_REVIEW_TEXT = '请核对下面的行动理解。确认后，故事才会继续这次行动。';

export function storyIntentPresentation(raw: string, input: string, availableIds: string[], interrupted = false) {
  const parsed = parseStoryIntentOutput(raw, input, availableIds);
  if (interrupted) return storyIntentVisiblePrefix(raw);
  if (parsed.invalid) return '本轮未能形成有效的行动理解，候选后果未执行。请补充说明后继续。';
  return parsed.intent?.disposition === 'proposal' ? STORY_INTENT_REVIEW_TEXT : parsed.content;
}

export function parseStoryIntentOutput(raw: string, input: string, availableIds: string[]) {
  const position = raw.indexOf(STORY_INTENT_MARKER);
  const content = position < 0 ? raw : raw.slice(0, position).trimEnd();
  if (position < 0) return { content, intent: null, invalid: false };
  const encoded = raw.slice(position + STORY_INTENT_MARKER.length).trimEnd();
  if (!encoded.endsWith('</story-intent>') || encoded.length > 16000) return { content, intent: null, invalid: true };
  try {
    const decoded = JSON.parse(encoded.slice(0, -'</story-intent>'.length));
    const recommendations = storyRecommendationsSchema.safeParse(decoded?.recommendations);
    if (decoded && typeof decoded === 'object') delete decoded.recommendations;
    const intent = storyIntentSchema.parse(decoded);
    if (intent.steps.some(step => !input.includes(step.evidence) || (step.kind === 'execute' && !availableIds.includes(step.actionId)))) {
      return { content, intent: null, invalid: true };
    }
    intent.facts = intent.facts.filter(fact => (fact.speaker === 'player' ? input : content).includes(fact.evidence)
      && (intent.disposition !== 'proposal' || fact.speaker === 'player'));
    if (intent.disposition === 'proposal' && !intent.steps.length && !intent.facts.length) {
      return { content, intent: null, invalid: true };
    }
    return { content, intent, recommendations: recommendations.success ? recommendations.data : [], invalid: false };
  } catch { return { content, intent: null, invalid: true }; }
}

export function storyIntentVisiblePrefix(raw: string, complete = false): string {
  const marker = raw.indexOf(STORY_INTENT_MARKER);
  if (marker >= 0) return raw.slice(0, marker);
  if (!complete) {
    for (let size = Math.min(raw.length, STORY_INTENT_MARKER.length - 1); size > 0; size--) {
      if (raw.endsWith(STORY_INTENT_MARKER.slice(0, size))) return raw.slice(0, -size);
    }
  }
  return raw;
}
