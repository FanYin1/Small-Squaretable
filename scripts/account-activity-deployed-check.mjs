import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const app = 'squaretable-exploration-app-1';
const directory = `/tmp/squaretable-account-deployed-${randomUUID()}`;
await mkdir(directory, { recursive: true, mode: 0o700 });
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const tables = ['credit_ledger', 'credit_reservations', 'chats', 'messages', 'story_content', 'story_worldbooks', 'story_states', 'story_events', 'story_memory_jobs', 'story_memory_progress', 'generation_requests'];
const audit = async () => JSON.parse(await query(`SELECT jsonb_object_agg(name, summary) FROM (${tables.map(table => `SELECT '${table}' AS name, jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(item)::text),'' ORDER BY md5(to_jsonb(item)::text)),''))) AS summary FROM public.${table} item`).join(' UNION ALL ')}) fingerprints`));
const work = JSON.parse(await query("SELECT json_build_object('running',count(*) FILTER (WHERE status='running'),'due',count(*) FILTER (WHERE status IN ('pending','retry','running') AND available_at<=now()),'attempts',coalesce(sum(attempts),0)) FROM story_memory_jobs"));
assert.equal(work.running, 0);
assert.equal(work.due, 0);
const before = await audit();
const historicalImage = (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-beta-app-1'])).stdout.trim();
assert.equal(historicalImage, 'sha256:b65d1767ba17bfcb751e851c9c3c8dc5aac4f432e7c30cd6ac80ec06bda6fec3');
let remaining = 100;
let resetAt = 0;
function observe(headers) {
  if (Number(headers['x-ratelimit-limit']) !== 100) return;
  const nextReset = Number(headers['x-ratelimit-reset']);
  remaining = nextReset > resetAt + 2000 ? Number(headers['x-ratelimit-remaining']) : Math.min(remaining, Number(headers['x-ratelimit-remaining']));
  resetAt = Math.max(resetAt, nextReset);
}
async function budget() {
  if (remaining >= 35) return;
  console.info('Read-only account checks waiting for normal API rate limit');
  while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 30000)));
  remaining = 100;
}
const credentials = JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8'));
const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
observe(Object.fromEntries(login.headers));
const auth = (await login.json()).data;
async function api(path) {
  await budget();
  const response = await fetch(`${base}/api/v1${path}`, { headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId }, signal: AbortSignal.timeout(15000) });
  observe(Object.fromEntries(response.headers));
  assert.equal(response.status, 200, path);
  return (await response.json()).data;
}
const balance = await api('/credits/balance');
assert.equal(balance.billingMode, 'credits');
const browser = await chromium.launch({ headless: true });
const errors = [];
const mutations = [];
const screenshots = [];
let blockedTelemetry = 0;
const checks = [];
try {
  const context = await browser.newContext();
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'zh-CN');
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
  page.on('response', response => observe(response.headers()));
  const number = value => value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  async function screenshot(name) {
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
    screenshots.push(`${name}.png`);
  }
  for (const width of [390, 1440]) {
    await budget();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const responsePromise = page.waitForResponse(response => response.url().includes('/api/v1/credits/activity?'));
    await page.goto(`${base}/profile`);
    const activityResponse = await responsePromise;
    assert.equal(activityResponse.status(), 200);
    const activity = (await activityResponse.json()).data;
    await expect(page.getByTestId('account-available')).toContainText(number(balance.availablePoints));
    await expect(page.getByTestId('account-held')).toContainText(number(balance.heldTokens / balance.tokensPerPoint));
    const range = new URLSearchParams({ from: activity.from, to: activity.to });
    assert.deepEqual(await api(`/credits/activity?${range}`), activity);
    const ledger = await api(`/credits/ledger?${range}&limit=10&page=1`);
    await expect(page.locator('.activity-ledger li')).toHaveCount(ledger.items.length);
    if (ledger.items.length === 0) await expect(page.locator('.account-activity')).toContainText('这个范围内没有符合条件的明细。');
    if (activity.inputTokens === null) await expect(page.getByTestId('recorded-usage')).toContainText('未知');
    else await expect(page.getByTestId('recorded-usage')).toContainText(number(activity.inputTokens));
    for (const theme of ['dark', 'light']) {
      await page.locator('.preference-actions').getByRole('button', { name: theme === 'dark' ? '深色' : '浅色', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await screenshot(`account-${width}-${theme}`);
    }
  }
  checks.push('Actual deployed 390/1440 dark/light profile; displayed balance and held points match APIs; period and ledger agree; no fixture account values');
  for (const days of [7, 90]) {
    await budget();
    const responsePromise = page.waitForResponse(response => response.url().includes('/api/v1/credits/activity?'));
    await page.locator('#account-period').selectOption(String(days));
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const activity = (await response.json()).data;
    assert.equal(Date.parse(activity.to) - Date.parse(activity.from), days * 86400000);
    await expect(page.locator('.account-activity [role="alert"]')).toHaveCount(0);
  }
  for (const kind of ['topup', 'charge', 'reversal', '']) {
    await budget();
    const responsePromise = page.waitForResponse(response => response.url().includes('/api/v1/credits/ledger?'));
    await page.getByTestId('ledger-kind').selectOption(kind);
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const ledger = (await response.json()).data;
    assert.ok(ledger.items.every(item => !kind || item.kind === kind));
    await expect(page.locator('.activity-ledger li')).toHaveCount(ledger.items.length);
  }
  for (const size of [15, 17, 19]) {
    await page.getByRole('button', { name: `${size}px`, exact: true }).click();
    await expect(page.locator('.reading-preview p').first()).toHaveCSS('font-size', `${size}px`);
  }
  await budget();
  await page.reload();
  await expect(page.locator('.reading-preview p').first()).toHaveCSS('font-size', '19px');
  await page.locator('.preference-actions').getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Credits and activity', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot('account-english-390-large');
  await budget();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Credits and activity', exact: true })).toBeVisible();
  checks.push('Actual 7/90 day ranges and all kind filters; all 3 preview font sizes; font and English persist after reload');
  await budget();
  await page.goto(`${base}/subscription`);
  await expect(page.getByTestId('available-points')).toContainText(String(balance.availablePoints));
  await screenshot('legacy-balance-390');
  checks.push('Existing subscription balance route remains available');
  assert.deepEqual(errors, []);
  assert.deepEqual(mutations, []);
  const after = await audit();
  assert.deepEqual(after, before, 'Account browsing must not mutate ledger, reservations or story records');
  checks.push('11 complete table fingerprints unchanged, including ledger, holds, stories/events, memory jobs/attempts and generation requests; writes blocked after login');
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
  const containerHashes = JSON.parse((await execute('docker', ['exec', app, 'node', '--input-type=module', '-e', "import {readdirSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';const hashes={};function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){const file=path+'/'+entry.name;if(entry.isDirectory())walk(file);else if(entry.isFile())hashes[file]=createHash('sha256').update(readFileSync(file)).digest('hex')}}walk('dist');console.log(JSON.stringify(hashes))"], { maxBuffer: 4 * 1024 * 1024 })).stdout);
  assert.deepEqual(containerHashes, hashes);
  const health = {};
  for (const port of [3080, 3081, 5188]) health[port] = (await fetch(`http://127.0.0.1:${port}${port === 5188 ? '/' : '/health/ready'}`, { signal: AbortSignal.timeout(15000) })).status;
  assert.deepEqual(Object.values(health), [200, 200, 200]);
  assert.equal((await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-beta-app-1'])).stdout.trim(), historicalImage);
  const image = (await execute('docker', ['inspect', '--format', '{{.Image}}', app])).stdout.trim();
  await writeFile(`${directory}/report.json`, JSON.stringify({ result: 'passed', at: new Date().toISOString(), scope: 'Actual 3081 read-only account acceptance; no fixtures, billing writes or paid model calls; not human acceptance', checks, screenshots, errors, mutations, blockedTelemetry, comparedBuildFiles: Object.keys(hashes).length, htmlSha256: hashes['dist/client/index.html'], serverSha256: hashes['dist/server/index.js'], tablesUnchanged: tables, counts: Object.fromEntries(tables.map(table => [table, after[table].count])), memoryAttempts: work.attempts, image, historicalImage, health, paidProviderCalls: 0 }, null, 2), { mode: 0o600 });
  console.info(`PASS: ${checks.length} deployed account groups; ${directory}/report.json`);
} catch (error) {
  await writeFile(`${directory}/failure.json`, JSON.stringify({ message: error.message, errors, mutations, blockedTelemetry, tablesUnchanged: JSON.stringify(await audit()) === JSON.stringify(before) }, null, 2), { mode: 0o600 });
  throw error;
} finally { await browser.close(); }
