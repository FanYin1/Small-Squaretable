import { createHash } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';
import { canonicalAuditJson, loadCharacterImportAudit } from './character-import-audit';
import { characterWorldbookSchema, mapCharacterWorldbookEntry } from '../types/character-worldbook';
import { MAX_CHARACTER_FILE_BYTES, parseCharacterFile } from '../types/character-card-import';
import { isStandaloneWorldbook, prepareStandaloneWorldbook } from '../types/worldbook-import';

const identifier = z.string().uuid().transform(value => value.toLowerCase());
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const legacyScopeSchema = z.object({ tenantId: identifier, ownerId: identifier, characterId: identifier }).strict();
export const legacyRequestSchema = legacyScopeSchema.extend({
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.enum(['current', 'nested', 'archive', 'file']) }).strict(),
    z.object({ kind: z.literal('bound'), bookId: identifier }).strict(),
  ]),
  bindings: z.array(z.object({ bookId: identifier, action: z.enum(['keep', 'detach']) }).strict()).max(50)
    .refine(bindings => new Set(bindings.map(binding => binding.bookId)).size === bindings.length, 'Duplicate binding')
    .transform(bindings => [...bindings].sort((left, right) => left.bookId.localeCompare(right.bookId))),
}).strict();
const bindingPreviewSchema = z.object({
  bookId: identifier, action: z.enum(['keep', 'detach', 'activate']),
  beforeScope: z.string(), afterScope: z.string(), beforeEnabled: z.boolean(), afterEnabled: z.boolean(),
  entryCount: z.number().int().nonnegative(), contentFingerprint: fingerprint, differingFields: z.array(z.string()),
}).strict();
export const legacyPlanSchema = z.object({
  version: z.literal('character-legacy-v1'), request: legacyRequestSchema,
  auditFingerprint: fingerprint, sourceFingerprint: fingerprint, entryCount: z.number().int().min(1).max(10000),
  operation: z.enum(['copy_source', 'select_bound']), bindings: z.array(bindingPreviewSchema).max(50),
  fingerprint,
}).strict();
type Request = z.infer<typeof legacyRequestSchema>;
type Plan = z.infer<typeof legacyPlanSchema>;
type Row = Record<string, unknown>;
type MappedEntry = ReturnType<typeof mapCharacterWorldbookEntry>;
export type LegacyExternalSource = { sha256: string; name: string; entries: MappedEntry[] };

