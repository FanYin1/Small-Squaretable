import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { randomUUID, randomBytes } from 'node:crypto';
import { open, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storyRestoreFingerprintSql, assertNonemptyStoryCoverage, assertMatchingStoryRestore } from './story-restore-evidence.mjs';

const execute = promisify(execFile);
const identifier = randomUUID();
const target = `squaretable-restore-check-${identifier}`;
const source = 'squaretable-exploration-postgres-1';
const temporary = await mkdtemp(join(tmpdir(), 'squaretable-restore-'));
const backupPath = `backups/exploration/candidate-${identifier}.dump`;
async function run(args, input, output = 'ignore') {
  const child = spawn('docker', args, { stdio: ['pipe', output, 'pipe'] });
  child.stderr.resume(); child.stdin.end(input);
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, `Docker restore command failed: ${args[0]}`);
}
try {
  const before = JSON.parse((await execute('docker', ['exec', source, 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-Atc', storyRestoreFingerprintSql])).stdout);
  assertNonemptyStoryCoverage(before);
  const dump = await open(backupPath, 'wx', 0o600);
  try { await run(['exec', source, 'pg_dump', '-U', 'squaretable', '-d', 'squaretable_beta', '-Fc'], undefined, dump.fd); }
  finally { await dump.close(); }
  const environment = join(temporary, 'postgres.env');
  await writeFile(environment, `POSTGRES_USER=squaretable\nPOSTGRES_DB=squaretable_beta\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
  await run(['run', '--pull=never', '--rm', '-d', '--name', target, '--env-file', environment, 'pgvector/pgvector:pg15']);
  const deadline = Date.now() + 30000;
  while (true) {
    try { await execute('docker', ['exec', target, 'pg_isready', '-U', 'squaretable']); break; }
    catch { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  await run(['exec', '-i', target, 'pg_restore', '-U', 'squaretable', '-d', 'squaretable_beta', '--no-owner', '--no-privileges', '--exit-on-error'], await readFile(backupPath));
  const restored = JSON.parse((await execute('docker', ['exec', target, 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-Atc', storyRestoreFingerprintSql])).stdout);
  assertMatchingStoryRestore(before, restored);
  await writeFile('backups/exploration/restore-report.json', JSON.stringify({ date: new Date().toISOString(), result: 'passed', scope: 'nonempty data restore; continuation and deletion require separate checks', source, isolatedRestore: true, backupPath, fingerprints: restored }, null, 2), { mode: 0o600 });
  console.info('Candidate nonempty data restored; counts, vectors, source links and contents match.');
} finally {
  await execute('docker', ['rm', '-f', '-v', target]).catch(() => {});
  await rm(temporary, { recursive: true, force: true });
}
