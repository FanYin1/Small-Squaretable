import { describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { legacyRequestSchema, prepareLegacyExternalSource, applyCharacterLegacy } from './character-legacy-reconciliation';

const scope = { tenantId: 'a0000000-0000-4000-8000-000000000001', ownerId: 'b0000000-0000-4000-8000-000000000002', characterId: 'c0000000-0000-4000-8000-000000000003' };
const bookId = 'd0000000-0000-4000-8000-000000000004';
const request = { ...scope, source: { kind: 'current' }, bindings: [] };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe('explicit legacy source reconciliation', () => {
  it('requires one scope, an explicit source and unique complete binding decisions', () => {
    expect(legacyRequestSchema.parse({ ...request, characterId: scope.characterId.toUpperCase() })).toEqual(request);
    for (const changed of [{ force: true }, { ownerId: undefined }, { characterId: '*' }, { source: { kind: 'guess' } },
      { source: { kind: 'bound' } }, { source: { kind: 'archive', bookId } },
      { bindings: [{ bookId, action: 'delete' }] }, { bindings: [{ bookId, action: 'keep' }, { bookId, action: 'detach' }] }]) {
      expect(legacyRequestSchema.safeParse({ ...request, ...changed }).success).toBe(false);
    }
  });
  it('normalizes binding order and UUID case for a stable reviewed request', () => {
    const lower = { bookId: scope.characterId, action: 'keep' };
    const upper = { bookId: bookId.toUpperCase(), action: 'detach' };
    expect(legacyRequestSchema.parse({ ...request, bindings: [upper, lower] }).bindings).toEqual([lower, { ...upper, bookId }]);
  });
  it('imports a supplied card book using the shared mapper without executing unknown extensions', async () => {
    const prepared = await prepareLegacyExternalSource(bytes({ spec: 'chara_card_v2', spec_version: '2.0', data: {
      name: 'Synthetic', first_mes: 'Synthetic opening', extensions: { script: 'throw Error("not executed")' },
      character_book: { entries: [{ keys: ['gate'], content: 'PRIVATE_CONTENT', recursive: false, extensions: { position: 4, depth: 3, role: 2 } }] },
    } }));
    expect(prepared.entries[0]).toMatchObject({ recursive: false, settings: { position: 'atDepth', depth: 3, role: 2 } });
    expect(prepared.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('supports a standalone original file with stable numeric entry order and disabled entries', async () => {
    const prepared = await prepareLegacyExternalSource(bytes({ name: 'Standalone', entries: {
      '9': { key: ['later'], content: 'Later', disable: true }, '2': { key: ['first'], content: 'First' },
    } }));
    expect(prepared.entries.map(entry => entry.content)).toEqual(['First', 'Later']);
    expect(prepared.entries[1].isEnabled).toBe(false);
  });
  it.each([null, [], {}, { entries: [] }, { entries: [{ content: 'Bad', keys: ['a'.repeat(256)] }] }, { name: 'No book', first_mes: 'Opening' }])('refuses missing or invalid sources without fabricating a book: %j', async value => {
    await expect(prepareLegacyExternalSource(bytes(value))).rejects.toMatchObject({ code: expect.stringMatching(/^LEGACY_SOURCE_/) });
  });
  it('binds the fingerprint to original file bytes, including preserved unknown metadata', async () => {
    const original = { entries: [{ content: 'Shared' }], unknown: 'first' };
    const first = await prepareLegacyExternalSource(bytes(original));
    const second = await prepareLegacyExternalSource(bytes({ ...original, unknown: 'second' }));
    expect(first.entries).toEqual(second.entries);
    expect(first.sha256).not.toBe(second.sha256);
  });
  it('rejects a tampered preview before opening a write transaction', async () => {
    const begin = vi.fn();
    await expect(applyCharacterLegacy({ begin } as unknown as Sql, {
      version: 'character-legacy-v1', request: legacyRequestSchema.parse(request),
      auditFingerprint: 'a'.repeat(64), sourceFingerprint: 'b'.repeat(64), entryCount: 1,
      operation: 'copy_source', bindings: [], fingerprint: 'c'.repeat(64),
    }, 'c'.repeat(64))).rejects.toMatchObject({ code: 'LEGACY_PLAN_INVALID' });
    expect(begin).not.toHaveBeenCalled();
  });
  it('CLI refuses ambiguous arguments, source symlinks and output collisions without disclosing secrets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'legacy-cli-'));
    const requestFile = join(directory, 'request.json');
    const report = join(directory, 'report.json');
    const target = join(directory, 'target.json');
    const invoke = (flags: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/character-legacy-reconcile.ts', ...flags], {
      encoding: 'utf8', timeout: 15000, env: { ...process.env, DATABASE_URL: 'postgres://user:PRIVATE_PASSWORD@127.0.0.1:1/unavailable' },
    });
    try {
      await writeFile(requestFile, JSON.stringify(request));
      await writeFile(target, 'PRIVATE_ORIGINAL');
      await symlink(target, report);
      expect(invoke(['--help']).status).toBe(0);
      const flags = ['--mode', 'plan', '--request', requestFile, '--report', report];
      for (const args of [[], flags, [...flags, '--mode', 'apply'], [...flags, '--source-file', target], ['--mode', 'plan', '--request', report, '--report', `${report}-new`]]) {
        const result = invoke(args);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).not.toContain('PRIVATE_');
        expect(result.stderr).not.toContain(directory);
      }
      expect(await readFile(target, 'utf8')).toBe('PRIVATE_ORIGINAL');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
