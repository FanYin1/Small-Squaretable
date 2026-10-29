import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'dotenv';
import postgres from 'postgres';
import { storyRestoreFingerprintSql, assertNonemptyStoryCoverage, assertMatchingStoryRestore } from './story-restore-evidence.mjs';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

const controlled = process.argv.length === 3 && process.argv[2] === '--controlled';
assert.ok(controlled || [4, 6].includes(process.argv.length), 'Use --controlled or --config <private env file> [--token-budget <tokens>]');
if (!controlled) assert.equal(process.argv[2], '--config');
const settings = controlled ? { CUSTOM_LLM_API_FORMAT: 'gemini', CUSTOM_LLM_API_KEY: 'synthetic-only',
  CUSTOM_LLM_BASE_URL: 'https://synthetic.invalid', CUSTOM_LLM_MODELS: 'controlled-memory-model' }
  : parse(await readFile(process.argv[3]));
if (!controlled) await requireEngineeringGateway(settings);
assert.equal(settings.CUSTOM_LLM_API_FORMAT, 'gemini');
if (process.argv.length === 6) assert.equal(process.argv[4], '--token-budget');
const tokenBudget = Number(process.argv[5] ?? settings.PLATFORM_DAILY_TOKEN_LIMIT ?? 100000);
assert.ok(Number.isSafeInteger(tokenBudget) && tokenBudget > 0 && tokenBudget <= 1000000, 'Token budget must be an integer from 1 to 1000000');
const identifier = randomUUID();
const evidence = `/tmp/squaretable-real-memory-evidence/${identifier}`;
await mkdir(evidence, { recursive: true, mode: 0o700 });
const runtime = await mkdtemp(join(tmpdir(), 'squaretable-real-memory-'));
const log = await open(join(evidence, 'private-checks.log'), 'wx', 0o600);
const containers = ['source', 'target', 'redis'].map(role => `squaretable-real-memory-${role}-${identifier}`);
const execute = promisify(execFile);
const password = randomBytes(32).toString('hex');
const environment = { ...process.env, NODE_ENV: 'test', DOTENV_CONFIG_PATH: join(runtime, 'empty.env'),
  REAL_MEMORY_CONTROLLED: String(controlled),
  JWT_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
  OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', OLLAMA_BASE_URL: '',
  CUSTOM_LLM_API_KEY: settings.CUSTOM_LLM_API_KEY, CUSTOM_LLM_BASE_URL: settings.CUSTOM_LLM_BASE_URL,
  CUSTOM_LLM_API_FORMAT: 'gemini', CUSTOM_LLM_MODELS: settings.CUSTOM_LLM_MODELS,
  CUSTOM_LLM_DEFAULT_MODEL: settings.CUSTOM_LLM_DEFAULT_MODEL || settings.CUSTOM_LLM_MODELS?.split(',')[0]?.trim(),
  PLATFORM_DAILY_TOKEN_LIMIT: String(tokenBudget), STORY_MEMORY_TIMEOUT_MS: '60000', STORY_MEMORY_JOBS_ENABLED: 'true',
  REAL_MEMORY_FIXTURE: join(runtime, 'fixture.json'), REAL_MEMORY_REPORT: join(evidence, 'synthetic-longrun.json') };
