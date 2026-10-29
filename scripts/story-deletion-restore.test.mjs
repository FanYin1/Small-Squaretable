import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

async function exercise(format, preflightCode, replayCode, dryRun = false, mode = 'live') {
  const directory = await mkdtemp(join(tmpdir(), 'squaretable-restore-script-test-'));
  try {
    const binaries = join(directory, 'bin');
    await mkdir(binaries);
    for (const command of ['psql', 'pg_restore', 'pg_isready']) {
      const content = command === 'pg_isready' ? '#!/bin/bash\nexit 0\n' : `#!/bin/bash\nprintf '%s\\n' '${command}' >> "$RESTORE_TEST_CALLS"\n${command === 'psql' ? 'cat >/dev/null\n' : ''}exit 0\n`;
      await writeFile(join(binaries, command), content, { mode: 0o700 });
    }
    await writeFile(join(binaries, 'node'), '#!/bin/bash\n[[ "$1" == *"$RESTORE_TEST_SCRIPT" ]] || exit 9\nprintf "%s\\n" "$2" >> "$RESTORE_TEST_CALLS"\nif [[ "$2" == "--preflight" ]]; then exit "$RESTORE_TEST_PREFLIGHT"; fi\nexit "$RESTORE_TEST_REPLAY"\n', { mode: 0o700 });
    const backup = join(directory, `synthetic.${format}`);
    const bytes = randomBytes(1024);
    await writeFile(backup, format === 'sql.gz' ? gzipSync(bytes) : bytes);
    const callsFile = join(directory, 'calls');
    await writeFile(callsFile, '');
    const result = spawnSync('bash', [resolve('scripts/restore-db.sh'), '--file', backup, '--force', ...(dryRun ? ['--dry-run'] : [])], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: `${binaries}:${process.env.PATH}`, BACKUP_DIR: directory, LOG_DIR: join(directory, 'logs'),
        POSTGRES_HOST: 'test-only.invalid', POSTGRES_PORT: '1', POSTGRES_DB: 'synthetic', POSTGRES_USER: 'synthetic', POSTGRES_PASSWORD: '',
        RESTORE_TEST_CALLS: callsFile, RESTORE_TEST_PREFLIGHT: String(preflightCode), RESTORE_TEST_REPLAY: String(replayCode), DRY_RUN: 'false',
        STORY_DELETION_SOURCE_DATABASE_URL: mode === 'live' ? 'postgres://synthetic@test-only.invalid/synthetic' : '',
        STORY_DELETION_JOURNAL: mode === 'journal' ? join(directory, 'synthetic-journal.json') : '',
        STORY_DELETION_JOURNAL_SHA256: mode === 'journal' ? 'a'.repeat(64) : '',
        RESTORE_TEST_SCRIPT: mode === 'journal' ? 'story-deletion-journal.mjs' : 'story-deletion-replay.mjs',
      },
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr, calls: (await readFile(callsFile, 'utf8')).trim().split('\n').filter(Boolean) };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

for (const mode of ['live', 'journal']) for (const format of ['dump', 'sql.gz']) {
  test(`${mode}/${format}: missing deletion preflight stops before any destructive restore command`, async () => {
    const result = await exercise(format, 1, 0, false, mode);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, ['--preflight']);
    assert.ok(!result.output.includes('Restore operation completed'));
  });
  test(`${mode}/${format}: failed deletion replay cannot report restore completion`, async () => {
    const result = await exercise(format, 0, 1, false, mode);
    assert.notEqual(result.status, 0);
    assert.equal(result.calls[0], '--preflight');
    assert.equal(result.calls.at(-1), '--offline-target');
    assert.ok(result.calls.includes('psql'));
    assert.ok(!result.output.includes('Restore operation completed'));
  });
  test(`${mode}/${format}: successful restore includes preflight and deletion replay in order`, async () => {
    const result = await exercise(format, 0, 0, false, mode);
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(result.calls, ['--preflight', 'psql', 'psql', format === 'dump' ? 'pg_restore' : 'psql', '--offline-target']);
    assert.ok(result.output.includes('Restore operation completed'));
  });
  test(`${mode}/${format}: dry run never executes restoration or deletion replay`, async () => {
    const result = await exercise(format, 1, 1, true, mode);
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(result.calls, []);
  });
}
