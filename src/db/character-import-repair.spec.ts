import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { characterRepairSchema } from './character-import-repair';

const scope = { tenantId: 'a0000000-0000-4000-8000-000000000001', ownerId: 'b0000000-0000-4000-8000-000000000002',
  characterId: 'c0000000-0000-4000-8000-000000000003', expectedReview: 'a'.repeat(64) };

describe('explicit historical import repair', () => {
  it('requires one exact owner/tenant/character and a full review fingerprint', () => {
    expect(characterRepairSchema.parse({ ...scope, characterId: scope.characterId.toUpperCase() })).toEqual(scope);
    for (const replacement of [{ tenantId: '' }, { ownerId: undefined }, { characterId: '*' }, { expectedReview: 'a'.repeat(63) },
      { expectedReview: 'g'.repeat(64) }, { force: true }, { characterIds: [scope.characterId] }]) {
      expect(characterRepairSchema.safeParse({ ...scope, ...replacement }).success).toBe(false);
    }
  });

  it('ships identical normal and beta receipt migrations', async () => {
    expect(await readFile('src/db/migrations/0049_character_import_repairs.sql', 'utf8'))
      .toBe(await readFile('src/db/beta-migrations/0009_character_import_repairs.sql', 'utf8'));
  });

  it('CLI requires explicit apply, rejects duplicate targets, protects report files and sanitizes failures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'character-repair-test-'));
    const report = join(directory, 'report.json');
    const target = join(directory, 'existing.json');
    const args = ['--tenant', scope.tenantId, '--owner', scope.ownerId, '--character', scope.characterId, '--expected-review', scope.expectedReview, '--report', report];
    const invoke = (flags: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/character-import-repair.ts', ...flags], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, DATABASE_URL: 'postgres://test:PRIVATE_REPAIR_PASSWORD@127.0.0.1:1/unavailable' },
    });
    try {
      expect(invoke(['--help']).status).toBe(0);
      for (const flags of [[], args, [...args, '--apply', '--character', scope.characterId], [...args, '--apply']]) {
        const result = invoke(flags);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(JSON.parse(result.stderr).code).toBe('CHARACTER_IMPORT_REPAIR_FAILED');
        expect(result.stderr).not.toContain('PRIVATE_REPAIR_PASSWORD');
      }
      await expect(readFile(report)).rejects.toMatchObject({ code: 'ENOENT' });
      await writeFile(target, 'existing');
      await symlink(target, report);
      expect(invoke([...args, '--apply']).status).toBe(1);
      expect(await readFile(target, 'utf8')).toBe('existing');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
