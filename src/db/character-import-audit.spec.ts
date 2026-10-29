import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { characterAuditScopeSchema, inspectCharacterImport } from './character-import-audit';

const characterId = '10000000-0000-4000-8000-000000000001';
const ownerId = '20000000-0000-4000-8000-000000000002';
const tenantId = '30000000-0000-4000-8000-000000000003';
const bookId = '40000000-0000-4000-8000-000000000004';
const embedded = { entries: [{ keys: ['key'], content: 'PRIVATE_AUTHOR_TEXT', insertion_order: 7 }] };
const character = { id: characterId, tenant_id: tenantId, creator_id: ownerId, card_data: { character_book: embedded } };
const book = { id: bookId, character_id: characterId, tenant_id: tenantId, user_id: ownerId, scope: 'character', is_enabled: true };
const entry = {
  id: 'entry-1', worldbook_id: bookId, keyword: 'key', content: 'PRIVATE_AUTHOR_TEXT', position: 7,
  is_enabled: true, priority: 4, prevent_recursion: false, recursive: true,
  character_filter: [], scan_depth: null, context_percentage: null,
  settings: {
    keys: ['key'], keysSecondary: [], selectiveLogic: 'AND_ANY', comment: null, position: 'after', depth: 4,
    order: 7, constant: false, probability: 100, sticky: 0, cooldown: 0, delay: 0,
    caseSensitive: false, matchWholeWords: false, excludeRecursion: false,
  },
};

