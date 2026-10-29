import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const evidence = `/tmp/squaretable-effects-deployed-${randomUUID()}`;
await mkdir(evidence, { recursive: true, mode: 0o700 });
const credentials = JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8'));
const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
const auth = (await login.json()).data;
let csrf;
async function api(path, body) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, `Candidate ${path}: ${response.status}`);
  const result = await response.json();
  return result.data ?? result;
}
csrf = (await api('/csrf-token')).csrfToken;
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const uuid = value => { assert.match(value, /^[0-9a-f-]{36}$/); return `'${value}'`; };
const artifactPath = 'backups/exploration/acceptance-04c.json';
let artifacts;
try { artifacts = JSON.parse(await readFile(artifactPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const card = await api('/characters', { name: '04C验收 · 渡口行囊', description: '原创私有恢复验收样例。正文为预写夹具，无模型生成。', cardData: {
    name: '渡口同行者', first_mes: '船还未到。同行者点了点行囊里的东西，等你决定下一步。<VariableInsert>{"coins":90,"pass":"yes"}</VariableInsert>',
  } });
  const current = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
  const legacyId = randomUUID();
  await query(`WITH created AS (INSERT INTO chats (id,tenant_id,user_id,character_id,title) VALUES (${uuid(legacyId)},${uuid(auth.user.tenantId)},${uuid(auth.user.id)},${uuid(card.id)},'04C验收 · 旧档事务恢复') RETURNING id) INSERT INTO chat_characters (chat_id,character_id) SELECT id,${uuid(card.id)} FROM created`);
  artifacts = { cardId: card.id, legacyId, currentId: current.id };
  await writeFile(artifactPath, `${JSON.stringify(artifacts, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}
const generationBefore = await query(`SELECT count(*) FROM generation_requests WHERE chat_id IN (${uuid(artifacts.legacyId)},${uuid(artifacts.currentId)})`);
const oldMessages = await api(`/chats/${artifacts.legacyId}/messages`);
if (oldMessages.length === 0) {
  await api(`/chats/${artifacts.legacyId}/messages`, { role: 'assistant', content: '同行者把通行证递给你。<VariableInsert>{"coins":100,"obsolete":"old"}</VariableInsert><VariableEdit>{"coins":90,"pass":"yes"}</VariableEdit><VariableDelete>["obsolete"]</VariableDelete>' });
  await api(`/chats/${artifacts.legacyId}/messages`, { role: 'assistant', content: '这是一段尚未完成的动作……<VariableEdit>{"coins":0}</VariableEdit>', extra: { stateStatus: 'interrupted' } });
}
assert.deepEqual((await api(`/chats/${artifacts.legacyId}/variables`)).variables, { coins: '90', pass: 'yes' });
const currentCard = await api(`/characters/${artifacts.cardId}`);
await api(`/chats/${artifacts.currentId}/messages`, { role: 'assistant', content: currentCard.cardData.first_mes });
assert.deepEqual((await api(`/chats/${artifacts.currentId}/variables`)).variables, {});
assert.equal(await query(`SELECT count(*) FROM legacy_chat_variables WHERE chat_id = ${uuid(artifacts.currentId)}`), '0');
const storedBefore = await query(`SELECT md5(string_agg(to_jsonb(item)::text,',' ORDER BY id)) FROM messages item WHERE chat_id = ${uuid(artifacts.legacyId)}`);
await execute('docker', ['restart', 'squaretable-exploration-app-1']);
const deadline = Date.now() + 30000;
while (true) {
  try { assert.equal((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) })).status, 200); break; }
  catch { assert.ok(Date.now() < deadline, 'Candidate restart failed readiness'); await new Promise(resolve => setTimeout(resolve, 500)); }
}
assert.deepEqual((await api(`/chats/${artifacts.legacyId}/variables`)).variables, { coins: '90', pass: 'yes' });
assert.equal(await query(`SELECT md5(string_agg(to_jsonb(item)::text,',' ORDER BY id)) FROM messages item WHERE chat_id = ${uuid(artifacts.legacyId)}`), storedBefore);
const browser = await chromium.launch({ headless: true });
const shots = [];
let generationSends = 0;
const errors = [];
try {
  const context = await browser.newContext();
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => socket.on('framesent', frame => { if (JSON.parse(String(frame.payload)).type === 'user_message') generationSends++; }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [name, id] of [['legacy', artifacts.legacyId], ['current', artifacts.currentId]]) {
      await page.goto(`${base}/chat/${id}`);
      await expect(page.locator('.message-assistant')).toHaveCount(name === 'legacy' ? 2 : 1);
      if (name === 'legacy') await expect(page.locator('.message-assistant').first()).toContainText('同行者把通行证递给你。');
      const shot = `${name}-${width}.png`;
      await page.screenshot({ path: `${evidence}/${shot}`, fullPage: true });
      shots.push(shot);
    }
  }
} finally { await browser.close(); }
assert.deepEqual(errors, []);
assert.equal(generationSends, 0);
assert.equal(await query(`SELECT count(*) FROM generation_requests WHERE chat_id IN (${uuid(artifacts.legacyId)},${uuid(artifacts.currentId)})`), generationBefore);
const hashes = {};
for (const file of ['dist/server/index.js', 'dist/client/index.html']) {
  const local = createHash('sha256').update(await readFile(file)).digest('hex');
  const deployed = (await execute('docker', ['exec', 'squaretable-exploration-app-1', 'sha256sum', `/app/${file}`])).stdout.split(' ')[0];
  assert.equal(deployed, local);
  hashes[file] = local;
}
const report = { passed: true, provider: 'not called; owned prewritten samples only', paidTokens: 0, generationSends,
  legacyAtomicBatch: true, interruptedUnchanged: true, currentOpeningIsolated: true, restartPersisted: true, artifacts, screenshots: shots, hashes,
  image: (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim(),
  migrationCount: Number(await query('SELECT count(*) FROM beta_release.__drizzle_migrations')), at: new Date().toISOString() };
await writeFile(`${evidence}/report.json`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.info(`Candidate state effects passed; ${evidence}/report.json`);
