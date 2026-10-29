import type { Sql } from 'postgres';
import { z } from 'zod';
import { loadCharacterImportAudit } from './character-import-audit';
import { characterWorldbookSchema, mapCharacterWorldbookEntry } from '../types/character-worldbook';

export const characterRepairSchema = z.object({
  tenantId: z.string().uuid().transform(value => value.toLowerCase()),
  ownerId: z.string().uuid().transform(value => value.toLowerCase()),
  characterId: z.string().uuid().transform(value => value.toLowerCase()),
  expectedReview: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export class CharacterImportRepairError extends Error {
  constructor(public code: 'REPAIR_NOT_FOUND_IN_SCOPE' | 'REPAIR_REVIEW_CHANGED' | 'REPAIR_NOT_ELIGIBLE' | 'REPAIR_INSPECTION_LIMIT') {
    super(code);
  }
}

export async function repairCharacterImport(client: Sql, input: z.infer<typeof characterRepairSchema>) {
  const scope = characterRepairSchema.parse(input);
  return client.begin('isolation level read committed', async transaction => {
    await transaction.unsafe("SELECT set_config('statement_timeout', '15000', true), set_config('lock_timeout', '10000', true)");
    const [character] = await transaction.unsafe(`SELECT id FROM characters
      WHERE id = $1 AND tenant_id = $2 AND creator_id = $3 FOR UPDATE`, [scope.characterId, scope.tenantId, scope.ownerId]);
    if (!character) throw new CharacterImportRepairError('REPAIR_NOT_FOUND_IN_SCOPE');
    const [previous] = await transaction.unsafe(`SELECT book_id, entry_count, created_at FROM character_import_repairs
      WHERE character_id = $1 AND tenant_id = $2 AND owner_id = $3 AND review_fingerprint = $4`,
    [scope.characterId, scope.tenantId, scope.ownerId, scope.expectedReview]);
    if (previous) return {
      status: 'already_applied', writePerformed: false, scope,
      bookId: previous.book_id as string, entryCount: previous.entry_count as number,
      appliedAt: previous.created_at as Date, currentStateRechecked: false,
    };
    await transaction.unsafe('SELECT id FROM worldbooks WHERE character_id = $1 ORDER BY id LIMIT 1 FOR UPDATE', [scope.characterId]);
    const inspected = await loadCharacterImportAudit(transaction, { ...scope, characterIds: [scope.characterId] }, scope.characterId);
    if (inspected.report.status === 'inspection_limit') throw new CharacterImportRepairError('REPAIR_INSPECTION_LIMIT');
    if (inspected.report.reviewFingerprint !== scope.expectedReview) throw new CharacterImportRepairError('REPAIR_REVIEW_CHANGED');
    if (inspected.report.status !== 'missing_bound_book' || !inspected.source) throw new CharacterImportRepairError('REPAIR_NOT_ELIGIBLE');
    const embedded = characterWorldbookSchema.parse((inspected.source.card_data as Record<string, unknown>).character_book);
    if (embedded.entries.length > 10000) throw new CharacterImportRepairError('REPAIR_INSPECTION_LIMIT');
    const [book] = await transaction.unsafe(`INSERT INTO worldbooks (tenant_id, user_id, character_id, name, scope)
      VALUES ($1, $2, $3, $4, 'character') RETURNING id`,
    [scope.tenantId, scope.ownerId, scope.characterId, embedded.name || `${inspected.source.name}'s Lorebook`.slice(0, 255)]);
    for (const entry of embedded.entries) {
      const mapped = mapCharacterWorldbookEntry(entry);
      await transaction.unsafe(`INSERT INTO worldbook_entries
        (worldbook_id, keyword, content, position, is_enabled, priority, prevent_recursion, settings, recursive)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb, $9)`,
      [book.id, mapped.keyword, mapped.content, mapped.position, mapped.isEnabled, mapped.priority, mapped.preventRecursion, JSON.stringify(mapped.settings), mapped.recursive]);
    }
    const [receipt] = await transaction.unsafe(`INSERT INTO character_import_repairs
      (character_id, tenant_id, owner_id, review_fingerprint, book_id, entry_count)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING created_at`,
    [scope.characterId, scope.tenantId, scope.ownerId, scope.expectedReview, book.id, embedded.entries.length]);
    return {
      status: 'applied', writePerformed: true, scope,
      bookId: book.id as string, entryCount: embedded.entries.length,
      appliedAt: receipt.created_at as Date, currentStateRechecked: true,
    };
  });
}
