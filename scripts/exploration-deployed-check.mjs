import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const directory = 'backups/exploration';
const evidence = '/tmp/squaretable-exploration-deployed';
await mkdir(evidence, { recursive: true, mode: 0o700 });
assert.equal((await fetch(`${base}/health/ready`)).status, 200);
let credentials;
try { credentials = JSON.parse(await readFile(`${directory}/acceptance-account.json`, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  credentials = { email: `acceptance-${randomUUID()}@example.test`, password: randomBytes(24).toString('hex') };
  const invitation = `LOCAL-${randomBytes(16).toString('hex').toUpperCase()}`;
  const seed = `import postgres from 'postgres'; const sql=postgres(process.env.DATABASE_URL,{max:1}); await sql\`INSERT INTO invite_codes(code,max_uses,expires_at,note) VALUES ('${invitation}',1,now()+interval '1 day','Synthetic local acceptance account')\`; await sql.end();`;
  await execute('docker', ['exec', 'squaretable-exploration-app-1', 'node', '--input-type=module', '-e', seed]).catch(() => { throw new Error('Could not prepare synthetic signup'); });
  const response = await fetch(`${base}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...credentials, ageConfirmed: true, inviteCode: invitation }) });
  assert.equal(response.status, 201);
  await writeFile(`${directory}/acceptance-account.json`, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 });
}
const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
const auth = (await login.json()).data;
let csrf = '';
let remaining = 100;
let resetAt = 0;
function budget(headers) {
  if (Number(headers['x-ratelimit-limit']) !== 100) return;
  remaining = Number(headers['x-ratelimit-remaining']); resetAt = Number(headers['x-ratelimit-reset']);
}
async function waitForBudget() {
  if (remaining >= 60) return;
  while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(1000, resetAt + 1101 - Date.now())));
  remaining = 100;
}
async function api(path, body, method = body ? 'POST' : 'GET') {
  await waitForBudget();
  const response = await fetch(`${base}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId, 'X-CSRF-Token': csrf }, ...(body ? { body: JSON.stringify(body) } : {}) });
  budget(Object.fromEntries(response.headers));
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  const result = await response.json();
  return result.data ?? result;
}
csrf = (await api('/csrf-token')).csrfToken;
const library = await api('/characters/marketplace?limit=50');
const cards = Array.isArray(library) ? library : library.items;
const card = cards.find(item => item.name === '雾海之外');
assert.ok(card, 'The original exploration example must be published locally');
let storyId;
try { storyId = JSON.parse(await readFile(`${directory}/acceptance-story.json`, 'utf8')).id; }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
  storyId = story.id;
  await writeFile(`${directory}/acceptance-story.json`, JSON.stringify({ id: storyId }), { flag: 'wx', mode: 0o600 });
}
const state = await api(`/chats/${storyId}/story-state`);
assert.equal(state.fields.find(field => field.id === 'coins').value, 120);
assert.equal(state.map.location, 'harbor');
if (!state.notes.some(note => note.content === '验收记录：请保持克制对白，给我回应空间。')) {
  await api(`/chats/${storyId}/story-notes`, { kind: 'style', content: '验收记录：请保持克制对白，给我回应空间。' });
}
assert.ok((await api(`/chats/${storyId}/story-state`)).notes.some(note => note.content === '验收记录：请保持克制对白，给我回应空间。'));
const browser = await chromium.launch({ headless: true });
const screenshots = [];
const errors = [];
try {
  const page = await browser.newPage();
  page.on('response', response => { if (response.url().includes('/api/v1/')) budget(response.headers()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ auth }) => {
    localStorage.setItem('token', auth.tokens.accessToken); localStorage.setItem('refreshToken', auth.tokens.refreshToken);
    localStorage.setItem('tenantId', auth.user.tenantId); localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([auth.user.tenantId, auth.user.id])}`, 'done');
  }, { auth });
  for (const width of [390, 1440]) {
    await waitForBudget();
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/chat/${storyId}`);
    await page.locator('.story-actions li').first().waitFor();
    await expect(page.locator('.story-back')).toBeVisible();
    assert.equal(await page.locator('.chat-sidebar-wrapper').count(), 0);
    if (width < 1024) await page.locator('.dossier-toggle').click();
    await expect(page.locator('.story-facts')).toContainText('120');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const filename = `candidate-play-${width}-${theme}.png`;
      await page.screenshot({ path: `${evidence}/${filename}`, fullPage: true }); screenshots.push(filename);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
  }
  await waitForBudget(); await page.goto(`${base}/my-characters`); await page.locator('.exploration-header').waitFor();
  await waitForBudget(); await page.goto(`${base}/profile`); await page.locator('.profile-preferences').waitFor();
  await waitForBudget(); await page.goto(`${base}/subscription`); await page.locator('.credits-balance').waitFor();
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
const image = (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim();
const documentResponse = await fetch(`${base}/chat/${storyId}`, { headers: { Accept: 'text/html' } });
assert.equal(documentResponse.status, 200);
assert.ok(documentResponse.headers.get('content-type')?.includes('text/html'));
const document = await documentResponse.text();
assert.ok(document.includes('/assets/'));
const report = { date: new Date().toISOString(), result: 'passed', base, image, htmlSha256: createHash('sha256').update(document).digest('hex'), syntheticAccount: true, screenshots, checks: ['authenticated direct entry and reload', 'authored initial state from restored/migrated database', '390/1440 light/dark without horizontal overflow', 'reader has no platform sidebar', 'creator, account and credits use exploration shell'], modelGeneration: 'not part of this deployed UI check' };
await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
console.info(`Deployed candidate passed; ${screenshots.length} screenshots at ${evidence}`);