const children = new Set();
const clients = [];
async function run(command, args, env = environment, input, output = log.fd) {
  const child = spawn(command, args, { env, detached: true, stdio: ['pipe', output, log.fd] });
  children.add(child);
  child.stdin.on('error', () => {}); child.stdin.end(input);
  const [code] = await once(child, 'exit'); children.delete(child);
  assert.equal(code, 0, 'Isolated real-memory step failed');
}
async function port(container, internal) {
  const { stdout } = await execute('docker', ['port', container, `${internal}/tcp`]);
  const match = stdout.trim().match(/^127\.0\.0\.1:(\d+)$/);
  assert.ok(match, 'Disposable service must bind loopback');
  return match[1];
}
async function database(container) {
  await run('docker', ['run', '--pull=never', '--rm', '-d', '--name', container, '-p', '127.0.0.1::5432', '--env-file', join(runtime, 'postgres.env'), 'pgvector/pgvector:pg15']);
  const deadline = Date.now() + 30000;
  while (true) {
    try { await execute('docker', ['exec', container, 'pg_isready', '-U', 'real_memory_check', '-d', 'squaretable_real_memory_test']); break; }
    catch { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  const url = `postgres://real_memory_check:${password}@127.0.0.1:${await port(container, 5432)}/squaretable_real_memory_test`;
  const client = postgres(url, { max: 1 }); clients.push(client);
  return { url, client };
}
let cleaning;
const cleanup = () => cleaning ??= (async () => {
  for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  await Promise.allSettled(clients.map(client => client.end({ timeout: 1 })));
  for (const container of containers) await execute('docker', ['rm', '-f', '-v', container]).catch(() => {});
  await log.close(); await rm(runtime, { recursive: true, force: true });
})();
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
const report = { date: new Date().toISOString(), mode: controlled ? 'controlled' : 'real-provider',
  scope: `${controlled ? 'controlled provider (no paid calls)' : 'real model'} and local multilingual embeddings with production state, memory worker, context and provider services; no HTTP/WebSocket/browser acceptance`,
  model: environment.CUSTOM_LLM_DEFAULT_MODEL, embedding: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2, real 384-dimensional embeddings',
  limits: { providerCalls: 145, platformTokens: tokenBudget, perRequestTimeoutMs: 60000 }, taskClosed: false, sourceHashes: {} };
for (const file of ['scripts/story-memory-real-longrun.mjs', 'scripts/story-memory-real-longrun-fixture.mjs',
  'scripts/story-memory-controlled-provider.mjs', 'scripts/story-restore-evidence.mjs',
  'src/server/services/gemini-adapter.ts', 'src/server/services/llm.service.ts', 'src/server/config/llm.config.ts',
  'src/server/jobs/story-memory.job.ts', 'src/server/services/story-memory-extraction.ts',
  'src/server/services/story-memory-worker.service.ts', 'src/server/services/story-state.service.ts',
  'src/server/services/context-manager.service.ts', 'src/server/services/story-summary-context.ts',
  'src/server/services/story-summary.service.ts', 'src/db/repositories/memory.repository.ts']) {
  report.sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
}
console.info(`Real-memory evidence: ${evidence}`);
try {
  report.phase = 'initialize';
  await writeFile(join(runtime, 'empty.env'), '', { mode: 0o600 });
  await writeFile(join(runtime, 'postgres.env'), `POSTGRES_USER=real_memory_check\nPOSTGRES_DB=squaretable_real_memory_test\nPOSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
  const source = await database(containers[0]); const target = await database(containers[1]);
  await run('docker', ['run', '--pull=never', '--rm', '-d', '--name', containers[2], '-p', '127.0.0.1::6379', 'redis:7-alpine']);
  environment.REDIS_URL = `redis://127.0.0.1:${await port(containers[2], 6379)}`;
  await run(process.execPath, ['--import', 'tsx', 'src/db/migrate.ts', '--beta'], { ...environment, DATABASE_URL: source.url });
  report.phase = 'first-half';
  console.info(`Generating the parallel story and first 50 turns (${report.mode}).`);
  await run(process.execPath, ['--import', 'tsx', 'scripts/story-memory-real-longrun-fixture.mjs', 'seed'], { ...environment, DATABASE_URL: source.url });
  const before = (await source.client.unsafe(storyRestoreFingerprintSql))[0].fingerprint;
  report.phase = 'source-coverage';
  report.sourceFingerprint = before;
  assertNonemptyStoryCoverage(before);
  report.phase = 'dump-restore';
  const dump = await open(join(runtime, 'story.dump'), 'wx', 0o600);
  try { await run('docker', ['exec', containers[0], 'pg_dump', '-U', 'real_memory_check', '-d', 'squaretable_real_memory_test', '-Fc'], environment, undefined, dump.fd); }
  finally { await dump.close(); }
  await run('docker', ['exec', '-i', containers[1], 'pg_restore', '-U', 'real_memory_check', '-d', 'squaretable_real_memory_test', '--no-owner', '--no-privileges', '--exit-on-error'], environment, await readFile(join(runtime, 'story.dump')));
  report.phase = 'restore-coverage';
  report.restoredFingerprint = (await target.client.unsafe(storyRestoreFingerprintSql))[0].fingerprint;
  assertMatchingStoryRestore(before, report.restoredFingerprint);
  report.restoreFingerprintMatched = true;
  report.phase = 'second-half';
  console.info(`Restored the database; resuming checkpoint and generation in a new process through turn 100 (${report.mode}).`);
  await run(process.execPath, ['--import', 'tsx', 'scripts/story-memory-real-longrun-fixture.mjs', 'verify'], { ...environment, DATABASE_URL: target.url });
  report.result = controlled ? 'controlled_harness_passed_not_real_quality' : 'engineering_passed_semantic_review_required';
} catch (error) {
  report.result = 'failed'; process.exitCode = 1;
  report.error = error?.code === 'ERR_ASSERTION' ? 'ACCEPTANCE_ASSERTION_FAILED' : 'ISOLATED_STEP_FAILED';
  if (error?.code === 'ERR_ASSERTION') report.assertion = String(error.message).split('\n')[0].slice(0, 180);
} finally {
  try {
    const detail = JSON.parse(await readFile(environment.REAL_MEMORY_REPORT, 'utf8'));
    report.behavior = Object.fromEntries(Object.entries(detail).filter(([key]) => !['transcript', 'returnContext', 'memoryBatches'].includes(key)));
  } catch {}
  await cleanup();
  report.disposableServicesRemoved = true;
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.info(`Real-memory result: ${report.result}; report: ${evidence}/report.json`);
}
