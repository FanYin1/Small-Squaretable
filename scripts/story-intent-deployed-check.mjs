import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const evidence = `/tmp/squaretable-intent-deployed-${randomUUID()}`;
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
  if (remaining >= 45) return;
  console.info('Waiting for normal deployed API rate limit');
  while (Date.now() < reset + 1100) await new Promise(resolve => setTimeout(resolve, 1000));
  remaining = 100;
}
let login;
for (let attempt = 0; attempt < 2; attempt++) {
  login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  observeBudget(Object.fromEntries(login.headers));
  if (login.status !== 429 || attempt === 1) break;
  await login.arrayBuffer();
  remaining = 0;
  reset = Math.max(reset, Date.now() + Number(login.headers.get('retry-after') || 60) * 1000);
  await waitBudget();
}
assert.equal(login.status, 200);
const auth = (await login.json()).data;
let csrf;
async function api(path, body) {
  await waitBudget();
  const response = await fetch(`${base}/api/v1${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId,
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  observeBudget(Object.fromEntries(response.headers));
  assert.ok(response.ok, `Candidate ${path}: ${response.status}`);
  const result = await response.json();
  return result.data ?? result;
}
csrf = (await api('/csrf-token')).csrfToken;
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const uuid = value => { assert.match(value, /^[0-9a-f-]{36}$/); return literal(value); };
assert.equal(await query('SELECT current_database()'), 'squaretable_beta');
const artifactPath = 'backups/exploration/acceptance-04d.json';
let artifacts;
try { artifacts = JSON.parse(await readFile(artifactPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const card = await api('/characters', { name: '04D验收 · 渡口抉择', description: '原创私有验收卡。初始候选为预写夹具；确认后才会调用模型。', cardData: {
    name: '渡口向导', first_mes: '', description: '你是渡口向导，克制、耐心，按玩家明确行动回应。', extensions: { squaretable: { exploration: {
      version: 1, fields: [{ id: 'coins', label: '随身钱款', type: 'number', initial: 100, min: 0 }], actions: [
        { id: 'buy', label: '花20枚钱购买通行证', intent: 'act', changes: [{ field: 'coins', operation: 'add', value: -20 }], outcome: '交易完成，花20枚获得通行证。' },
      ],
    } } },
  } });
  const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
  const members = [];
  for (const name of ['林澈', '苏遥']) members.push(await api('/characters', { name: `04D验收 · ${name}`, description: '原创私有知情范围验收人物。', cardData: { name, first_mes: '', description: `你是${name}，只回应你实际收到的对话，不猜测未参与的交谈。` } }));
  const group = await api('/chats', { characterIds: members.map(member => member.id), clientRequestId: randomUUID(), metadata: { groupStrategy: 'all' } });
  artifacts = { cardId: card.id, storyId: story.id, groupId: group.id, characterIds: members.map(member => member.id) };
  await writeFile(artifactPath, JSON.stringify(artifacts, null, 2), { flag: 'wx', mode: 0o600 });
}
const requestCount = () => query(`SELECT count(*) FROM generation_requests WHERE chat_id IN (${uuid(artifacts.storyId)},${uuid(artifacts.groupId)})`);
const generationBefore = await requestCount();
if (await query(`SELECT count(*) FROM messages WHERE chat_id=${uuid(artifacts.storyId)}`) === '0') {
  const input = '我想拿一张通行证';
  const extra = { storyRequestId: 'owned-04d-proposal', storyVersion: 1, stateStatus: 'proposed',
    storyIntent: { input, expectedVersion: 1, intent: { version: 1, disposition: 'proposal', steps: [{ kind: 'execute', actionId: 'buy', evidence: input }], facts: [] } } };
  await query(`BEGIN;
    SELECT chat_id FROM story_states WHERE chat_id=${uuid(artifacts.storyId)} FOR UPDATE;
    WITH source AS (INSERT INTO messages (chat_id,role,content) VALUES (${uuid(artifacts.storyId)},'user',${literal(input)}) RETURNING id),
    reply AS (INSERT INTO messages (chat_id,role,content,extra) VALUES (${uuid(artifacts.storyId)},'assistant','这是预写验收候选：购买尚未执行，请核对行动。',${literal(JSON.stringify(extra))}::jsonb) RETURNING id)
    INSERT INTO story_events (chat_id,request_id,version,status,input_message_id,message_id,changes,excerpt)
    SELECT ${uuid(artifacts.storyId)},'owned-04d-proposal',1,'proposed',source.id,reply.id,'{}','预写候选，未执行' FROM source,reply;
    UPDATE story_states SET version=1 WHERE chat_id=${uuid(artifacts.storyId)}; COMMIT;`);
}
if (await query(`SELECT count(*) FROM messages WHERE chat_id=${uuid(artifacts.groupId)}`) === '0') {
  const audience = { storyAudience: [artifacts.characterIds[0]] };
  const replyExtra = { ...audience, storyRequestId: 'owned-04d-private', storyVersion: 1, stateStatus: 'confirmed' };
  await query(`BEGIN;
    SELECT chat_id FROM story_states WHERE chat_id=${uuid(artifacts.groupId)} FOR UPDATE;
    WITH source AS (INSERT INTO messages (chat_id,role,content,extra) VALUES (${uuid(artifacts.groupId)},'user','预写验收：这句话只告诉林澈。',${literal(JSON.stringify(audience))}::jsonb) RETURNING id),
    reply AS (INSERT INTO messages (chat_id,role,content,extra,character_id) VALUES (${uuid(artifacts.groupId)},'assistant','预写验收：林澈记下了这次私下交谈。',${literal(JSON.stringify(replyExtra))}::jsonb,${uuid(artifacts.characterIds[0])}) RETURNING id)
    INSERT INTO story_events (chat_id,request_id,version,status,input_message_id,message_id,changes,excerpt)
    SELECT ${uuid(artifacts.groupId)},'owned-04d-private',1,'confirmed',source.id,reply.id,'{}','预写私下交谈' FROM source,reply;
    UPDATE story_states SET version=1 WHERE chat_id=${uuid(artifacts.groupId)}; COMMIT;`);
}
const before = await api(`/chats/${artifacts.storyId}/story-state`);
assert.equal(before.fields[0].value, 100);
assert.equal(before.events[0].status, 'proposed');
assert.equal(await query(`SELECT count(*) FROM story_memory_progress WHERE chat_id=${uuid(artifacts.storyId)}`), '0');
await execute('docker', ['restart', 'squaretable-exploration-app-1']);
const deadline = Date.now() + 30000;
while (true) {
  try { assert.equal((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) })).status, 200); break; }
  catch { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 500)); }
}
assert.deepEqual(await api(`/chats/${artifacts.storyId}/story-state`), before);
const browser = await chromium.launch({ headless: true });
const screenshots = [];
const errors = [];
const failedResponses = [];
let generationSends = 0;
try {
  const context = await browser.newContext();
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken); localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId); localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  const page = await context.newPage();
  page.on('response', response => {
    observeBudget(response.headers());
    if (response.status() >= 400) failedResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => socket.on('framesent', frame => { if (JSON.parse(String(frame.payload)).type === 'user_message') generationSends++; }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await waitBudget();
    await page.goto(`${base}/chat/${artifacts.storyId}`);
    const confirm = page.getByRole('button', { name: '确认并继续', exact: true });
    await expect(confirm).toBeEnabled();
    await confirm.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/intent-${width}.png`, fullPage: true });
    screenshots.push(`intent-${width}.png`);
    await waitBudget();
    await page.goto(`${base}/chat/${artifacts.groupId}`);
    await expect(page.locator('#story-audience')).toBeVisible();
    await expect(page.locator('.message-user')).toContainText('私下交谈');
    await expect(page.locator('.message-user')).toContainText('林澈');
    await page.locator('#story-audience').selectOption(artifacts.characterIds[0]);
    await waitBudget();
    await page.reload();
    await expect(page.locator('#story-audience')).toHaveValue(artifacts.characterIds[0]);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${evidence}/knowledge-${width}.png`, fullPage: true });
    screenshots.push(`knowledge-${width}.png`);
  }
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true });
  await writeFile(`${evidence}/failure.json`, JSON.stringify({ errors, failedResponses, message: error.message }, null, 2));
  console.error(`Deployment check evidence: ${evidence}`);
  throw error;
} finally { await browser.close(); }
assert.deepEqual(errors, []);
assert.equal(generationSends, 0);
assert.equal(await requestCount(), generationBefore);
const hashes = {};
for (const file of ['dist/server/index.js', 'dist/client/index.html']) {
  hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  assert.equal((await execute('docker', ['exec', 'squaretable-exploration-app-1', 'sha256sum', `/app/${file}`])).stdout.split(' ')[0], hashes[file]);
}
await writeFile(`${evidence}/report.json`, JSON.stringify({ passed: true, at: new Date().toISOString(), artifacts, hashes, screenshots,
  candidateState: 'proposed', candidateMemoryJobs: 0, restartPersisted: true, generationSends, provider: 'not called; owned prewritten fixtures',
  migrationCount: Number(await query('SELECT count(*) FROM beta_release.__drizzle_migrations')),
  image: (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim() }, null, 2));
console.info(`Deployed intent and knowledge UI passed: ${evidence}/report.json`);
