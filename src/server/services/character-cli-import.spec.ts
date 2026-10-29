import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { prepareImportFile, runImport } from '../../../scripts/import-cards';
import { cardV1, cardV3, formatCases } from '../../../scripts/fixtures/character-card-formats.mjs';

describe('CLI character import', () => {
  for (const fixture of formatCases()) {
    it(fixture.name, async () => {
      if (fixture.name === 'worldbook.json') expect((await prepareImportFile(fixture.bytes)).kind).toBe('worldbook');
      else if (fixture.code) await expect(prepareImportFile(fixture.bytes)).rejects.toThrow();
      else {
        const result = await prepareImportFile(fixture.bytes);
        expect(result.kind).toBe('character');
        if (result.kind === 'character') expect(result.input.cardData._squaretableImport).toMatchObject({ original: fixture.original });
      }
    });
  }

  it('counts readiness separately, preserves same-name variants, skips exact duplicate bytes and never follows links', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'card-cli-unit-'));
    try {
      await writeFile(join(directory, 'a.json'), JSON.stringify(cardV1));
      await writeFile(join(directory, 'b.json'), JSON.stringify(cardV1));
      await writeFile(join(directory, 'c.json'), JSON.stringify({ ...cardV1, first_mes: 'Different opening' }));
      await writeFile(join(directory, 'd.json'), JSON.stringify(cardV3));
      await writeFile(join(directory, 'book.json'), JSON.stringify({ name: 'Book', entries: [] }));
      await writeFile(join(directory, 'unknown.png'), 'PRIVATE_CONTENT_NOT_FOR_LOGGING');
      await symlink(join(directory, 'a.json'), join(directory, 'linked.json'));
      const result = await runImport({ directory, dryRun: true, includeWorldbooks: false });
      expect(result.summary).toEqual({ total: 7, ready: 3, imported: 0, failed: 1, duplicate: 1, skipped: 2 });
      expect(result.results.find(row => row.file === 'd.json')?.entries).toBe(1);
      expect(result.results.find(row => row.file === 'linked.json')?.code).toBe('NON_REGULAR_FILE');
      expect(JSON.stringify(result)).not.toContain('PRIVATE_CONTENT_NOT_FOR_LOGGING');
      const withBooks = await runImport({ directory, dryRun: true, includeWorldbooks: true });
      expect(withBooks.summary.ready).toBe(4);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('runs without a database, returns exit 2 on partial failure and refuses to overwrite reports or input files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'card-cli-process-'));
    const report = `${directory}.report.json`;
    const invoke = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-cards.ts', ...args], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, DATABASE_URL: 'postgres://unreachable:PRIVATE_CREDENTIAL@127.0.0.1:1/absent', DOTENV_CONFIG_PATH: '/dev/null', DOTENV_CONFIG_QUIET: 'true' },
    });
    try {
      await writeFile(join(directory, 'good.json'), JSON.stringify(cardV1));
      await writeFile(join(directory, 'bad.png'), 'private invalid source');
      const first = invoke(['--dir', directory, '--dry-run', '--report', report]);
      expect(first.status, first.stderr).toBe(2);
      const saved = await readFile(report, 'utf8');
      expect(JSON.parse(saved).summary).toMatchObject({ imported: 0, ready: 1, failed: 1 });
      expect(first.stdout + first.stderr).not.toContain('PRIVATE_CREDENTIAL');
      expect(invoke(['--dir', directory, '--dry-run', '--report', report]).status).toBe(1);
      expect(await readFile(report, 'utf8')).toBe(saved);
      expect(invoke(['--dir', directory, '--dry-run', '--report', join(directory, 'out.json')]).status).toBe(1);
      expect(invoke(['--dir', directory, '--dry-run', '--skip-worldbooks']).status).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(report, { force: true });
    }
  }, 30000);
});
