import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const directory = `/tmp/squaretable-workbench-deployed-${randomUUID()}`;
await mkdir(directory, { recursive: true, mode: 0o700 });
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const tables = ['characters', 'character_versions', 'worldbooks', 'worldbook_entries', 'credit_ledger', 'credit_reservations', 'chats', 'messages', 'story_content', 'story_worldbooks', 'story_states', 'story_events', 'story_memory_jobs', 'story_memory_progress', 'generation_requests'];
const audit = async () => JSON.parse(await query(`SELECT jsonb_object_agg(name, summary) FROM (${tables.map(table => `SELECT '${table}' AS name, jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(item)::text),'' ORDER BY md5(to_jsonb(item)::text)),''))) AS summary FROM public.${table} item`).join(' UNION ALL ')}) fingerprints`));
const work = JSON.parse(await query("SELECT json_build_object('running',count(*) FILTER (WHERE status='running'),'due',count(*) FILTER (WHERE status IN ('pending','retry','running') AND available_at<=now()),'attempts',coalesce(sum(attempts),0)) FROM story_memory_jobs"));
assert.equal(work.running, 0);
assert.equal(work.due, 0);
const before = await audit();
const historicalImage = (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-beta-app-1'])).stdout.trim();
assert.equal(historicalImage, 'sha256:b65d1767ba17bfcb751e851c9c3c8dc5aac4f432e7c30cd6ac80ec06bda6fec3');
const credentials = JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8'));
const fixture = JSON.parse(await readFile('backups/exploration/acceptance-04ab-safe.json', 'utf8'));
const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(15000) });
assert.equal(login.status, 200);
const auth = (await login.json()).data;
const browser = await chromium.launch({ headless: true });
const errors = [];
const mutations = [];
const screenshots = [];
const checks = [];
let blockedTelemetry = 0;
let remaining = 100;
let resetAt = 0;
async function budget() {
  if (remaining >= 40) return;
  console.info('Read-only workbench checks waiting for normal API rate limit');
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
    localStorage.setItem('theme-preference', 'dark');
  }, auth);
  await context.route('**/api/v1/**', route => {
    if (route.request().method() === 'GET') return route.continue();
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/analytics/vitals') blockedTelemetry++;
    else mutations.push({ method: route.request().method(), path });
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    const headers = response.headers();
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const nextReset = Number(headers['x-ratelimit-reset']);
    remaining = nextReset > resetAt + 2000 ? Number(headers['x-ratelimit-remaining']) : Math.min(remaining, Number(headers['x-ratelimit-remaining']));
    resetAt = Math.max(resetAt, nextReset);
  });
  async function screenshot(name) {
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
    screenshots.push(`${name}.png`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/characters/new`);
  await page.getByTestId('creator-name').fill('工作台本地预览');
  await page.getByTestId('creator-description').fill('雾散之后，留下一个等待探索的起点。');
  await page.locator('[data-step="openings"]').click();
  await page.getByTestId('creator-scene-text').fill('门外有人轻轻敲了三下。{{user}}，你要回应吗？');
  await page.getByRole('button', { name: '添加开场', exact: true }).click();
  await page.getByTestId('creator-scene-text').fill('海风掠过空荡的站台。{{user}}，末班车还没有到。');
  for (const step of ['story', 'people', 'world', 'openings', 'review']) {
    await page.locator(`[data-step="${step}"]`).click();
    await screenshot(`desktop-${step}-dark`);
  }
  for (const mode of ['故事详情', '开场准备', '阅读正文']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    if (mode !== '故事详情') await expect(page.locator('.preview-prose')).toContainText('海风掠过空荡的站台。你，末班车还没有到。');
  }
  await page.getByRole('button', { name: '高级编辑', exact: true }).click();
  await expect(page.locator('.editor-form .el-form-item').filter({ hasText: '描述' }).first().locator('textarea')).toHaveValue('雾散之后，留下一个等待探索的起点。');
  await page.getByRole('button', { name: '引导创作', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('creator-recovery')).toBeVisible();
  await expect(page.getByTestId('creator-name')).toBeDisabled();
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(page.getByTestId('creator-name')).toHaveValue('工作台本地预览');
  checks.push('Deployed desktop five steps, shared advanced fields, three static previews and explicit tab-draft recovery; local-only edits');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-step="openings"]').click();
  await page.locator('[data-scene="1"]').click();
  await page.getByRole('button', { name: '玩家预览', exact: true }).click();
  await page.getByRole('button', { name: '阅读正文', exact: true }).click();
  await expect(page.locator('.preview-prose')).toBeVisible();
  await screenshot('mobile-reading-dark');
  await page.locator('.exploration-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await screenshot('mobile-reading-light');
  await page.getByRole('button', { name: '编辑作品', exact: true }).click();
  await page.locator('[data-step="people"]').click();
  await screenshot('mobile-people-light');
  checks.push('Deployed phone edit/preview toggle and selected-scene reading in dark/light; no horizontal page overflow');
  await page.reload();
  await page.getByRole('button', { name: '丢弃本地草稿', exact: true }).click();
  await expect(page.getByTestId('creator-name')).toHaveValue('');
  await budget();
  await page.goto(`${base}/characters/${fixture.cardId}/edit`);
  await expect(page.getByTestId('editor-save-status')).toContainText('已从服务端载入');
  await page.locator('[data-step="world"]').click();
  await screenshot('existing-work-world-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-step="openings"]').click();
  await screenshot('existing-work-openings-desktop');
  checks.push('Actual saved work loads into object editor; archived source and server-bound materials retain their distinct paths');
  assert.deepEqual(errors, []);
  assert.deepEqual(mutations, []);
  const after = await audit();
  assert.deepEqual(after, before);
  checks.push('15 complete business table fingerprints unchanged; all API writes blocked after login, no generation or paid model call');
  const hashes = {};
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const filename = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile()) hashes[filename] = createHash('sha256').update(await readFile(filename)).digest('hex');
    }
  }
  await walk('dist/client');
  await walk('dist/server');
  const containerHashes = JSON.parse((await execute('docker', ['exec', 'squaretable-exploration-app-1', 'node', '--input-type=module', '-e', "import {readdirSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';const hashes={};function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){const file=path+'/'+entry.name;if(entry.isDirectory())walk(file);else if(entry.isFile())hashes[file]=createHash('sha256').update(readFileSync(file)).digest('hex')}}walk('dist');console.log(JSON.stringify(hashes))"], { maxBuffer: 4 * 1024 * 1024 })).stdout);
  assert.deepEqual(containerHashes, hashes);
  const health = {};
  for (const port of [3080, 3081, 5188]) health[port] = (await fetch(`http://127.0.0.1:${port}${port === 5188 ? '/' : '/health/ready'}`, { signal: AbortSignal.timeout(15000) })).status;
  assert.deepEqual(Object.values(health), [200, 200, 200]);
  assert.equal((await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-beta-app-1'])).stdout.trim(), historicalImage);
  const image = (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim();
  await writeFile(`${directory}/report.json`, JSON.stringify({ result: 'passed', at: new Date().toISOString(), scope: 'Actual 3081 read-only workbench verification; synthetic tab draft only, not human visual acceptance', checks, screenshots, errors, mutations, blockedTelemetry, comparedBuildFiles: Object.keys(hashes).length, htmlSha256: hashes['dist/client/index.html'], serverSha256: hashes['dist/server/index.js'], tablesUnchanged: tables, counts: Object.fromEntries(tables.map(table => [table, after[table].count])), memoryAttempts: work.attempts, image, historicalImage, health, paidProviderCalls: 0 }, null, 2), { mode: 0o600 });
  console.info(`PASS: ${checks.length} deployed workbench groups; ${directory}/report.json`);
} catch (error) {
  await writeFile(`${directory}/failure.json`, JSON.stringify({ message: error.message, errors, mutations, blockedTelemetry, tablesUnchanged: JSON.stringify(await audit()) === JSON.stringify(before) }, null, 2), { mode: 0o600 });
  throw error;
} finally { await browser.close(); }
