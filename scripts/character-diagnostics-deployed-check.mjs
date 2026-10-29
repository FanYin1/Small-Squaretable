import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const evidence = `/tmp/squaretable-diagnostics-deployed-${randomUUID()}`;
await mkdir(evidence, { recursive: true, mode: 0o700 });
const credentials = JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8'));
const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
const auth = (await login.json()).data;
let csrf = '';
let remaining = 100;
let resetAt = 0;
function budget(headers) {
  if (Number(headers['x-ratelimit-limit']) !== 100) return;
  remaining = Number(headers['x-ratelimit-remaining']);
  resetAt = Number(headers['x-ratelimit-reset']);
}
async function waitBudget() {
  if (remaining >= 55) return;
  while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(1000, resetAt + 1101 - Date.now())));
  remaining = 100;
}
async function api(path, body, method = body ? 'POST' : 'GET') {
  await waitBudget();
  const multipart = body instanceof FormData;
  const response = await fetch(`${base}/api/v1${path}`, { method,
    headers: { ...(multipart ? {} : { 'Content-Type': 'application/json' }), Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId, 'X-CSRF-Token': csrf },
    ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}) });
  budget(Object.fromEntries(response.headers));
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  const result = await response.json();
  return result.data ?? result;
}
csrf = (await api('/csrf-token')).csrfToken;
const artifactPath = 'backups/exploration/acceptance-03c.json';
let artifacts;
try { artifacts = JSON.parse(await readFile(artifactPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const card = await api('/characters', { name: '03C验收 · 灯下问路', description: '原创私有验收样例：核对常识资料绑定和固定称呼，不代表首发推荐内容。', cardData: {
    name: '灯下问路', first_mes: '澄舟，街角的灯亮了。店主放下书，等你开口。',
    extensions: { world: '灯下的常识', squaretable: { playerIdentity: { protocol: 1, fixedName: '澄舟' } } },
    character_book: { name: '灯下的常识', entries: [{ keys: ['路灯'], content: '街角的路灯照着一张旧地图。', constant: true, extensions: { squaretable: { purpose: 'knowledge' } } }] },
  } });
  const persona = await api('/personas', { name: '澄舟', description: '原创验收人物，只用于本机示例。' });
  const story = await api('/chats', { characterId: card.id, personaId: persona.id, clientRequestId: randomUUID() });
  artifacts = { characterId: card.id, personaId: persona.id, storyId: story.id };
  await writeFile(artifactPath, JSON.stringify(artifacts, null, 2), { flag: 'wx', mode: 0o600 });
}
const report = await api(`/characters/${artifacts.characterId}/compatibility`);
assert.deepEqual(report.books.dependencies, ['bound']);
assert.deepEqual(report.books.purposes, ['knowledge']);
assert.equal(report.identity.fixedName, '澄舟');
const saved = await api(`/chats/${artifacts.storyId}/characters`);
assert.deepEqual(saved[0].diagnostics, report);
const unsetPath = 'backups/exploration/acceptance-03c-unset-timers.json';
let unsetArtifacts;
try { unsetArtifacts = JSON.parse(await readFile(unsetPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const source = { spec: 'chara_card_v3', spec_version: '3.0', data: {
    name: '03C验收 · 夜航记录', description: '原创私有验收样例：夜航前的船桥，熟悉的领航员正等着船长开口。',
    scenario: '玩家是值班船长，与领航员共事三年。', first_mes: '船长{{user}}，航海钟刚敲过。领航员把航线图放在桌上，等你决定先问些什么。',
    character_book: { name: '夜航常识', entries: [{ keys: [], content: '航海钟用于核对值班时间。', constant: true,
      extensions: { sticky: null, cooldown: null, delay: null } }] },
  } };
  const form = new FormData();
  form.append('files', new Blob([JSON.stringify(source)], { type: 'application/json' }), 'owned-unset-timers.json');
  const imported = await api('/characters/import/batch', form);
  assert.equal(imported.failed.length, 0);
  assert.equal(imported.imported.length, 1);
  const characterId = imported.imported[0].id;
  const story = await api('/chats', { characterId, personaId: artifacts.personaId, clientRequestId: randomUUID() });
  unsetArtifacts = { characterId, storyId: story.id };
  await writeFile(unsetPath, JSON.stringify(unsetArtifacts, null, 2), { flag: 'wx', mode: 0o600 });
}
const unsetCard = await api(`/characters/${unsetArtifacts.characterId}`);
assert.deepEqual(unsetCard.cardData._squaretableImport.original.data.character_book.entries[0].extensions, { sticky: null, cooldown: null, delay: null });
const binding = (await api(`/characters/${unsetArtifacts.characterId}/worldbooks`)).books.find(book => book.characterId === unsetArtifacts.characterId);
assert.ok(binding);
const unsetEntries = await api(`/worldbooks/${binding.id}/entries`);
for (const field of ['sticky', 'cooldown', 'delay']) assert.equal(unsetEntries[0].settings[field], 0);
const unsetSaved = await api(`/chats/${unsetArtifacts.storyId}/characters`);
assert.equal(unsetSaved[0].diagnostics.identity.status, 'unverified');
assert.equal(unsetSaved[0].diagnostics.books.undeclaredPurpose, true);
const oldStory = JSON.parse(await readFile('backups/exploration/acceptance-story.json', 'utf8'));
const oldCharacters = await api(`/chats/${oldStory.id}/characters`);
assert.equal(oldCharacters[0].diagnostics, undefined);
const beforeImage = (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim();
await execute('docker', ['restart', 'squaretable-exploration-app-1']);
const deadline = Date.now() + 60000;
while (true) {
  try { assert.equal((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1500) })).status, 200); break; }
  catch { assert.ok(Date.now() < deadline, 'Updated candidate did not recover'); await new Promise(resolve => setTimeout(resolve, 500)); }
}
assert.deepEqual(await api(`/chats/${artifacts.storyId}/characters`), saved);
assert.deepEqual(await api(`/chats/${unsetArtifacts.storyId}/characters`), unsetSaved);
assert.deepEqual(await api(`/chats/${oldStory.id}/characters`), oldCharacters);
const browser = await chromium.launch({ headless: true });
const screenshots = [];
const errors = [];
let generationAttempts = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/api/v1/')) budget(response.headers()); });
  page.on('websocket', socket => socket.on('framesent', frame => {
    if (['chat_message', 'group_chat_message', 'user_message'].some(type => String(frame.payload).includes(type))) generationAttempts++;
  }));
  await page.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
  }, auth);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const scene of ['detail', 'story']) {
      await waitBudget();
      await page.goto(`${base}/${scene === 'detail' ? `characters/${artifacts.characterId}` : `chat/${artifacts.storyId}`}`);
      if (scene === 'story') await page.locator('.reading-settings summary').click();
      await expect(page.locator('.story-diagnostics')).toContainText('常识与概念');
      await expect(page.locator('.story-diagnostics')).toContainText('澄舟');
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
        const path = `03c-${scene}-${width}-${theme}.png`;
        await page.screenshot({ path: `${evidence}/${path}`, fullPage: true });
        screenshots.push(path);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
    }
  }
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const scene of ['detail', 'story']) {
      await waitBudget();
      await page.goto(`${base}/${scene === 'detail' ? `characters/${unsetArtifacts.characterId}` : `chat/${unsetArtifacts.storyId}`}`);
      if (scene === 'story') await page.locator('.reading-settings summary').click();
      await expect(page.locator('.story-diagnostics')).toContainText('文字中的身份、经历与关系尚未自动核对');
      await expect(page.locator('.story-diagnostics')).toContainText('部分资料未声明用途');
      const path = `03c-unset-${scene}-${width}.png`;
      await page.screenshot({ path: `${evidence}/${path}`, fullPage: true });
      screenshots.push(path);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
  }
  await waitBudget();
  await page.goto(`${base}/chat/${oldStory.id}`);
  await page.locator('.reading-settings summary').click();
  await expect(page.locator('.reading-settings')).toContainText('此旧档未保存开局绑定诊断');
  assert.deepEqual(errors, []);
  assert.equal(generationAttempts, 0);
} finally { await browser.close(); }
const image = (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim();
assert.equal(image, beforeImage);
const html = await (await fetch(`${base}/`)).text();
const localHtml = await readFile('dist/client/index.html', 'utf8');
assert.equal(html.trim(), localHtml.trim(), 'Deployed HTML differs from the validated production build');
const result = { date: new Date().toISOString(), result: 'passed', base, image, screenshots, artifacts, unsetArtifacts,
  htmlSha256: createHash('sha256').update(html.trim()).digest('hex'), paidProviderTokens: 0, generationAttempts,
  checks: ['actual private author card, bound knowledge book and compatible persona', 'frozen diagnostic data matches entry',
    'application container restart preserves new and old stories', 'old snapshots do not acquire invented diagnostics',
    '390/1440 light/dark production pages without overflow or page errors', 'deployed HTML matches locally validated build',
    'actual file import preserves null timing source fields and maps runtime settings to zero', 'undeclared identity/purpose remain explicit before entry and in a restored story'],
  limits: ['No paid generation or real-device/user acceptance', 'Private owned sample under the existing acceptance account; not a public launch card'] };
await writeFile(`${evidence}/report.json`, JSON.stringify(result, null, 2), { mode: 0o600 });
console.info(`PASS: deployed 03C diagnostics, ${screenshots.length} screenshots; ${evidence}/report.json`);
