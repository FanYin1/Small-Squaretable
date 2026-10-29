import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { checkLibraryRecovery } from './story-library-recovery-check.mjs';

const execute = promisify(execFile);
const source = 'http://127.0.0.1:3081';
const base = process.env.PRIVATE_LIBRARY_BASE || source;
assert.ok([source, 'http://127.0.0.1:55443'].includes(base));
const directory = `backups/exploration/private-library-${base === source ? 'deployed' : 'preview'}-${randomUUID()}`;
await mkdir(directory, { recursive: true, mode: 0o700 });
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const tables = ['characters', 'character_versions', 'character_collections', 'character_collection_items', 'worldbooks', 'worldbook_entries', 'credit_ledger', 'credit_reservations', 'chats', 'messages', 'story_content', 'story_worldbooks', 'story_states', 'story_events', 'story_memory_jobs', 'story_memory_progress', 'generation_requests'];
const audit = async () => JSON.parse(await query(`SELECT jsonb_object_agg(name, summary) FROM (${tables.map(table => `SELECT '${table}' AS name, jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(item)::text),'' ORDER BY md5(to_jsonb(item)::text)),''))) AS summary FROM public.${table} item`).join(' UNION ALL ')}) fingerprints`));
const before = await audit();
const historicalImage = (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-beta-app-1'])).stdout.trim();
const credentials = JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8'));
const login = await fetch(`${source}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(15000) });
assert.equal(login.status, 200);
const auth = (await login.json()).data;
const headers = { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId };
const listResponse = await fetch(`${source}/api/v1/characters?limit=50`, { headers });
assert.equal(listResponse.status, 200);
const library = await listResponse.json();
const card = library.data.items.find(item => !item.isPublic);
assert.ok(card, 'An existing engineering-account private work is required');
const browser = await chromium.launch({ headless: true });
const errors = [];
const writes = [];
const screenshots = [];
const checks = [];
let blockedTelemetry = 0;
let remaining = 100;
let resetAt = 0;
function observe(response) {
  const observed = response.headers();
  if (Number(observed['x-ratelimit-limit']) !== 100) return;
  const nextReset = Number(observed['x-ratelimit-reset']);
  remaining = nextReset > resetAt + 2000 ? Number(observed['x-ratelimit-remaining']) : Math.min(remaining, Number(observed['x-ratelimit-remaining']));
  resetAt = Math.max(resetAt, nextReset);
}
async function budget() {
  if (remaining >= 40) return;
  console.info('Private library checks waiting for the normal API rate-limit window');
  while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 30000)));
  remaining = 100;
}
try {
  const context = await browser.newContext();
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem('theme-preference', 'light');
  }, auth);
  await context.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') {
      if (url.pathname === '/api/v1/analytics/vitals') blockedTelemetry++;
      else writes.push({ method: request.method(), path: url.pathname });
      return route.abort();
    }
    if (base !== source) return route.fulfill({ response: await route.fetch({ url: `${source}${url.pathname}${url.search}` }) });
    return route.continue();
  });
  if (base !== source) await context.route('**/uploads/**', async route => {
    const url = new URL(route.request().url());
    return route.fulfill({ response: await route.fetch({ url: `${source}${url.pathname}${url.search}` }) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', observe);
  async function screenshot(name) {
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
    const path = `${directory}/${name}.png`;
    await page.screenshot({ path, animations: 'disabled' });
    await chmod(path, 0o600);
    screenshots.push(`${name}.png`);
  }
  async function navigate(path) { await budget(); await page.goto(`${base}${path}`); }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const theme of ['light', 'dark']) {
      await page.addInitScript(theme => { localStorage.setItem('theme-preference', theme); }, theme);
      await navigate('/my-characters');
      await expect(page.getByRole('heading', { name: '我的故事库', exact: true })).toBeVisible();
      const item = page.locator('.private-story-card').filter({ has: page.getByRole('button', { name: `查看故事: ${card.name}`, exact: true }) });
      await expect(item).toBeVisible();
      assert.equal(await page.locator('.card-actions-overlay, .story-favorite').count(), 0);
      await expect(item.locator('.private-story-enter')).toBeVisible();
      if (width === 390) await expect(item.locator('.private-story-name')).toBeInViewport();
      await screenshot(`library-${width}-${theme}`);
      await item.locator('.private-story-more').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menuitem', { name: '导出', exact: true })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: '删除', exact: true })).toBeVisible();
      await screenshot(`library-menu-${width}-${theme}`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menuitem', { name: '导出', exact: true })).toBeHidden();
      await item.locator('.private-story-preview').click();
      await expect(page.getByTestId('story-opening')).toBeVisible();
      await expect(page.locator('.private-story-detail .private-detail-tools')).toBeVisible();
      await expect(page.getByRole('link', { name: '创作', exact: true })).toHaveAttribute('aria-current', 'page');
      await screenshot(`detail-${width}-${theme}`);
      assert.ok(await page.getByTestId('story-opening').evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('#story-management')) & Node.DOCUMENT_POSITION_FOLLOWING)));
      await page.getByRole('link', { name: '整理与检查 ↓', exact: true }).click();
      await expect(page.locator('.management-intro')).toBeVisible();
      await expect(page.getByRole('region', { name: '整理与兼容检查', exact: true })).toBeVisible();
      await screenshot(`management-${width}-${theme}`);
      checks.push(`${width}/${theme}: real private library, keyboard management, play-first detail and management anchor`);
    }
  }
  await navigate('/my-characters');
  await page.locator('.private-story-card').first().waitFor();
  await page.locator('.search-combo input').fill(`no-match-${randomUUID()}`);
  await expect(page.locator('.library-empty[data-type="no-results"]')).toBeVisible();
  await screenshot('controlled-no-search-results-mobile');
  await page.locator('.search-combo input').fill('');
  await page.getByRole('button', { name: `编辑: ${card.name}`, exact: true }).click();
  await expect(page.getByTestId('editor-save-status')).toContainText('已从服务端载入');
  checks.push('Search clears locally; private edit enters the existing object workbench without saving');
  const matchesLibrary = url => url.origin === base && url.pathname === '/api/v1/characters';
  for (const state of ['empty', 'long-title-broken-cover']) {
    const items = state === 'empty' ? [] : [{ ...card, name: '布局测试 · ' + '这是一张标题较长的私人故事卡'.repeat(8),
      avatarUrl: 'data:image/png;base64,broken', description: '受控布局测试：检查长标题、简介和标签换行。'.repeat(30),
      tags: ['用于检查换行的超长标签'.repeat(8), '测试卡'], presentation: null }];
    const controlledList = route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...library, data: { ...library.data, items, pagination: { ...library.data.pagination, total: items.length, totalPages: 1, hasNext: false } } }) });
    await page.route(matchesLibrary, controlledList);
    try {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await navigate('/my-characters');
        if (state === 'empty') {
          await expect(page.locator('.library-empty[data-type="no-data"]')).toBeVisible();
          await expect(page.locator('.library-empty-actions').getByRole('button', { name: '导入角色卡', exact: true })).toBeVisible();
        } else {
          await expect(page.locator('.private-story-card')).toHaveCount(1);
          await expect(page.locator('.cover-initial')).toBeVisible();
          await expect(page.locator('.private-story-enter')).toBeVisible();
          await expect(page.locator('.private-story-name')).toBeInViewport();
          assert.equal(await page.locator('.private-story-cover img').count(), 0);
        }
        await screenshot(`controlled-${state}-${width}`);
      }
    } finally { await page.unroute(matchesLibrary, controlledList); }
  }
  checks.push('Controlled empty library and long-title/broken-cover cards remain usable at desktop/mobile widths');
  const recovery = await checkLibraryRecovery({ page, base, card, budget, screenshot });
  checks.push('Desktop/mobile controlled timeouts and 429 recover with one manual retry each');
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(await audit(), before);
  assert.equal((await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-beta-app-1'])).stdout.trim(), historicalImage);
  const html = await (await fetch(base)).text();
  if (base === source) assert.equal(html.trim(), (await execute('docker', ['exec', 'squaretable-exploration-app-1', 'cat', '/app/dist/client/index.html'])).stdout.trim());
  await writeFile(`${directory}/report.json`, JSON.stringify({ at: new Date().toISOString(), result: 'passed', base, source,
    scope: 'Actual engineering-account private works; controlled transport failures and search with no results; no real-device or user visual acceptance',
    checks, recovery, screenshots, errors, writes, blockedTelemetry, comparedBusinessTables: tables.length, businessDataUnchanged: true,
    htmlSha256: createHash('sha256').update(html).digest('hex'), historicalImage,
    image: (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim(), paidProviderCalls: 0,
  }, null, 2), { mode: 0o600 });
  console.info(`PASS: private library ${base === source ? 'deployed' : 'preview'}; ${screenshots.length} private screenshots; ${directory}/report.json`);
} catch (error) {
  await writeFile(`${directory}/failure.json`, JSON.stringify({ message: error.message, errors, writes, screenshots }, null, 2), { mode: 0o600 });
  throw error;
} finally { await browser.close(); }
