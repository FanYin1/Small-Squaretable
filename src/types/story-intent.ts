import { duplicateJsonKeyOffset, withoutTrailingCommas } from './story-control-json';
import { z } from 'zod';
import { parseStoryRecommendationsLead, storyRecommendationsSchema } from './story-recommendations';

const actionId = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const evidence = z.string().trim().min(1).max(1000);
export const storyIntentObjectSchema = z.object({
  version: z.literal(1),
  disposition: z.enum(['proposal', 'execution', 'clarification', 'expression']),
  question: z.string().max(500).optional(),
  steps: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('execute'), actionId, evidence }).strict(),
    z.object({ kind: z.literal('explore'), intent: z.enum(['observe', 'talk', 'act', 'travel']), description: evidence, evidence }).strict(),
    z.object({ kind: z.literal('refuse'), description: evidence, evidence }).strict(),
  ])).max(6),
  facts: z.array(z.object({ kind: z.enum(['claim', 'intention', 'inference', 'observation', 'style']),
    content: evidence, evidence, speaker: z.enum(['player', 'character']) }).strict()).max(6),
  recommendations: storyRecommendationsSchema.optional(),
}).strict();

export const storyIntentSchema = storyIntentObjectSchema.superRefine((value, context) => {
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
  if ((value.disposition === 'proposal' || value.disposition === 'execution') && !value.steps.length && !value.facts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Empty proposal' });
  }
});

export type StoryIntent = z.infer<typeof storyIntentSchema>;
export interface StoredStoryIntent { intent: StoryIntent; expectedVersion: number; input: string }
export const STORY_INTENT_MARKER = '\n<story-intent>';
export const STORY_INTENT_REVIEW_TEXT = '请核对下面的行动理解。确认后，故事才会继续这次行动。';

/**
 * Only an awaiting interpretation can fail the action-review protocol.
 * A confirmed turn may have malformed optional recommendation metadata, but
 * that must not be presented as a failed action or undo a committed turn.
 */
export function shouldPersistStoryIntentInvalid(
  state: { interrupted: boolean; interpreting: boolean },
  parsed: { invalid?: boolean } | null | undefined,
): boolean {
  return !state.interrupted && state.interpreting === true && parsed?.invalid === true;
}

export function storyIntentPresentation(raw: string, input: string, availableIds: string[], interrupted = false, direct = false) {
  const parsed = parseStoryIntentOutput(raw, input, availableIds);
  if (interrupted) return storyIntentVisiblePrefix(raw);
  if (parsed.invalid || (direct && parsed.intent?.disposition === 'proposal')) return direct
    ? '这轮回复未能完成校验，故事状态未更新。请重试或补充说明。'
    : '本轮未能形成有效的行动理解，候选后果未执行。请补充说明后继续。';
  return parsed.intent?.disposition === 'proposal' ? STORY_INTENT_REVIEW_TEXT : parsed.content;
}

export type StoryValidationCode = 'protocol_incomplete' | 'protocol_too_large' | 'invalid_json' | 'invalid_schema'
  | 'ungrounded_action' | 'unavailable_action' | 'empty_intent' | 'missing_protocol' | 'unexpected_proposal'
  | 'rule_execution_rejected' | 'empty_narrative' | 'output_truncated' | 'stream_incomplete';
