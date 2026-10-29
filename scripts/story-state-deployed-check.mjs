import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { stateClosureRules } from './story-state-closure-check.mjs';
import { checkStoryStateSource } from './story-state-source-check.mjs';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const evidence = `/tmp/squaretable-state-deployed-${randomUUID()}`;
await mkdir(evidence, { recursive: true, mode: 0o700 });
const credentials = JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8'));
let remaining = 100;
let reset = 0;
function observeBudget(headers) {
  if (Number(headers['x-ratelimit-limit']) !== 100) return;
  const nextReset = Number(headers['x-ratelimit-reset']);
  const nextRemaining = Number(headers['x-ratelimit-remaining']);
  remaining = nextReset > reset + 2000 ? nextRemaining : Math.min(remaining, nextRemaining);
  reset = Math.max(reset, nextReset);
}
async function waitBudget() {
  if (remaining >= 60) return;
  console.info('Waiting for normal candidate API rate limit');
  while (Date.now() < reset + 1100) await new Promise(resolve => setTimeout(resolve, 1000));
  remaining = 100;
}
const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
observeBudget(Object.fromEntries(login.headers));
const auth = (await login.json()).data;
let csrf;
async function api(path, body) {
  await waitBudget();
  const response = await fetch(`${base}/api/v1${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId,
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  observeBudget(Object.fromEntries(response.headers));
  assert.ok(response.ok, `${path}: ${response.status}`);
  const result = await response.json();
  return result.data ?? result;
}
csrf = (await api('/csrf-token')).csrfToken;
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const artifactPath = 'backups/exploration/acceptance-04ab-safe.json';
let artifacts;
try { artifacts = JSON.parse(await readFile(artifactPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!artifacts) {
  const card = await api('/characters', { name: '04AB验收 · 状态依据', cardData: { first_mes: '', extensions: { squaretable: { exploration: stateClosureRules } } } });
  const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
  await query(`DO $$ DECLARE turn_number integer; input_id bigint; reply_id bigint; event_id uuid; BEGIN
    PERFORM chat_id FROM story_states WHERE chat_id=${literal(story.id)} FOR UPDATE;
    FOR turn_number IN 1..35 LOOP
      INSERT INTO messages(chat_id,role,content) VALUES (${literal(story.id)},'user',CASE WHEN turn_number=1 THEN '支付20枚' ELSE '停留观察' END) RETURNING id INTO input_id;
      INSERT INTO messages(chat_id,role,content,extra) VALUES (${literal(story.id)},'assistant',CASE WHEN turn_number=1 THEN '预写来源验收：已支付20枚，剩余80枚。' ELSE '预写来源验收：仍在原地。' END,
        jsonb_build_object('storyVersion',turn_number,'stateStatus','confirmed','storyRequestId','prewritten-state-'||turn_number)) RETURNING id INTO reply_id;
      INSERT INTO story_events(chat_id,request_id,version,action_id,action_label,outcome,status,input_message_id,message_id,changes,excerpt)
        VALUES (${literal(story.id)},'prewritten-state-'||turn_number,turn_number,CASE WHEN turn_number=1 THEN 'pay' ELSE 'wait' END,
          CASE WHEN turn_number=1 THEN '支付20枚' ELSE '停留观察' END,CASE WHEN turn_number=1 THEN '支付了20枚，钱款剩80枚。' ELSE '仍在原地。' END,
          'confirmed',input_id,reply_id,CASE WHEN turn_number=1 THEN '{"coins":{"before":100,"after":80}}'::jsonb ELSE '{}'::jsonb END,'明确预写的状态依据验收') RETURNING id INTO event_id;
      UPDATE story_states SET version=turn_number,"values"=jsonb_set("values",'{coins}','80'),completed_actions='["pay","wait"]'::jsonb,
        sources=CASE WHEN turn_number=1 THEN jsonb_build_object('coins',event_id) ELSE sources END WHERE chat_id=${literal(story.id)};
    END LOOP;
    UPDATE story_memory_jobs SET available_at='2099-01-01T00:00:00Z' WHERE chat_id=${literal(story.id)};
  END $$;`);
  artifacts = { cardId: card.id, storyId: story.id, sourceEventId: await query(`SELECT id FROM story_events WHERE chat_id=${literal(story.id)} AND version=1`) };
  await writeFile(artifactPath, JSON.stringify(artifacts, null, 2), { mode: 0o600, flag: 'wx' });
}
const fixtureJobs = async () => JSON.parse(await query(`SELECT json_build_object('count',count(*),'attempts',coalesce(sum(attempts),0),'due',count(*) FILTER (WHERE available_at <= now())) FROM story_memory_jobs WHERE chat_id=${literal(artifacts.storyId)}`));
assert.deepEqual(await fixtureJobs(), { count: 7, attempts: 0, due: 0 }, 'Synthetic memory jobs must be deferred in their creation transaction');
const requestCount = () => query(`SELECT count(*) FROM generation_requests WHERE chat_id=${literal(artifacts.storyId)}`);
const beforeCount = await requestCount();
const before = await api(`/chats/${artifacts.storyId}/story-state`);
const browser = await chromium.launch({ headless: true });
const checks = [];
const errors = [];
try {
  const context = await browser.newContext();
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken); localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId); localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  const page = await context.newPage();
  const legacyMemoryRequests = [];
  page.on('request', request => {
    if (/\/characters\/[^/]+\/intelligence\/memories/.test(new URL(request.url()).pathname)) legacyMemoryRequests.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => observeBudget(response.headers()));
  await checkStoryStateSource({ page, base, api, ...artifacts, sourceMessage: '预写来源验收：已支付20枚，剩余80枚。', checks, evidence, waitBudget });
  await waitBudget();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.reading-settings summary').click();
  await page.locator('.tools-btn').click();
  await page.getByRole('menuitem', { name: '角色记忆', exact: true }).click();
  const memoryDrawer = page.locator('.intelligence-drawer');
  await expect(memoryDrawer.locator('.memory-status')).toBeVisible();
  await expect(memoryDrawer.locator('.memory-status')).toHaveAttribute('aria-busy', 'false');
  await expect(memoryDrawer.locator('[role="alert"]')).toHaveCount(0);
  await expect(memoryDrawer.locator('.memory-panel')).toHaveCount(0);
  assert.deepEqual(legacyMemoryRequests, []);
  await page.screenshot({ path: `${evidence}/story-memory-drawer.png`, fullPage: true, animations: 'disabled' });
  checks.push({ case: 'actual story memory tool reads scoped progress without legacy memory requests or errors', result: 'passed' });
  await execute('docker', ['restart', 'squaretable-exploration-app-1']);
  const deadline = Date.now() + 30000;
  while (true) {
    try { assert.equal((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) })).status, 200); break; }
    catch { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  assert.deepEqual(await api(`/chats/${artifacts.storyId}/story-state`), before);
  const source = await api(`/chats/${artifacts.storyId}/story-events/${artifacts.sourceEventId}`);
  assert.equal(source.version, 1);
  assert.equal(await requestCount(), beforeCount);
  assert.deepEqual(await fixtureJobs(), { count: 7, attempts: 0, due: 0 });
  checks.push({ case: 'actual restart preserves state, map, source lookup and event version; no generation requests', result: 'passed' });
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true });
  await writeFile(`${evidence}/failure.json`, JSON.stringify({ errors, message: error.message }, null, 2));
  console.error(`State deployment failure evidence: ${evidence}`); throw error;
} finally { await browser.close(); }
assert.deepEqual(errors, []);
const hashes = {};
for (const file of ['dist/server/index.js', 'dist/client/index.html']) {
  hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  assert.equal((await execute('docker', ['exec', 'squaretable-exploration-app-1', 'sha256sum', `/app/${file}`])).stdout.split(' ')[0], hashes[file]);
}
await writeFile(`${evidence}/report.json`, JSON.stringify({ passed: true, at: new Date().toISOString(), checks, artifacts, hashes, errors,
  screenshots: ['source-desktop.png', 'source-mobile.png', 'story-memory-drawer.png'], provider: 'not called; explicitly prewritten fixtures',
  faultInjection: 'one 503 source read; all successful responses use actual API', paidProviderTokens: 0,
  memoryFixtureIsolation: { jobs: await fixtureJobs(), availableAt: '2099-01-01T00:00:00Z', atomicWithSeed: true },
  migrationCount: Number(await query('SELECT count(*) FROM beta_release.__drizzle_migrations')),
  image: (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim() }, null, 2));
console.info(`Deployed state and provenance passed: ${evidence}/report.json`);
