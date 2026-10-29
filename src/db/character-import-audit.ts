import { createHash } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';
import { characterWorldbookSchema, mapCharacterWorldbookEntry } from '../types/character-worldbook';

export const characterAuditScopeSchema = z.object({
  tenantId: z.string().uuid(),
  ownerId: z.string().uuid(),
  characterIds: z.array(z.string().uuid()).min(1).max(50).transform(ids => [...new Set(ids.map(id => id.toLowerCase()))].sort()),
}).strict();

export type CharacterAuditScope = z.infer<typeof characterAuditScopeSchema>;
type StoredRow = Record<string, unknown>;
export interface CharacterAuditSource {
  id: string;
  tenant_id: string;
  creator_id: string;
  name?: string;
  card_data: unknown;
}

function record(value: unknown): StoredRow | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as StoredRow : undefined;
}

export function canonicalAuditJson(value: unknown): string {
  const normalized: unknown = JSON.parse(JSON.stringify(value));
  function sorted(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(sorted);
    const fields = record(item);
    return fields ? Object.fromEntries(Object.keys(fields).sort().map(key => [key, sorted(fields[key])])) : item;
  }
  return JSON.stringify(sorted(normalized));
}

function entryFields(entry: StoredRow) {
  return {
    keyword: entry.keyword, content: entry.content, position: entry.position,
    is_enabled: entry.is_enabled, priority: entry.priority, settings: entry.settings,
    prevent_recursion: entry.prevent_recursion, recursive: entry.recursive,
    character_filter: entry.character_filter, scan_depth: entry.scan_depth,
    context_percentage: entry.context_percentage,
  };
}

export function inspectCharacterImport(source: CharacterAuditSource, books: StoredRow[], entries: StoredRow[]) {
  const fingerprint = createHash('sha256').update(canonicalAuditJson({
    version: 1, source,
    books: [...books].sort((left, right) => String(left.id).localeCompare(String(right.id))),
    entries: [...entries].sort((left, right) => String(left.id).localeCompare(String(right.id))),
  })).digest('hex');
  const card = record(source.card_data);
  const nested = record(card?.data)?.character_book;
  const archive = record(card?._squaretableImport);
  const original = record(archive?.original);
  const archivedBook = original?.character_book ?? record(original?.data)?.character_book;
  const base = {
    characterId: source.id, reviewFingerprint: fingerprint,
    boundBooks: books.length, storedEntries: entries.length,
    originalArchived: archive?.version === 1 && !!original,
  };
  const result = (status: string, expectedEntries: number | null = null, matchingBooks = 0) => ({
    ...base, status, expectedEntries, matchingBooks, automaticRepairAllowed: false as const,
  });
  if (books.some(book => book.tenant_id !== source.tenant_id || book.user_id !== source.creator_id || book.character_id !== source.id)) {
    return result('binding_ownership_conflict');
  }
  const embedded = card?.character_book;
  if (embedded == null) {
    return result(nested != null ? 'nested_source_only' : archivedBook != null ? 'archive_source_only' : 'no_embedded_source');
  }
  if (nested != null && canonicalAuditJson(nested) !== canonicalAuditJson(embedded)) return result('source_conflict');
  const parsed = characterWorldbookSchema.safeParse(embedded);
  if (!parsed.success) return result('invalid_embedded_source');
  const expected = parsed.data.entries.map(entry => {
    const mapped = mapCharacterWorldbookEntry(entry);
    return canonicalAuditJson(entryFields({
      keyword: mapped.keyword, content: mapped.content, position: mapped.position,
      is_enabled: mapped.isEnabled, priority: mapped.priority, settings: mapped.settings,
      prevent_recursion: mapped.preventRecursion, recursive: mapped.recursive, character_filter: [],
      scan_depth: null, context_percentage: null,
    }));
  }).sort();
  if (expected.length === 0) return result('empty_embedded_source', 0);
  if (!books.length) return result('missing_bound_book', expected.length);
  const matches = books.filter(book => {
    const actual = entries.filter(entry => entry.worldbook_id === book.id).map(entry => canonicalAuditJson(entryFields(entry))).sort();
    return canonicalAuditJson(actual) === canonicalAuditJson(expected);
  });
  if (matches.length > 1) return result('multiple_matching_books', expected.length, matches.length);
  if (matches.length === 1) {
    if (matches[0].scope !== 'character' || matches[0].is_enabled !== true) return result('matching_book_inactive', expected.length, 1);
    return result(books.length === 1 ? 'matching_bound_book' : 'matching_with_additional_bindings', expected.length, 1);
  }
  return result('bound_content_differs', expected.length);
}

export async function loadCharacterImportAudit(transaction: TransactionSql, scope: CharacterAuditScope, characterId: string) {
  const parameters = [characterId, scope.tenantId, scope.ownerId];
  const [size] = await transaction.unsafe(`SELECT octet_length(card_data::text) AS bytes FROM characters
    WHERE id = $1 AND tenant_id = $2 AND creator_id = $3`, parameters);
  const unavailable = (status: string) => ({ characterId, status, reviewFingerprint: null, automaticRepairAllowed: false });
  if (!size) return { report: unavailable('not_found_in_scope') };
  if (size.bytes > 12 * 1024 * 1024) return { report: unavailable('inspection_limit') };
  const [counts] = await transaction.unsafe(`SELECT count(*)::int AS count, coalesce(sum(octet_length(to_jsonb(book)::text)), 0)::bigint AS bytes
    FROM worldbooks AS book WHERE character_id = $1`, [characterId]);
  const [entryCounts] = await transaction.unsafe(`SELECT count(*)::int AS count, coalesce(sum(octet_length(to_jsonb(entry)::text)), 0)::bigint AS bytes
    FROM worldbook_entries AS entry WHERE worldbook_id IN (SELECT id FROM worldbooks WHERE character_id = $1)`, [characterId]);
  if (counts.count > 50 || entryCounts.count > 10000 || Number(counts.bytes) + Number(entryCounts.bytes) > 32 * 1024 * 1024) {
    return { report: unavailable('inspection_limit') };
  }
  const [source] = await transaction.unsafe<CharacterAuditSource[]>(`SELECT id, tenant_id, creator_id, name, card_data FROM characters WHERE id = $1
    AND tenant_id = $2 AND creator_id = $3`, parameters);
  const books = await transaction.unsafe('SELECT * FROM worldbooks WHERE character_id = $1 ORDER BY id', [characterId]);
  const entries = await transaction.unsafe(`SELECT id, worldbook_id, keyword, content, position, is_enabled, priority, settings,
    prevent_recursion, recursive, character_filter, scan_depth, context_percentage, created_at, updated_at
    FROM worldbook_entries WHERE worldbook_id IN (SELECT id FROM worldbooks WHERE character_id = $1) ORDER BY id`, [characterId]);
  return { report: inspectCharacterImport(source, books, entries), source, books, entries };
}

export async function auditCharacterImports(client: Sql, input: CharacterAuditScope) {
  const scope = characterAuditScopeSchema.parse(input);
  return client.begin('isolation level repeatable read read only', async transaction => {
    await transaction.unsafe("SELECT set_config('statement_timeout', '15000', true)");
    const results = [];
    for (const characterId of scope.characterIds) {
      results.push((await loadCharacterImportAudit(transaction, scope, characterId)).report);
    }
    return {
      version: 1, mode: 'read_only', generatedAt: new Date().toISOString(), scope,
      summary: results.reduce<Record<string, number>>((counts, item) => {
        counts[item.status] = (counts[item.status] ?? 0) + 1;
        return counts;
      }, {}),
      results,
    };
  });
}