export interface StoryJsonFailure {
  kind: 'trailing_comma' | 'invalid_escape' | 'unescaped_control' | 'unterminated_string' | 'unexpected_end'
    | 'expected_property' | 'missing_separator' | 'unexpected_content' | 'syntax' | 'duplicate_key';
  /** UTF-16 offset within the normalized control JSON, never the provider error text. */
  offset?: number;
  length: number;
  /** Fixed punctuation category at the error; never a source character or quote. */
  token?: 'object_close' | 'array_close' | 'quote' | 'comma' | 'colon' | 'apostrophe' | 'backtick' | 'period' | 'semicolon' | 'typographic_quote' | 'letter' | 'digit' | 'other' | 'end';
}
export interface StoryTurnDiagnostics {
  version: 1;
  model?: string;
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'other';
  streamIncomplete?: boolean;
  protocol: 'text-tag-v1';
  validation: 'passed' | 'failed' | 'interrupted';
  code?: StoryValidationCode;
  jsonFailure?: StoryJsonFailure;
  protocolFailure?: StoryProtocolFailure;
  warnings: Array<'format_normalized' | 'trailing_commas_removed' | 'redundant_closer_removed' | 'redundant_quote_removed' | 'trailing_punctuation_removed' | 'recommendations_fallback' | 'guidance_fallback' | 'facts_filtered' | 'missing_protocol'>;
}
/** Fixed categories and lengths only; never persist the model's control text. */
export interface StoryProtocolFailure {
  kind: 'partial_open' | 'missing_close' | 'trailing_content';
  controlCharacters: number;
  trailingCharacters: number;
}
export interface ParsedStoryIntent {
  content: string;
  intent: StoryIntent | null;
  invalid: boolean;
  invalidReason?: StoryValidationCode;
  jsonFailure?: StoryJsonFailure;
  protocolFailure?: StoryProtocolFailure;
  recommendations?: Array<{ label: string; input: string }>;
  recommendationLead?: string;
  warnings: StoryTurnDiagnostics['warnings'];
}

const OPEN = '<story-intent>';
const CLOSE = '</story-intent>';
// Only a fence immediately around the control block is presentation syntax.
const CONTROL_FENCE = /(?:^|\r?\n)[ \t]*```(?:json)?[ \t]*\r?\n?[ \t]*$/i;
// An explicit, single-character presentation suffix only. Never accept words,
// operators, another JSON value, separators or unfinished container syntax.
const PRESENTATION_SUFFIXES = new Set(["'", '`', '.', ';', '。', '；', '”', '’']);
function narrativeBeforeControl(prefix: string): string {
  return prefix.replace(CONTROL_FENCE, '').trimEnd();
}

// V8 errors may quote private input. Persist only a fixed category and numeric
// location; never attach the Error, its message, or a surrounding text excerpt.
function describeJsonFailure(encoded: string, error: unknown): StoryJsonFailure {
  const message = error instanceof SyntaxError ? error.message : '';
  const position = / at position (\d+)(?: \(line \d+ column \d+\))?$/.exec(message);
  const offset = position ? Number(position[1]) : undefined;
  let kind: StoryJsonFailure['kind'] = 'syntax';
  if (/^Bad (?:Unicode )?escape/.test(message)) kind = 'invalid_escape';
  else if (/^Bad control character/.test(message)) kind = 'unescaped_control';
  else if (/^Unterminated string/.test(message)) kind = 'unterminated_string';
  else if (/^Unexpected end/.test(message)) kind = 'unexpected_end';
  else if (/^Expected (?:double-quoted property name|property name)/.test(message)) kind = 'expected_property';
  else if (/^Expected ',' or/.test(message) || /^Expected ':'/.test(message)) kind = 'missing_separator';
  else if (/^Unexpected non-whitespace character after JSON/.test(message)) kind = 'unexpected_content';
  if (offset != null && (encoded[offset] === '}' || encoded[offset] === ']') && encoded.slice(0, offset).trimEnd().endsWith(',')) kind = 'trailing_comma';
  const validOffset = offset != null && offset >= 0 && offset <= encoded.length;
  const tokens: Record<string, NonNullable<StoryJsonFailure['token']>> = { '}': 'object_close', ']': 'array_close', '"': 'quote', ',': 'comma', ':': 'colon',
    "'": 'apostrophe', '`': 'backtick', '.': 'period', '。': 'period', ';': 'semicolon', '；': 'semicolon', '”': 'typographic_quote', '’': 'typographic_quote' };
  const char = validOffset ? encoded[offset] ?? '' : '';
  const token = tokens[char] ?? (/\p{L}/u.test(char) ? 'letter' : /\p{N}/u.test(char) ? 'digit' : 'other');
  return { kind, length: encoded.length, ...(validOffset ? { offset,
    token: offset === encoded.length ? 'end' as const : token } : {}) };
}

/** Accept only a fully valid object followed by ONE allowed presentation suffix.
 * Never insert delimiters, alter strings/values, discard another object or
 * extract a nested object. All schema/evidence/rule checks still follow.
 */