describe('historical character import audit', () => {
  it('compares explicit recursive=false using the shared import mapping', () => {
    const source = { ...character, card_data: { character_book: { entries: [{ ...embedded.entries[0], recursive: false }] } } };
    expect(inspectCharacterImport(source, [book], [{ ...entry, recursive: false }]).status).toBe('matching_bound_book');
    expect(inspectCharacterImport(source, [book], [entry]).status).toBe('bound_content_differs');
  });
  it('requires bounded explicit tenant, owner and character scope', () => {
    expect(characterAuditScopeSchema.parse({ tenantId, ownerId, characterIds: [characterId, characterId] }).characterIds).toEqual([characterId]);
    for (const characterIds of [[], Array(51).fill(characterId), ['invalid']]) {
      expect(characterAuditScopeSchema.safeParse({ tenantId, ownerId, characterIds }).success).toBe(false);
    }
    expect(characterAuditScopeSchema.safeParse({ tenantId, characterIds: [characterId] }).success).toBe(false);
    expect(characterAuditScopeSchema.safeParse({ tenantId, ownerId, characterIds: [characterId], apply: true }).success).toBe(false);
  });

  it('reports missing binding as review only, without author content', () => {
    const result = inspectCharacterImport(character, [], []);
    expect(result).toMatchObject({ status: 'missing_bound_book', expectedEntries: 1, automaticRepairAllowed: false });
    expect(result.reviewFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_AUTHOR_TEXT');
  });

  it.each([
    [{}, 'no_embedded_source'],
    [{ character_book: { entries: [] } }, 'empty_embedded_source'],
    [{ character_book: { entries: [{ content: 42 }] } }, 'invalid_embedded_source'],
    [{ data: { character_book: embedded } }, 'nested_source_only'],
    [{ _squaretableImport: { version: 1, original: { data: { character_book: embedded } } } }, 'archive_source_only'],
    [{ character_book: embedded, data: { character_book: { entries: [] } } }, 'source_conflict'],
  ])('keeps absent, invalid and conflicting sources distinct: %s', (cardData, status) => {
    expect(inspectCharacterImport({ ...character, card_data: cardData }, [], []).status).toBe(status);
  });

  it('compares current source without restoring an older original archive', () => {
    const current = { ...character, card_data: { character_book: embedded, _squaretableImport: { version: 1, original: { character_book: { entries: [] } } } } };
    expect(inspectCharacterImport(current, [book], [entry])).toMatchObject({ status: 'matching_bound_book', originalArchived: true });
  });

  it('recognizes identical entry sets regardless of row order and JSON key order', () => {
    const source = { ...character, card_data: { character_book: { entries: [...embedded.entries, { keys: [], content: 'second', insertion_order: 8 }] } } };
    const second = { ...entry, id: 'entry-2', keyword: '', content: 'second', position: 8, settings: { ...entry.settings, keys: [], order: 8 } };
    const reordered = { ...entry, settings: Object.fromEntries(Object.entries(entry.settings).reverse()) };
    const first = inspectCharacterImport(source, [book], [entry, second]);
    const next = inspectCharacterImport(source, [book], [second, reordered]);
    expect(first.status).toBe('matching_bound_book');
    expect(next).toEqual(first);
  });

  it.each([
    { content: 'Edited' }, { position: 99 }, { is_enabled: false }, { priority: 1 },
    { settings: { ...entry.settings, probability: 25 } }, { recursive: false },
    { prevent_recursion: true }, { character_filter: [characterId] }, { scan_depth: 2 }, { context_percentage: 10 },
  ])('does not classify an edited runtime field as missing: %s', change => {
    const result = inspectCharacterImport(character, [book], [{ ...entry, ...change }]);
    expect(result.status).toBe('bound_content_differs');
    expect(result.reviewFingerprint).not.toBe(inspectCharacterImport(character, [book], [entry]).reviewFingerprint);
  });

  it('preserves duplicate multiplicity', () => {
    expect(inspectCharacterImport(character, [book], [entry, { ...entry, id: 'entry-2' }]).status).toBe('bound_content_differs');
    const doubled = { ...character, card_data: { character_book: { entries: [...embedded.entries, ...embedded.entries] } } };
    expect(inspectCharacterImport(doubled, [book], [entry]).status).toBe('bound_content_differs');
  });

  it('distinguishes extra, duplicate, disabled and incorrectly scoped bindings', () => {
    const second = { ...book, id: 'second' };
    expect(inspectCharacterImport(character, [book, second], [entry]).status).toBe('matching_with_additional_bindings');
    expect(inspectCharacterImport(character, [book, second], [entry, { ...entry, id: 'entry-2', worldbook_id: 'second' }]).status).toBe('multiple_matching_books');
    expect(inspectCharacterImport(character, [{ ...book, is_enabled: false }], [entry]).status).toBe('matching_book_inactive');
    expect(inspectCharacterImport(character, [{ ...book, scope: 'global' }], [entry]).status).toBe('matching_book_inactive');
    expect(inspectCharacterImport(character, [{ ...book, tenant_id: 'foreign' }], [entry]).status).toBe('binding_ownership_conflict');
    expect(inspectCharacterImport(character, [{ ...book, user_id: 'foreign' }], [entry]).status).toBe('binding_ownership_conflict');
  });

  it('changes the review fingerprint when source extensions or binding metadata change', () => {
    const before = inspectCharacterImport(character, [book], [entry]).reviewFingerprint;
    expect(inspectCharacterImport({ ...character, name: 'Renamed card' }, [book], [entry]).reviewFingerprint).not.toBe(before);
    expect(inspectCharacterImport({ ...character, card_data: { ...character.card_data, extensions: { changed: true } } }, [book], [entry]).reviewFingerprint).not.toBe(before);
    expect(inspectCharacterImport(character, [{ ...book, name: 'Renamed' }], [entry]).reviewFingerprint).not.toBe(before);
  });

  it('CLI rejects apply/empty scope, hides connection secrets and preserves existing reports', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'character-audit-test-'));
    const report = join(directory, 'report.json');
    const args = ['--tenant', tenantId, '--owner', ownerId, '--character', characterId, '--report', report];
    const invoke = (flags: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/character-import-audit.ts', ...flags], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, DATABASE_URL: 'postgres://test:PRIVATE_PASSWORD@127.0.0.1:1/unavailable' },
    });
    try {
      expect(invoke(['--help']).status).toBe(0);
      for (const flags of [[], [...args, '--apply'], args]) {
        const result = invoke(flags);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('CHARACTER_IMPORT_AUDIT_FAILED');
        expect(result.stderr).not.toContain('PRIVATE_PASSWORD');
      }
      await expect(readFile(report)).rejects.toMatchObject({ code: 'ENOENT' });
      await writeFile(report, 'existing');
      expect(invoke(args).status).toBe(1);
      expect(await readFile(report, 'utf8')).toBe('existing');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
