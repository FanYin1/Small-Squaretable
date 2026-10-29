import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import postgres from 'postgres';

const runtime = await mkdtemp(join(tmpdir(), 'squaretable-entry-runtime-'));
const identifier = randomUUID();
const containers = [`squaretable-entry-db-${identifier}`, `squaretable-entry-cache-${identifier}`];
const password = randomBytes(32).toString('hex');
const databaseUrl = `postgres://entry_check:${password}@127.0.0.1:55448/squaretable_beta_test`;
const log = await open('/tmp/squaretable-entry-integration.log', 'w', 0o600);
const recoveryOnly = process.argv.includes('--recovery');
const effectsOnly = process.argv.includes('--state-effects');
const intentOnly = process.argv.includes('--intent');
const contextOnly = process.argv.includes('--context');
const memoryOnly = process.argv.includes('--memory');
const journeysOnly = process.argv.includes('--journeys');
const libraryOnly = process.argv.includes('--library') || journeysOnly;
const bindingsOnly = process.argv.includes('--bindings');
const csrfOnly = process.argv.includes('--csrf');
const creatorOnly = process.argv.includes('--creator');
const legacyOnly = process.argv.includes('--legacy');
const openingOnly = process.argv.includes('--openings');
const accountOnly = process.argv.includes('--account');
const overviewOnly = process.argv.includes('--overview');
const transactionsOnly = process.argv.includes('--transactions');
const correctionsOnly = process.argv.includes('--corrections') || transactionsOnly;
const adapterOnly = process.argv.includes('--adapter');
const pagesOnly = process.argv.includes('--pages');
assert.ok([pagesOnly, adapterOnly, correctionsOnly, intentOnly, recoveryOnly, effectsOnly, contextOnly, memoryOnly, libraryOnly, bindingsOnly, csrfOnly, creatorOnly, legacyOnly, openingOnly, accountOnly, overviewOnly].filter(Boolean).length <= 1, 'Choose one focused integration check');
const environment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  REDIS_URL: 'redis://127.0.0.1:55449',
  DOTENV_CONFIG_PATH: join(runtime, 'empty.env'),
  BETA_SMOKE_PORT: '55441',
  BETA_SMOKE_IMAGE: '',
  BETA_SMOKE_BROWSER: pagesOnly || adapterOnly || correctionsOnly || overviewOnly || accountOnly || openingOnly || intentOnly || effectsOnly || recoveryOnly || contextOnly || memoryOnly || libraryOnly || bindingsOnly || csrfOnly || creatorOnly || legacyOnly ? '0' : '1',
  EXP02_CHECK: pagesOnly ? '1' : '0',
  STORY_ADAPTER_CHECK: adapterOnly ? '1' : '0',
  STORY_RECOMMENDATIONS_CHECK: process.env.STORY_RECOMMENDATIONS_CHECK === '1' ? '1' : '0',
  STORY_CORRECTIONS_CHECK: correctionsOnly ? '1' : '0',
  STORY_TRANSACTIONS_ONLY: transactionsOnly ? '1' : '0',
  STORY_OVERVIEW_CHECK: overviewOnly ? '1' : '0',
  ACCOUNT_ACTIVITY_CHECK: accountOnly ? '1' : '0',
  STORY_OPENING_CHECK: openingOnly || process.env.STORY_OPENING_CHECK === '1' ? '1' : '0',
  CHARACTER_LEGACY_CHECK: legacyOnly ? '1' : '0',
  CREATOR_ACCOUNT_CHECK: creatorOnly ? '1' : '0',
  STORY_INTENT_CHECK: intentOnly ? '1' : '0',
  STORY_EFFECTS_CHECK: effectsOnly || intentOnly ? '1' : '0',
  CSRF_SESSION_CHECK: csrfOnly ? '1' : '0',
  CHARACTER_LIBRARY_CHECK: libraryOnly ? '1' : '0',
  CHARACTER_JOURNEYS_ONLY: journeysOnly ? '1' : '0',
  CHARACTER_BINDINGS_CHECK: bindingsOnly ? '1' : '0',
  EXPLORATION_CONTEXT_ONLY: contextOnly ? '1' : '0',
  EXPLORATION_MEMORY_ONLY: memoryOnly ? '1' : '0',
  EXPLORATION_ENTRY_CHECK: pagesOnly || adapterOnly || correctionsOnly || overviewOnly || accountOnly || openingOnly || intentOnly || effectsOnly || libraryOnly || bindingsOnly || csrfOnly || creatorOnly || legacyOnly ? '0' : '1',
  EXPLORATION_RECOVERY_ONLY: recoveryOnly ? '1' : '0',
  EXPLORATION_DEMO_PORT: '55442',
};
const children = new Set();
const processGroups = new Set();
function start(command, args, env = environment) {
  const child = spawn(command, args, { env, detached: true, stdio: ['ignore', log.fd, log.fd] });
  children.add(child);
  if (child.pid) processGroups.add(child.pid);
  child.once('exit', () => {
    children.delete(child);
    if (!child.pid) return;
    try { process.kill(-child.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') processGroups.delete(child.pid); }
  });
  return child;
}
async function run(command, args, env) {
  const child = start(command, args, env);
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, `${command} failed; inspect the private integration log`);
}
let cleaning;
function cleanup() {
  return cleaning ??= (async () => {
    const running = [...children];
    const exited = running.map(child => once(child, 'exit'));
    for (const group of processGroups) {
      try { process.kill(-group, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await Promise.allSettled(exited);
    for (const name of containers) {
      const child = spawn('docker', ['rm', '-f', '-v', name], { stdio: 'ignore' });
      await once(child, 'exit');
    }
    await rm(runtime, { recursive: true, force: true });
    await log.close();
  })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });

try {
  for (const port of [55441, 55442, 55448, 55449]) {
    const probe = createServer();
    probe.listen(port, '127.0.0.1');
    await once(probe, 'listening');
    await new Promise(resolve => probe.close(resolve));
  }
  await writeFile(join(runtime, 'empty.env'), '', { mode: 0o600 });
  await writeFile(join(runtime, 'postgres.env'), `POSTGRES_USER=entry_check\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=squaretable_beta_test\n`, { mode: 0o600 });
  console.info('Building current server/client and checking the saved prototype reference');
  await run(process.execPath, ['scripts/check-exploration-baseline.mjs', '--compare-current']);
  await run('npm', ['run', 'build:server']);
  await run('npm', ['run', 'build:client'], { ...environment, NODE_ENV: 'production' });
  console.info('Starting disposable PostgreSQL/Redis on loopback ports 55448/55449');
  await run('docker', ['run', '--pull=never', '--rm', '-d', '--name', containers[0], '-p', '127.0.0.1:55448:5432', '--env-file', join(runtime, 'postgres.env'), 'pgvector/pgvector:pg15']);
  await run('docker', ['run', '--pull=never', '--rm', '-d', '--name', containers[1], '-p', '127.0.0.1:55449:6379', 'redis:7-alpine']);
  const deadline = Date.now() + 30000;
  while (true) {
    const client = postgres(databaseUrl, { max: 1, connect_timeout: 1 });
    try {
      await client`SELECT 1`;
      break;
    } catch {
      assert.ok(Date.now() < deadline, 'Disposable database did not become ready');
      await new Promise(resolve => setTimeout(resolve, 250));
    } finally {
      await client.end({ timeout: 1 });
    }
  }
  await run('docker', ['exec', containers[1], 'redis-cli', 'ping']);
  if (pagesOnly || journeysOnly || overviewOnly || adapterOnly && (process.env.STORY_RECOMMENDATIONS_CHECK === '1' || process.env.STORY_FIRST_TASK_CHECK === '1' || process.env.STORY_FIRST_TASK_GAMEPLAY_CHECK === '1' || process.env.STORY_OPENING_MODE_GAMEPLAY_CHECK === '1')) {
    console.info('Focused single-player check: group creation/concurrency and group diagnostics are outside this run');
  } else {
    const admin = postgres(databaseUrl, { max: 1 });
    try { await admin.unsafe('CREATE DATABASE chat_creation_test'); } finally { await admin.end(); }
    const concurrencyUrl = new URL(databaseUrl);
    concurrencyUrl.pathname = '/chat_creation_test';
    await run(process.execPath, ['--import', 'tsx', 'scripts/chat-creation-concurrency-check.ts'], {
      ...environment, DATABASE_URL: concurrencyUrl.toString(),
      JWT_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    });
  }
  await run(process.execPath, ['dist/server/migrate.js', '--beta']);
  const reference = start(process.execPath, ['scripts/exploration-demo-server.mjs']);
  const referenceDeadline = Date.now() + 10000;
  while (true) {
    try {
      assert.equal((await fetch('http://127.0.0.1:55442/', { signal: AbortSignal.timeout(1000) })).status, 200);
      assert.equal(reference.exitCode, null);
      break;
    } catch {
      assert.ok(reference.exitCode === null && Date.now() < referenceDeadline, 'Reference server did not become ready');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  console.info(journeysOnly ? 'Running focused single-player journeys and reading recovery with controlled generation' : overviewOnly ? 'Running isolated overview/source/failure/layout checks and baseline smoke' : accountOnly ? 'Running real database/API/browser account activity checks and baseline smoke' : legacyOnly ? 'Running real CLI/database legacy reconciliation and recovery checks' : creatorOnly ? 'Running real API/browser creator and account checks' : intentOnly ? 'Running real database/API/browser intent and knowledge checks' : effectsOnly ? 'Running real database/API/browser legacy effects and group failure checks' : csrfOnly ? 'Running real Redis/API/browser CSRF session isolation checks' : bindingsOnly ? 'Running real author binding UI, ownership/concurrency and frozen story checks' : libraryOnly ? 'Running real API/database card imports, frozen bindings and controlled generation' : memoryOnly ? 'Running real API/browser memory progress and source checks' : contextOnly ? 'Running real API/browser context capacity and input recovery checks' : recoveryOnly ? 'Running real API/browser generation, reconnect and conflict recovery' : 'Running real API/browser entry, generation/recovery and prototype comparison');
  await run(process.execPath, [...(pagesOnly || environment.STORY_OPENING_CHECK === '1' ? ['--import', 'tsx'] : []), 'scripts/beta-smoke-check.mjs']);
  if (pagesOnly) console.info('PASS: EXP-02 consolidated single-player checks; evidence in /tmp/squaretable-exp02-evidence');
  if (transactionsOnly) console.info('PASS: isolated single-player transaction checks; evidence in /tmp/squaretable-transaction-evidence');
  else if (correctionsOnly) console.info('PASS: isolated corrections checks; evidence in /tmp/squaretable-corrections-evidence');
  if (adapterOnly) console.info('PASS: isolated adapter workflow; evidence in /tmp/squaretable-adapter-evidence');
  if (!pagesOnly && !correctionsOnly && !adapterOnly) {
  if (openingOnly) console.info('Opening preparation evidence: /tmp/squaretable-opening-evidence');
  if (overviewOnly) console.info('PASS: isolated overview checks; evidence in /tmp/squaretable-overview-evidence');
  if (accountOnly) console.info('Account activity evidence: /tmp/squaretable-account-evidence');
  if (!overviewOnly) console.info(journeysOnly ? 'PASS: focused single-player journeys and reading recovery; evidence in /tmp/squaretable-card-library-evidence (not full library regression)' : accountOnly ? 'PASS: isolated account activity checks and baseline smoke; evidence in /tmp/squaretable-account-evidence' : legacyOnly ? 'PASS: isolated legacy reconciliation; evidence in /tmp/squaretable-character-legacy' : creatorOnly ? 'PASS: isolated creator/account checks; evidence in /tmp/squaretable-creator-account-evidence' : intentOnly ? 'PASS: focused intent/knowledge suite; evidence in /tmp/squaretable-story-intent' : effectsOnly ? 'PASS: state effects and group recovery; evidence in /tmp/squaretable-story-effects' : csrfOnly ? 'PASS: CSRF session isolation; evidence in /tmp/squaretable-csrf-session-evidence' : bindingsOnly ? 'PASS: isolated binding UI integration; evidence in /tmp/squaretable-worldbook-bindings-evidence' : libraryOnly ? 'PASS: isolated card library integration; evidence in /tmp/squaretable-card-library-evidence' : memoryOnly ? 'PASS: isolated memory UI integration; evidence in /tmp/squaretable-memory-ui-evidence' : contextOnly ? 'PASS: isolated context integration; evidence in /tmp/squaretable-context-evidence' : recoveryOnly ? 'PASS: isolated recovery integration; evidence in /tmp/squaretable-recovery-evidence' : 'PASS: isolated entry and recovery integration; evidence in /tmp/squaretable-entry-integration-evidence and /tmp/squaretable-recovery-evidence');
  }
} finally {
  await cleanup();
}