function withoutRedundantObjectSuffix(encoded: string): { json: string; warning: 'redundant_closer_removed' | 'redundant_quote_removed' | 'trailing_punctuation_removed' } | null {
  if (!encoded.startsWith('{')) return null;
  const stack: string[] = [];
  let quoted = false, escaped = false;
  for (let i = 0; i < encoded.length; i++) {
    const char = encoded[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      if (stack.pop() !== (char === '}' ? '{' : '[')) return null;
      if (!stack.length) {
        const suffix = encoded.slice(i + 1).trim();
        if (suffix !== '}' && suffix !== ']' && suffix !== '"' && !PRESENTATION_SUFFIXES.has(suffix)) return null;
        return { json: encoded.slice(0, i + 1), warning: suffix === '}' || suffix === ']' ? 'redundant_closer_removed'
          : suffix === '"' ? 'redundant_quote_removed' : 'trailing_punctuation_removed' };
      }
    }
  }
  return null;
}

export function parseStoryIntentOutput(raw: string, input: string, availableIds: string[]): ParsedStoryIntent {
  const position = raw.indexOf(OPEN);
  const firstControl = raw.indexOf('<story-intent');
  const content = firstControl < 0 ? raw : narrativeBeforeControl(raw.slice(0, firstControl));
  const warnings: StoryTurnDiagnostics['warnings'] = [];
  const fail = (invalidReason: StoryValidationCode): ParsedStoryIntent => ({ content, intent: null, invalid: true, invalidReason, warnings });
  if (position < 0 || firstControl !== position) {
    const partial = firstControl;
    if (partial >= 0) return { ...fail('protocol_incomplete'), protocolFailure: {
      kind: 'partial_open', controlCharacters: raw.length - partial, trailingCharacters: 0,
    } };
    return { content, intent: null, invalid: false, warnings: ['missing_protocol'] };
  }
  let encoded = raw.slice(position + OPEN.length).trim();
  const fencedControl = CONTROL_FENCE.test(raw.slice(0, position));
  if (fencedControl && /\r?\n[ \t]*```$/.test(encoded)) encoded = encoded.replace(/\r?\n[ \t]*```$/, '').trimEnd();
  if (encoded.length > 16000) return fail('protocol_too_large');
  if (!encoded.endsWith(CLOSE)) {
    const closePosition = encoded.lastIndexOf(CLOSE);
    return { ...fail('protocol_incomplete'), protocolFailure: {
      kind: closePosition < 0 ? 'missing_close' : 'trailing_content',
      controlCharacters: encoded.length,
      trailingCharacters: closePosition < 0 ? 0 : encoded.slice(closePosition + CLOSE.length).trim().length,
    } };
  }
  encoded = encoded.slice(0, -CLOSE.length).trim();
  const innerFence = /^```(?:json)?[ \t]*\r?\n([\s\S]*)\r?\n[ \t]*```$/i.exec(encoded);
  if (innerFence) encoded = innerFence[1].trim();
  if (fencedControl || innerFence || !raw.slice(0, position).endsWith('\n') || raw.includes('\r\n')) warnings.push('format_normalized');
  let decoded: unknown;
  try { decoded = JSON.parse(encoded); } catch (error) {
    // One normalization family per block: do not compound speculative repairs.
    const suffix = withoutRedundantObjectSuffix(encoded);
    const commas = suffix ? null : withoutTrailingCommas(encoded);
    const normalized = suffix?.json ?? commas;
    if (!normalized) return { ...fail('invalid_json'), jsonFailure: describeJsonFailure(encoded, error) };
    try { decoded = JSON.parse(normalized); }
    catch { return { ...fail('invalid_json'), jsonFailure: describeJsonFailure(encoded, error) }; }
    encoded = normalized;
    warnings.push(suffix?.warning ?? 'trailing_commas_removed');
  }
  const duplicateOffset = duplicateJsonKeyOffset(encoded);
  if (duplicateOffset !== null) return { ...fail('invalid_json'), jsonFailure: {
    kind: 'duplicate_key', offset: duplicateOffset, length: encoded.length, token: 'quote',
  } };
  const record = decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded as Record<string, unknown> : null;
  const recommendations = storyRecommendationsSchema.safeParse(record?.recommendations);
  const recommendationLead = parseStoryRecommendationsLead(record?.recommendationLead, content);
  if (!recommendations.success) warnings.push('recommendations_fallback');
  if (record?.recommendationLead !== undefined && !recommendationLead) warnings.push('guidance_fallback');
  // Optional presentation data cannot invalidate action authority.
  const authority = record ? { ...record } : null;
  if (authority) { delete authority.recommendations; delete authority.recommendationLead; }
  const result = storyIntentSchema.safeParse(authority ?? decoded);
  if (!result.success) return fail('invalid_schema');
  const intent = result.data;
  if (intent.steps.some(step => !input.includes(step.evidence))) return fail('ungrounded_action');
  if (intent.steps.some(step => step.kind === 'execute' && !availableIds.includes(step.actionId))) return fail('unavailable_action');
  const originalFactCount = intent.facts.length;
  intent.facts = intent.facts.filter(fact => (fact.speaker === 'player' ? input : content).includes(fact.evidence)
    && (intent.disposition !== 'proposal' || fact.speaker === 'player'));
  if (intent.facts.length !== originalFactCount) warnings.push('facts_filtered');
  if ((intent.disposition === 'proposal' || intent.disposition === 'execution') && !intent.steps.length && !intent.facts.length) return fail('empty_intent');
  return { content, intent, recommendations: recommendations.success ? recommendations.data : [], recommendationLead, invalid: false, warnings };
}

