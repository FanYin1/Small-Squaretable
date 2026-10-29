import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';
import { openingContent, type OpeningReference } from '../../types/story-opening';
import { openingRecordSchema, type OpeningRecord } from '../../types/story-opening-record';

type ReviewedAdapter = {
  id: NonNullable<OpeningRecord['adapter']>; templateDigest: string; format: 'json' | 'yaml';
  path: string[]; fieldId: 'opening-credit' | 'opening-money'; label: string; playerPath?: string[];
};
export const reviewedOpeningAdapters: readonly ReviewedAdapter[] = [
  { id: 'azure-json-credit-v1', templateDigest: '52434c6b36726ab21022af0710d1858c44bf43e74b859baad1a8a6e1bd397df9', format: 'json',
    path: ['指挥官系统', '基础信息', '信用点'], fieldId: 'opening-credit', label: '信用点', playerPath: ['指挥官系统', '基础信息', '姓名'] },
  { id: 't1-yaml-money-v1', templateDigest: 'fd2cc2bd80f9c363a4cc74a9072a96fd0a1ed4809f0b21929fe2c07620349c54', format: 'yaml',
    path: ['核心角色', '主角', '金钱'], fieldId: 'opening-money', label: '金钱' },
];
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function atPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !Object.hasOwn(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function compileOpeningRecord(adapter: ReviewedAdapter | null, raw: string, reference: OpeningReference, native = false): OpeningRecord {
  const record: OpeningRecord = { version: 1, status: 'unsupported', reason: 'unknown-format', adapter: adapter?.id ?? null,
    source: { opening: reference, digest: hash(raw) }, fields: [] };
  const result = (status: OpeningRecord['status'], reason: OpeningRecord['reason']) => openingRecordSchema.parse({ ...record, status, reason });
  const hasInitialization = /<(?:VariableInsert|UpdateVariable|initvar|era_data)\b/i.test(raw);
  if (native) return result(hasInitialization ? 'conflict' : 'native', hasInitialization ? 'native-conflict' : 'native');
  if (!adapter) return record;
  if (!hasInitialization || reference.source === 'none') return result('unavailable', 'missing-initialization');
  if (raw.length > 256_000) return result('unavailable', 'invalid-initialization');
  try {
    const tag = adapter.format === 'json' ? 'VariableInsert' : 'UpdateVariable';
    const blocks = [...raw.matchAll(new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi'))];
    const markers = [...raw.matchAll(new RegExp(`<\\/?${tag}\\b`, 'gi'))];
    if (blocks.length !== 1 || markers.length !== 2) return result('unavailable', 'invalid-initialization');
    const outside = raw.replace(blocks[0][0], '');
    if (/<(?:VariableInsert|VariableEdit|VariableUpdate|VariableDelete|UpdateVariable|initvar|era_data)\b/i.test(outside)) return result('unavailable', 'unsupported-update');
    let payload = blocks[0][1].trim();
    if (adapter.format === 'yaml') {
      const wrapped = /^<initvar>\s*```yaml\s*\n([\s\S]*?)\n```\s*<\/initvar>$/i.exec(payload);
      if (!wrapped) return result('unavailable', 'invalid-initialization');
      payload = wrapped[1].replace(/\r\n?/g, '\n');
    } else JSON.parse(payload);
    if (payload.length > 64_000) return result('unavailable', 'invalid-initialization');
    const document = parseDocument(payload, { schema: adapter.format === 'json' ? 'json' : 'core', uniqueKeys: true, customTags: [] });
    if (document.errors.length || document.warnings.length) return result('unavailable', 'invalid-initialization');
    const data: unknown = document.toJS({ maxAliasCount: 0 });
    if (adapter.playerPath && atPath(data, adapter.playerPath) !== '{{user}}') return result('unavailable', 'player-unverified');
    const value = atPath(data, adapter.path);
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) return result('unavailable', 'invalid-initialization');
    record.fields = [{ id: adapter.fieldId, label: adapter.label, value, path: [...adapter.path] }];
    return result('initial-only', 'recorded');
  } catch { return result('unavailable', 'invalid-initialization'); }
}

export function openingRecordAdapter(card: Record<string, unknown>): ReviewedAdapter | null {
  const extensions = card.extensions as Record<string, unknown> | undefined;
  const scripts = extensions?.regex_scripts;
  if (!Array.isArray(scripts)) return null;
  const digests = new Set(scripts.flatMap(script => script && typeof script === 'object' && typeof script.replaceString === 'string'
    && !script.disabled ? [hash(script.replaceString)] : []));
  return reviewedOpeningAdapters.find(adapter => digests.has(adapter.templateDigest)) ?? null;
}

export function prepareOpeningRecord(card: Record<string, unknown>, reference: OpeningReference, native: boolean, adapter = openingRecordAdapter(card)) {
  return compileOpeningRecord(adapter, openingContent(card, reference) ?? '', reference, native);
}
