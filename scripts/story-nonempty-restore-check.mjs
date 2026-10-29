import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { storyRestoreFingerprintSql, assertNonemptyStoryCoverage, assertMatchingStoryRestore } from './story-restore-evidence.mjs';
import { withStoryDeletionSnapshot, applyStoryDeletions, replayStoryDeletions, preflightStoryDeletionRestore } from './story-deletion-replay.mjs';
import { captureDeletionJournal, replayDeletionJournal, preflightDeletionJournal, readPrivateJson, writePrivateJson } from './story-deletion-journal.mjs';

const execute = promisify(execFile);
const deletionCheck = process.argv.includes('--deletions');
const transferCheck = process.argv.includes('--transfer');
const ritualCheck = process.argv.includes('--ritual');
const openingModeCheck = process.argv.includes('--opening-modes');
assert.ok(!openingModeCheck || !deletionCheck, 'Run opening modes separately from deletion checks');
assert.ok(!ritualCheck || transferCheck, 'Ritual verification requires --transfer');
const memoryCheck = process.argv.includes('--memories') || transferCheck;
assert.ok(!(memoryCheck && deletionCheck), 'Run memory and deletion checks separately');
assert.ok(!(deletionCheck && process.argv.includes('--export')), 'Run export and deletion checks separately');
const identifier = randomUUID();
const containers = [`squaretable-story-restore-source-${identifier}`, `squaretable-story-restore-target-${identifier}`];
if (transferCheck) containers.push(`squaretable-story-transfer-target-${identifier}`);
const runtime = await mkdtemp(join(tmpdir(), 'squaretable-story-restore-'));
const evidence = `/tmp/squaretable-story-restore-evidence/${identifier}`;
await mkdir(evidence, { recursive: true, mode: 0o700 });
const log = await open(join(runtime, 'checks.log'), 'wx', 0o600);
const password = randomBytes(32).toString('hex');
const environment = {
  ...process.env, NODE_ENV: 'test', DOTENV_CONFIG_PATH: join(runtime, 'empty.env'),
  ...(ritualCheck ? { RITUAL_CARD_PATH: process.env.RITUAL_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/未分类/2025年3月前/kakaa.png' } : {}),
  JWT_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
  REDIS_URL: 'redis://127.0.0.1:1', STORY_RESTORE_FIXTURE: join(runtime, 'fixture.json'),
  STORY_RESTORE_BEHAVIOR: join(runtime, 'behavior.json'),
  STORY_OPENING_MODE_FIXTURE: join(runtime, 'opening-mode-fixture.json'), STORY_OPENING_MODE_BEHAVIOR: join(runtime, 'opening-mode-behavior.json'),
  STORY_EXPORT_BEHAVIOR: join(runtime, 'export-behavior.json'),
  STORY_MEMORY_FIXTURE: join(runtime, 'memory-fixture.json'), STORY_MEMORY_BEHAVIOR: join(runtime, 'memory-behavior.json'),
  STORY_TRANSFER_FIXTURE: join(runtime, 'transfer-fixture.json'), STORY_TRANSFER_BEHAVIOR: join(runtime, 'transfer-behavior.json'),
  STORY_TRANSFER_SOURCE_UPLOADS: join(runtime, 'source-uploads'), STORY_TRANSFER_TARGET_UPLOADS: join(runtime, 'target-uploads'),
};
const children = new Set();
const clients = [];
async function run(command, args, env = environment, input, output = log.fd) {
  const child = spawn(command, args, { env, detached: true, stdio: ['pipe', output, log.fd] });
  children.add(child);
  child.stdin.on('error', error => { if (error.code !== 'EPIPE') console.error('Restore subprocess input failed'); });
  child.stdin.end(input);
  const [code] = await once(child, 'exit');
  children.delete(child);
  assert.equal(code, 0, `${command} restore step failed; private diagnostics: ${evidence}`);
}
let cleaning;
async function cleanup() {
  return cleaning ??= (async () => {
    const running = [...children];
    const exited = running.map(child => once(child, 'exit'));
    for (const child of running) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await Promise.allSettled(exited);
    await Promise.allSettled(clients.map(client => client.end({ timeout: 1 })));
    for (const container of containers) await execute('docker', ['rm', '-f', '-v', container]).catch(() => {});
    await log.close();
    await rm(runtime, { recursive: true, force: true });
  })();
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });

async function startDatabase(container) {
  await run('docker', ['run', '--pull=never', '--rm', '-d', '--name', container, '-p', '127.0.0.1::5432', '--env-file', join(runtime, 'postgres.env'), 'pgvector/pgvector:pg15']);
  const deadline = Date.now() + 30000;
  while (true) {
    try { await execute('docker', ['exec', container, 'pg_isready', '-U', 'restore_check', '-d', 'squaretable_story_restore_test']); break; }
    catch { assert.ok(Date.now() < deadline, 'Disposable database startup timed out'); await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  const { stdout } = await execute('docker', ['port', container, '5432/tcp']);
  const match = stdout.trim().match(/^127\.0\.0\.1:(\d+)$/);
  assert.ok(match, 'Restore database must listen only on loopback');
  const url = `postgres://restore_check:${password}@127.0.0.1:${match[1]}/squaretable_story_restore_test`;
  const client = postgres(url, { max: 1 });
  clients.push(client);
  return { url, client };
}
const fingerprint = async client => (await client.unsafe(storyRestoreFingerprintSql))[0].fingerprint;
async function wholeDatabaseFingerprint(client) {
  const rows = await client`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const tables = rows.map(row => row.tablename);
  assert.ok(tables.every(table => /^[a-z_]+$/.test(table)));
  const entries = await client.unsafe(tables.map(table => `SELECT '${table}' AS name, count(*)::int AS count,
    md5(coalesce(string_agg(md5(to_jsonb(record)::text), '' ORDER BY md5(to_jsonb(record)::text)), '')) AS digest FROM public."${table}" record`).join(' UNION ALL '));
  return Array.from(entries);
}

try {
  await writeFile(join(runtime, 'empty.env'), '', { mode: 0o600 });
  await writeFile(join(runtime, 'postgres.env'), `POSTGRES_USER=restore_check\nPOSTGRES_DB=squaretable_story_restore_test\nPOSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
  await run(process.execPath, ['--test', 'scripts/story-restore-evidence.test.mjs']);
  if (deletionCheck) await run(process.execPath, ['--test', 'scripts/story-deletion-restore.test.mjs']);
  console.info('Creating isolated source/target databases and applying the full beta migrations');
  const source = await startDatabase(containers[0]);
  const target = await startDatabase(containers[1]);
  await run(process.execPath, ['--import', 'tsx', 'src/db/migrate.ts', '--beta'], { ...environment, DATABASE_URL: source.url });
  console.info('Creating nonempty story, event, note and source-linked memory fixtures through current services');
  await run(process.execPath, ['--import', 'tsx', 'scripts/story-restore-fixture.mjs', 'seed'], { ...environment, DATABASE_URL: source.url });
  if (openingModeCheck) await run(process.execPath, ['--import', 'tsx', 'scripts/story-opening-mode-restore-fixture.mjs', 'seed'], { ...environment, DATABASE_URL: source.url });
  if (transferCheck) await run(process.execPath, ['--import', 'tsx', 'scripts/story-transfer-fixture.mjs', 'seed'], { ...environment, DATABASE_URL: source.url });
  if (memoryCheck) await run(process.execPath, ['--import', 'tsx', 'scripts/story-memory-fixture.mjs', 'seed'], { ...environment, DATABASE_URL: source.url });
  const before = await fingerprint(source.client);
  const wholeDatabaseBefore = await wholeDatabaseFingerprint(source.client);
  assertNonemptyStoryCoverage(before);
  const dump = await open(join(runtime, 'story.dump'), 'wx', 0o600);
  try { await run('docker', ['exec', containers[0], 'pg_dump', '-U', 'restore_check', '-d', 'squaretable_story_restore_test', '-Fc'], environment, undefined, dump.fd); }
  finally { await dump.close(); }
  assertMatchingStoryRestore(before, await fingerprint(source.client));
  console.info('Restoring the full dump and comparing nonempty counts, vectors and source links');
  await run('docker', ['exec', '-i', containers[1], 'pg_restore', '-U', 'restore_check', '-d', 'squaretable_story_restore_test', '--no-owner', '--no-privileges', '--exit-on-error'], environment, await readFile(join(runtime, 'story.dump')));
  const restored = await fingerprint(target.client);
  assert.deepEqual(await wholeDatabaseFingerprint(target.client), wholeDatabaseBefore, 'All public tables must survive whole-database restore');
  assertMatchingStoryRestore(before, restored);
  const rollback = new Error('Expected corruption probe rollback');
  async function corruptionProbe(change, validate) {
    await assert.rejects(target.client.begin(async transaction => {
      await change(transaction);
      validate(await fingerprint(transaction));
      throw rollback;
    }), error => error === rollback);
    assertMatchingStoryRestore(before, await fingerprint(target.client));
  }
  const alteredEmbedding = JSON.stringify(Array.from({ length: 384 }, (_, index) => index === 1 ? 1 : 0));
  await corruptionProbe(transaction => transaction`UPDATE character_memory_vectors SET embedding = ${alteredEmbedding}::vector`, changed => {
    assert.throws(() => assertMatchingStoryRestore(before, changed), /must match/);
  });
  await corruptionProbe(transaction => transaction`UPDATE character_memories memory SET source_message_id = (SELECT id FROM messages WHERE chat_id <> memory.source_chat_id LIMIT 1)`, changed => {
    assert.throws(() => assertNonemptyStoryCoverage(changed), /Broken restore source links/);
  });
  let sourceExpected = before;
  let deletionReplay;
  if (deletionCheck) {
    console.info('Deleting stories after backup, then checking replay against the old restored copy');
    await run(process.execPath, ['--import', 'tsx', 'scripts/story-deletion-fixture.mjs', 'after-backup'], { ...environment, DATABASE_URL: source.url });
    sourceExpected = await fingerprint(source.client);
    const replayChecks = [];
    await preflightStoryDeletionRestore(source.client, target.client, 'squaretable_story_restore_test');
    await assert.rejects(() => preflightStoryDeletionRestore(source.client, source.client, 'squaretable_story_restore_test'), /must not overwrite/);
    replayChecks.push('Preflight identifies database clusters and refuses to overwrite the authoritative deletion source');
    await withStoryDeletionSnapshot(source.client, async snapshot => {
      await assert.rejects(() => applyStoryDeletions(target.client, { ...snapshot, lineageId: randomUUID() }), /same lineage/);
      assert.deepEqual(await fingerprint(target.client), restored);
      replayChecks.push('Unrelated database lineage is rejected without mutation');
      await assert.rejects(() => applyStoryDeletions(target.client, { ...snapshot, deletions: [] }), /missing deletion evidence/);
      assert.deepEqual(await fingerprint(target.client), restored);
      replayChecks.push('A source missing existing target deletion evidence is rejected');
      const fixture = JSON.parse(await readFile(environment.STORY_RESTORE_FIXTURE, 'utf8'));
      const tampered = structuredClone(snapshot);
      const mainReceipt = tampered.deletions.find(receipt => receipt.chatId === fixture.mainId);
      mainReceipt.creationRequests[0].payloadHash = 'b'.repeat(64);
      await assert.rejects(() => applyStoryDeletions(target.client, tampered), /payload conflict/);
      assert.deepEqual(await fingerprint(target.client), restored);
      replayChecks.push('A creation-request conflict rolls back deletion, receipts and reservations together');
      const wrongOwner = structuredClone(snapshot);
      wrongOwner.deletions.find(receipt => receipt.chatId === fixture.mainId).userId = randomUUID();
      await assert.rejects(() => applyStoryDeletions(target.client, wrongOwner), /owner conflict/);
      assert.deepEqual(await fingerprint(target.client), restored);
      replayChecks.push('Ownership conflicts reject the entire replay');
    });
    for (const [connection, lock] of [[source, 'LOCK TABLE chats IN ROW EXCLUSIVE MODE'], [target, 'LOCK TABLE chats IN ACCESS SHARE MODE']]) {
      const busy = postgres(connection.url, { max: 1 });
      try {
        await busy.begin(async transaction => {
          await transaction.unsafe(lock);
          await assert.rejects(() => replayStoryDeletions(source.client, target.client), error => error.code === '55P03');
        });
      } finally { await busy.end(); }
      assert.deepEqual(await fingerprint(target.client), restored);
    }
    replayChecks.push('Active source writers and active target readers prevent replay');
    const journal = await captureDeletionJournal(source.client);
    const journalPath = join(runtime, 'independent-deletions.json');
    await writePrivateJson(journalPath, journal);
    const independent = await readPrivateJson(journalPath);
    await assert.rejects(() => replayDeletionJournal(target.client, independent, 'untrusted'), /digest required/);
    await preflightDeletionJournal(target.client, independent, journal.sha256);
    deletionReplay = { ...await replayDeletionJournal(target.client, independent, journal.sha256), checks: replayChecks };
    replayChecks.push('Private independent deletion artifact replays later deletions into old backup without a source connection');
    const staleJournal = structuredClone(independent);
    staleJournal.snapshot.deletions = [];
    staleJournal.sha256 = createHash('sha256').update(JSON.stringify({ capturedAt: staleJournal.capturedAt, snapshot: staleJournal.snapshot })).digest('hex');
    await assert.rejects(() => preflightDeletionJournal(target.client, staleJournal, staleJournal.sha256), /missing current target deletion/);
    replayChecks.push('Preflight rejects a trusted but stale journal missing deletions already present in the target');
    const applied = await fingerprint(target.client);
    const repeated = await replayStoryDeletions(source.client, target.client);
    assert.equal(repeated.deletedStories, 0);
    assert.equal(repeated.restoredRequests, 0);
    assert.deepEqual(await fingerprint(target.client), applied);
    replayChecks.push('Repeating deletion replay is idempotent');
    await run(process.execPath, ['--import', 'tsx', 'scripts/story-deletion-fixture.mjs', 'verify'], { ...environment, DATABASE_URL: target.url });
  } else {
    console.info('Checking restored retrieval, action continuation, idempotency, deletion and late writes');
    await run(process.execPath, ['--import', 'tsx', 'scripts/story-restore-fixture.mjs', 'verify'], { ...environment, DATABASE_URL: target.url });
  }
  let storyExport;
  let openingModes;
  if (openingModeCheck) {
    await run(process.execPath, ['--import', 'tsx', 'scripts/story-opening-mode-restore-fixture.mjs', 'verify'], { ...environment, DATABASE_URL: target.url });
    openingModes = JSON.parse(await readFile(environment.STORY_OPENING_MODE_BEHAVIOR, 'utf8'));
  }
  let storyMemory;
  let storyTransfer;
  if (transferCheck) {
    console.info('Checking private single-story packages, reference remapping and restored knowledge on a fresh target');
    const transferTarget = await startDatabase(containers[2]);
    await run(process.execPath, ['--import', 'tsx', 'src/db/migrate.ts', '--beta'], { ...environment, DATABASE_URL: transferTarget.url });
    await run(process.execPath, ['--import', 'tsx', 'scripts/story-transfer-fixture.mjs', 'verify'], {
      ...environment, DATABASE_URL: transferTarget.url, STORY_TRANSFER_SOURCE_DATABASE_URL: source.url,
      STORY_TRANSFER_TARGET_CONTAINER: containers[2],
    });
    storyTransfer = JSON.parse(await readFile(environment.STORY_TRANSFER_BEHAVIOR, 'utf8'));
  }
  if (memoryCheck) {
    console.info('Checking durable memory jobs after restore with controlled extraction and embedding failures');
    await run(process.execPath, ['--import', 'tsx', 'scripts/story-memory-fixture.mjs', 'verify'], { ...environment, DATABASE_URL: target.url });
    storyMemory = JSON.parse(await readFile(environment.STORY_MEMORY_BEHAVIOR, 'utf8'));
  }
  if (process.argv.includes('--export')) {
    console.info('Checking long story exports, visibility, tenant isolation and concurrent snapshot consistency');
    await run(process.execPath, ['--import', 'tsx', 'scripts/story-export-fixture.mjs'], { ...environment, DATABASE_URL: target.url });
    storyExport = JSON.parse(await readFile(environment.STORY_EXPORT_BEHAVIOR, 'utf8'));
  }
  assert.deepEqual(await fingerprint(source.client), sourceExpected, 'Target checks must not mutate the source');
  const behavior = JSON.parse(await readFile(environment.STORY_RESTORE_BEHAVIOR, 'utf8'));
  const paths = ['scripts/story-nonempty-restore-check.mjs', 'scripts/story-restore-fixture.mjs', 'scripts/story-restore-evidence.mjs', 'scripts/story-restore-evidence.test.mjs', 'scripts/exploration-restore-check.mjs', 'src/server/services/chat-creation.service.ts', 'src/server/services/story-state.service.ts', 'src/server/services/story-identity.service.ts', 'src/server/services/story-content.service.ts', 'src/server/services/story-worldbooks.service.ts', 'src/db/repositories/memory.repository.ts', 'src/db/migrate.ts'];
  paths.push(...(await readdir('src/db/beta-migrations')).filter(name => name.endsWith('.sql')).sort().map(name => `src/db/beta-migrations/${name}`), 'src/db/beta-migrations/meta/_journal.json');
  if (storyExport) paths.push('scripts/story-export-fixture.mjs', 'src/server/services/story-export.service.ts', 'src/types/story-export.ts', 'src/server/routes/chats.ts', 'src/server/routes/chats.spec.ts');
  if (storyTransfer) paths.push('scripts/story-transfer.mjs', 'scripts/story-transfer-format.mjs', 'scripts/story-transfer-fixture.mjs', 'scripts/story-deletion-journal.mjs', 'scripts/story-deletion-races.mjs');
  paths.push('scripts/story-deletion-replay.mjs', 'src/db/migrations/0047_story_deletion_receipts.sql', 'src/db/schema/story-lifecycle.ts');
  if (deletionReplay) paths.push('scripts/story-deletion-fixture.mjs', 'scripts/restore-db.sh', 'scripts/story-deletion-restore.test.mjs', 'scripts/story-deletion-journal.mjs');
  if (storyMemory) paths.push('scripts/story-memory-fixture.mjs', 'scripts/story-memory-view-fixture.mjs',
    'scripts/story-summary-fixture.mjs', 'src/server/services/story-summary.service.ts', 'src/server/services/story-summary-context.ts',
    'src/server/services/story-memory-view.service.ts', 'src/types/story-memory.ts', 'src/server/services/story-memory-worker.service.ts',
    'scripts/story-memory-retry.mjs',
    'scripts/story-memory-backfill.mjs', 'scripts/story-memory-backfill-plan.mjs', 'scripts/story-memory-backfill.test.mjs', 'scripts/story-memory-backfill-fixture.mjs',
    'scripts/story-memory-large-history-fixture.mjs',
    'scripts/story-memory-longrun-fixture.mjs',
    'scripts/story-memory-continuity-fixture.mjs', 'src/server/services/story-memory-provenance.ts',
    'src/server/services/story-knowledge.service.ts', 'src/server/services/legacy-memory-access.service.ts',
    'src/server/services/story-memory-selection.ts',
    'src/server/services/story-memory-extraction.ts', 'src/server/jobs/story-memory.job.ts', 'src/server/jobs/index.ts',
    'src/db/schema/story-memory.ts', 'src/db/schema/memories.ts', 'src/db/migrations/0048_story_memory_jobs.sql',
    'src/server/services/embedding.service.ts', 'src/server/services/llm.service.ts', 'src/server/routes/websocket.ts');
  if (openingModes) paths.push('scripts/story-opening-mode-restore-fixture.mjs', 'src/server/services/story-opening-mode-adapter.ts', 'src/server/services/story-reviewed-source.ts', 'src/types/story-opening-mode.ts');
  const sources = await Promise.all(paths.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })));
  const report = {
    date: new Date().toISOString(), result: 'passed', database: 'two disposable PostgreSQL/pgvector containers with full beta migrations', ...(openingModes ? { openingModes } : {}),
    scope: 'whole-database dump/restore and current service/repository behavior; not HTTP/browser or model-quality validation',
    memoryFixture: 'synthetic memory and fixed nonzero vector, explicitly linked to a confirmed synthetic reply; no model or embedding provider called',
    fingerprints: restored, allPublicTables: wholeDatabaseBefore, guardTests: 14, corruptionProbes: ['changed vector with same row count rejected', 'wrong-story message provenance rejected'],
    sourceUnchangedAfterTargetDeletion: true, ...behavior, ...(storyTransfer ? { storyTransfer } : {}), ...(storyExport ? { storyExport } : {}), ...(storyMemory ? { storyMemory } : {}), ...(deletionReplay ? { deletionReplay, restoreScriptTests: 16 } : {}), sources,
  };
  await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  await writeFile('/tmp/squaretable-story-restore-evidence/latest.json', JSON.stringify({ evidence, checks: behavior.checks.length }, null, 2), { mode: 0o600 });
  console.info(`PASS: ${behavior.checks.length} ${deletionCheck ? 'deletion lifecycle' : 'restored-story behavior'} checks, 14 evidence guards, 2 corruption probes; ${evidence}`);
  if (deletionReplay) console.info(`PASS: ${deletionReplay.checks.length} deletion replay checks`);
  if (storyExport) console.info(`PASS: ${storyExport.checks.length} story export checks`);
  if (storyMemory) console.info(`PASS: ${storyMemory.checks.length} durable memory checks`);
  if (storyTransfer) console.info(`PASS: ${storyTransfer.checks.length} portable story checks`);
} catch (error) {
  await writeFile(`${evidence}/failure.log`, await readFile(join(runtime, 'checks.log')), { mode: 0o600 });
  console.error(`Restore checks failed; private diagnostics: ${evidence}`);
  throw error;
} finally {
  await cleanup();
}