export class CharacterLegacyError extends Error {
  constructor(public code: string) { super(code); }
}
function reject(code: string): never { throw new CharacterLegacyError(`LEGACY_${code}`); }
function record(value: unknown): Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}
function digest(value: unknown) { return createHash('sha256').update(canonicalAuditJson(value)).digest('hex'); }
const entryKeys = ['keyword', 'content', 'position', 'is_enabled', 'priority', 'prevent_recursion', 'recursive', 'settings', 'character_filter', 'scan_depth', 'context_percentage'];
function fields(entry: Row) { return Object.fromEntries(entryKeys.map(key => [key, entry[key]])); }
function entryDigest(entries: Row[]) { return digest(entries.map(entry => canonicalAuditJson(fields(entry))).sort()); }
function mappedFields(entry: MappedEntry): Row {
  return { keyword: entry.keyword, content: entry.content, position: entry.position, is_enabled: entry.isEnabled,
    priority: entry.priority, prevent_recursion: entry.preventRecursion, recursive: entry.recursive,
    settings: JSON.parse(JSON.stringify(entry.settings)), character_filter: [], scan_depth: null, context_percentage: null };
}
function mappedSource(value: unknown) {
  const parsed = characterWorldbookSchema.safeParse(value);
  if (!parsed.success || !parsed.data.entries.length) return reject('SOURCE_REQUIRED');
  if (parsed.data.entries.length > 10000) return reject('INSPECTION_LIMIT');
  const entries = parsed.data.entries.map(mapCharacterWorldbookEntry);
  if (entries.some(entry => entry.keyword.length > 255)) return reject('SOURCE_INVALID');
  return { name: parsed.data.name || 'Recovered character lorebook', entries };
}
export async function prepareLegacyExternalSource(bytes: Uint8Array): Promise<LegacyExternalSource> {
  if (bytes.length > MAX_CHARACTER_FILE_BYTES) return reject('INSPECTION_LIMIT');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  try {
    if (new TextDecoder().decode(bytes.subarray(0, 128)).trimStart().startsWith('{')) {
      const original: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (isStandaloneWorldbook(original)) {
        const prepared = prepareStandaloneWorldbook(original);
        if (!prepared.entries.length || prepared.entries.length > 10000 || prepared.entries.some(entry => entry.keyword.length > 255)) return reject('SOURCE_INVALID');
        return { sha256, name: prepared.name, entries: prepared.entries };
      }
    }
    const parsed = await parseCharacterFile(bytes);
    return { sha256, ...mappedSource(parsed.character.cardData.character_book) };
  } catch (error) {
    if (error instanceof CharacterLegacyError) throw error;
    return reject('SOURCE_INVALID');
  }
}
async function inspect(transaction: TransactionSql, request: Request, external?: LegacyExternalSource) {
  const loaded = await loadCharacterImportAudit(transaction, { ...request, characterIds: [request.characterId] }, request.characterId);
  if (!loaded.source) return reject(loaded.report.status === 'inspection_limit' ? 'INSPECTION_LIMIT' : 'NOT_FOUND_IN_SCOPE');
  if (loaded.report.status === 'binding_ownership_conflict') return reject('OWNERSHIP_CONFLICT');
  const books = loaded.books!;
  const entries = loaded.entries!;
  if (canonicalAuditJson(books.map(book => book.id).sort()) !== canonicalAuditJson(request.bindings.map(binding => binding.bookId))) return reject('BINDINGS_CHANGED');
  const [legacy] = await transaction.unsafe(`SELECT EXISTS(SELECT 1 FROM chats chat WHERE
    (chat.character_id = $1 OR EXISTS(SELECT 1 FROM chat_characters participant WHERE participant.chat_id = chat.id AND participant.character_id = $1))
    AND (chat.worldbook_snapshot_version IS DISTINCT FROM 1 OR chat.content_snapshot_version IS DISTINCT FROM 1)) AS present`, [request.characterId]);
  if (legacy.present) return reject('UNFROZEN_STORY');
  const card = record(loaded.source.card_data);
  let source: { name: string; entries: MappedEntry[] } | undefined;
  let sourceFingerprint: string;
  let expected: Row[];
  if (request.source.kind === 'bound') {
    const selectedId = request.source.bookId;
    const selected = books.find(book => book.id === selectedId);
    if (!selected || request.bindings.find(binding => binding.bookId === selectedId)?.action !== 'keep') return reject('SOURCE_SELECTION');
    expected = entries.filter(entry => entry.worldbook_id === selectedId).map(fields);
    sourceFingerprint = digest({ selected, entries: entries.filter(entry => entry.worldbook_id === selectedId) });
  } else {
    let raw: unknown;
    if (request.source.kind === 'file') {
      if (!external) return reject('SOURCE_REQUIRED');
      source = external;
      sourceFingerprint = external.sha256;
    } else {
      if (external) return reject('SOURCE_SELECTION');
      if (request.source.kind === 'current') raw = card.character_book;
      if (request.source.kind === 'nested') raw = record(card.data).character_book;
      if (request.source.kind === 'archive') {
        const archive = record(card._squaretableImport);
        if (archive.version !== 1) return reject('SOURCE_REQUIRED');
        const original = record(archive.original);
        const top = original.character_book;
        const nested = record(original.data).character_book;
        if (top != null && nested != null && digest(top) !== digest(nested)) return reject('SOURCE_CONFLICT');
        raw = top ?? nested;
      }
      source = mappedSource(raw);
      sourceFingerprint = digest(raw);
    }
    expected = source.entries.map(mappedFields);
  }
  if (!expected.length) return reject('SOURCE_REQUIRED');
  const keptIds = request.bindings.filter(binding => binding.action === 'keep').map(binding => binding.bookId);
  if (request.source.kind !== 'bound' && (keptIds.length >= 50 || entries.filter(entry => keptIds.includes(String(entry.worldbook_id))).length + expected.length > 10000)) return reject('INSPECTION_LIMIT');
  const payload = {
    version: 'character-legacy-v1' as const, request,
    auditFingerprint: loaded.report.reviewFingerprint!, sourceFingerprint, entryCount: expected.length,
    operation: request.source.kind === 'bound' ? 'select_bound' as const : 'copy_source' as const,
    bindings: request.bindings.map(binding => {
      const book = books.find(item => item.id === binding.bookId)!;
      const actual = entries.filter(entry => entry.worldbook_id === book.id);
      const selected = request.source.kind === 'bound' && request.source.bookId === book.id;
      return { bookId: binding.bookId, action: selected ? 'activate' as const : binding.action,
        beforeScope: String(book.scope), afterScope: selected || binding.action === 'detach' ? 'character' : String(book.scope),
        beforeEnabled: Boolean(book.is_enabled), afterEnabled: selected ? true : Boolean(book.is_enabled),
        entryCount: actual.length, contentFingerprint: entryDigest(actual),
        differingFields: entryKeys.filter(key => digest(actual.map(entry => canonicalAuditJson(entry[key])).sort()) !== digest(expected.map(entry => canonicalAuditJson(entry[key])).sort())),
      };
    }),
  };
  return { plan: legacyPlanSchema.parse({ ...payload, fingerprint: digest(payload) }), source };
}
export async function planCharacterLegacy(client: Sql, input: Request, external?: LegacyExternalSource) {
  const request = legacyRequestSchema.parse(input);
  return client.begin('isolation level repeatable read read only', async transaction => {
    await transaction.unsafe("SELECT set_config('statement_timeout', '15000', true)");
    return (await inspect(transaction, request, external)).plan;
  });
}
async function receipt(transaction: TransactionSql, scope: z.infer<typeof legacyScopeSchema>, expectedPlan: string) {
  const [row] = await transaction.unsafe(`SELECT book_id, entry_count, created_at FROM character_import_repairs
    WHERE character_id = $1 AND tenant_id = $2 AND owner_id = $3 AND review_fingerprint = $4`,
  [scope.characterId, scope.tenantId, scope.ownerId, expectedPlan]);
  return row ? { status: 'already_applied' as const, writePerformed: false, currentStateRechecked: false,
    fingerprint: expectedPlan, bookId: row.book_id as string, entryCount: row.entry_count as number, appliedAt: row.created_at as Date } : null;
}
export async function readCharacterLegacyReceipt(client: Sql, input: z.infer<typeof legacyScopeSchema>, expectedPlan: string) {
  const scope = legacyScopeSchema.parse(input);
  fingerprint.parse(expectedPlan);
  return client.begin('isolation level repeatable read read only', async transaction => {
    const [character] = await transaction.unsafe('SELECT id FROM characters WHERE id = $1 AND tenant_id = $2 AND creator_id = $3', [scope.characterId, scope.tenantId, scope.ownerId]);
    if (!character) return reject('NOT_FOUND_IN_SCOPE');
    return await receipt(transaction, scope, expectedPlan) ?? { status: 'not_applied', writePerformed: false, fingerprint: expectedPlan };
  });
}
export async function applyCharacterLegacy(client: Sql, input: Plan, expectedPlan: string, external?: LegacyExternalSource) {
  const plan = legacyPlanSchema.parse(input);
  const { fingerprint: planFingerprint, ...payload } = plan;
  if (fingerprint.parse(expectedPlan) !== planFingerprint || digest(payload) !== planFingerprint) return reject('PLAN_INVALID');
  const request = plan.request;
  return client.begin('isolation level read committed', async transaction => {
    await transaction.unsafe("SELECT set_config('statement_timeout', '15000', true), set_config('lock_timeout', '10000', true)");
    const [character] = await transaction.unsafe('SELECT id FROM characters WHERE id = $1 AND tenant_id = $2 AND creator_id = $3 FOR UPDATE', [request.characterId, request.tenantId, request.ownerId]);
    if (!character) return reject('NOT_FOUND_IN_SCOPE');
    const previous = await receipt(transaction, request, planFingerprint);
    if (previous) return previous;
    const [counts] = await transaction.unsafe('SELECT count(*)::int AS count FROM worldbooks WHERE character_id = $1', [request.characterId]);
    if (counts.count > 50) return reject('INSPECTION_LIMIT');
    await transaction.unsafe('SELECT id FROM worldbooks WHERE character_id = $1 ORDER BY id FOR UPDATE', [request.characterId]);
    const [entryCounts] = await transaction.unsafe('SELECT count(*)::int AS count FROM worldbook_entries WHERE worldbook_id IN (SELECT id FROM worldbooks WHERE character_id = $1)', [request.characterId]);
    if (entryCounts.count > 10000) return reject('INSPECTION_LIMIT');
    await transaction.unsafe('SELECT id FROM worldbook_entries WHERE worldbook_id IN (SELECT id FROM worldbooks WHERE character_id = $1) ORDER BY id FOR UPDATE', [request.characterId]);
    const current = await inspect(transaction, request, external);
    if (current.plan.fingerprint !== planFingerprint) return reject('REVIEW_CHANGED');
    let bookId: string;
    if (request.source.kind === 'bound') {
      bookId = request.source.bookId;
      await transaction.unsafe("UPDATE worldbooks SET is_enabled = true, scope = 'character', updated_at = now() WHERE id = $1", [bookId]);
    } else {
      const source = current.source!;
      const [book] = await transaction.unsafe(`INSERT INTO worldbooks (tenant_id, user_id, character_id, name, scope)
        VALUES ($1, $2, $3, $4, 'character') RETURNING id`, [request.tenantId, request.ownerId, request.characterId, source.name]);
      bookId = book.id as string;
      for (const entry of source.entries) {
        await transaction.unsafe(`INSERT INTO worldbook_entries (worldbook_id, keyword, content, position, is_enabled, priority, prevent_recursion, recursive, settings)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text::jsonb)`,
        [bookId, entry.keyword, entry.content, entry.position, entry.isEnabled, entry.priority, entry.preventRecursion, entry.recursive, JSON.stringify(entry.settings)]);
      }
    }
    for (const binding of request.bindings) {
      if (binding.action === 'detach') await transaction.unsafe("UPDATE worldbooks SET character_id = NULL, scope = 'character', updated_at = now() WHERE id = $1", [binding.bookId]);
    }
    const [written] = await transaction.unsafe(`INSERT INTO character_import_repairs (character_id, tenant_id, owner_id, review_fingerprint, book_id, entry_count)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING created_at`, [request.characterId, request.tenantId, request.ownerId, planFingerprint, bookId, plan.entryCount]);
    return { status: 'applied' as const, writePerformed: true, currentStateRechecked: true,
      fingerprint: planFingerprint, bookId, entryCount: plan.entryCount, appliedAt: written.created_at as Date };
  });
}