export function storyIntentVisiblePrefix(raw: string, complete = false): string {
  // Even a malformed/unfinished opening tag must not expose control text as prose.
  // Parsing still requires the exact tag and never repairs the envelope.
  const marker = raw.indexOf('<story-intent');
  if (marker >= 0) return narrativeBeforeControl(raw.slice(0, marker));
  if (!complete) {
    for (let size = Math.min(raw.length, OPEN.length - 1); size > 0; size--) {
      if (raw.endsWith(OPEN.slice(0, size))) return narrativeBeforeControl(raw.slice(0, -size));
    }
    // Delay a possible control fence until its purpose is known. This also
    // prevents a code fence from leaking when the provider splits it bytewise.
    return raw.replace(/(?:^|\r?\n)[ \t]*`{1,3}(?:j(?:s(?:o(?:n)?)?)?)?[ \t]*\r?\n?[ \t]*$/i, '').trimEnd();
  }
  return raw;
}

/** Fixed vocabulary only: never expose raw provider payloads or schema values. */
export function storyValidationMessage(diagnostic?: unknown): string {
  const messages: Partial<Record<StoryValidationCode, string>> = {
    protocol_incomplete: '模型没有完整返回剧情控制信息，请重试本轮。',
    protocol_too_large: '模型返回的剧情控制信息过长，请重试本轮。',
    invalid_json: '模型返回的剧情控制信息格式有误，请重试本轮。',
    invalid_schema: '模型返回的剧情控制字段不符合约定，请重试本轮。',
    ungrounded_action: '模型选择的行动缺少本轮输入依据，请重试或明确行动。',
    unavailable_action: '模型选择了当前不可用的规则行动，请重新选择。',
    missing_protocol: '模型遗漏了本轮所需的剧情控制信息，请重试。',
    unexpected_proposal: '模型仍返回了旧版确认提案，请重试本轮。',
    rule_execution_rejected: '当前故事条件不允许该规则行动，请刷新后重新选择。',
    empty_intent: '模型返回的行动没有有效依据，请重试本轮。',
    empty_narrative: '模型没有返回可读的剧情正文，请重试本轮。',
    output_truncated: '模型回复达到了输出上限，本轮尚未完成。',
    stream_incomplete: '模型回复传输未完整结束，已保留收到的片段。',
  };
  const code = diagnostic && typeof diagnostic === 'object' ? (diagnostic as { code?: unknown }).code : null;
  return (typeof code === 'string' && Object.hasOwn(messages, code) ? `${messages[code as StoryValidationCode]} 本轮未提交状态变化。` : '') || '模型回复未通过剧情结构校验，未提交状态变化。你可以重新发送或调整行动。';
}
