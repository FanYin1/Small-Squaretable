import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { checkDeployedPresentations } from './story-presentation-deployed-check.mjs';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const correctionsCheck = process.argv.includes('--corrections');
const presentationCheck = process.argv.includes('--presentation');
const adapterCheck = process.argv.includes('--adapter') || presentationCheck;
assert.ok(!(correctionsCheck && adapterCheck), 'Choose one deployed feature check');
const feature = presentationCheck ? 'presentation' : adapterCheck ? 'adapter' : correctionsCheck ? 'corrections' : 'overview';
const directory = `/tmp/squaretable-${feature}-deployed-${randomUUID()}`;
await mkdir(directory, { recursive: true, mode: 0o700 });
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const tables = ['characters', 'character_versions', 'worldbooks', 'worldbook_entries', 'credit_ledger', 'credit_reservations', 'chats', 'messages', 'story_content', 'story_worldbooks', 'story_states', 'story_events', 'story_memory_jobs', 'story_memory_progress', 'generation_requests'];
if (correctionsCheck || adapterCheck) tables.push('story_branches', 'story_readings');
if (adapterCheck) tables.push('story_adapter_jobs');
if (presentationCheck) tables.push('character_presentations', 'presentation_jobs');
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
  console.info('Read-only overview checks waiting for normal API rate limit');
  while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 1000)));
  remaining = 100;
}
function observeRateLimit(response) {
  const headers = response.headers();
  if (Number(headers['x-ratelimit-limit']) !== 100) return;
  const reset = Number(headers['x-ratelimit-reset']);
  remaining = reset > resetAt + 2000 ? Number(headers['x-ratelimit-remaining']) : Math.min(remaining, Number(headers['x-ratelimit-remaining']));
  resetAt = Math.max(resetAt, reset);
}
try {
  if (process.argv.includes('--capacity')) {
    const response = await fetch(`${base}/api/v1/llm/models`, { headers: {
      Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId,
    }, signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200);
    const model = (await response.json()).data.find(item => item.id === 'gemini-3.8-flash');
    assert.ok(model);
    assert.equal(model.provider, 'custom');
    assert.equal(model.contextWindow, 1000000);
    assert.equal(model.outputCapabilityTokens, 64000);
    assert.equal(model.maxOutputTokens, 2048);
    checks.push('Deployed authenticated model metadata confirms user-declared context 1000000, output capability 64000 and request limit 2048; local read only, no provider capacity-limit probe');
  }
  const context = await browser.newContext();
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken); localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId); localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem('theme-preference', 'dark');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin !== base) return route.abort();
    if (!new URL(request.url()).pathname.startsWith('/api/v1/') || request.method() === 'GET') return route.continue();
    if (new URL(request.url()).pathname === '/api/v1/analytics/vitals') blockedTelemetry++;
    else mutations.push({ method: request.method(), path: new URL(request.url()).pathname });
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => socket.on('framesent', frame => {
    if (JSON.parse(String(frame.payload)).type === 'user_message') mutations.push({ method: 'WebSocket', path: 'user_message' });
  }));
  page.on('response', observeRateLimit);
  async function screenshot(name) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
    screenshots.push(`${name}.png`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (presentationCheck) {
    checks.push(await checkDeployedPresentations({ browser, execute, query, base, directory, screenshots, errors, mutations, budget, observeRateLimit }));
  }
  if (adapterCheck) {
    await page.goto(`${base}/characters/${fixture.cardId}`);
    const panel = page.getByRole('region', { name: '整理与兼容检查', exact: true });
    await expect(panel.getByRole('button', { name: '检查这张卡', exact: true })).toBeEnabled();
    await expect(panel).toContainText('本次为确定性检查，不调用付费模型');
    for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await panel.scrollIntoViewIfNeeded();
      await screenshot(`adapter-detail-${width}-${theme}`);
    }
    const failureRoute = `**/api/v1/characters/${fixture.cardId}/adaptations`;
    await page.route(failureRoute, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'CHECK_UNAVAILABLE', message: '只读检查记录故障注入' } }) }));
    await page.reload();
    await expect(panel.getByRole('alert')).toBeVisible();
    await page.unroute(failureRoute);
    await panel.getByRole('button', { name: '重新读取', exact: true }).click();
    await expect(panel.getByRole('button', { name: '检查这张卡', exact: true })).toBeEnabled();
    checks.push('Actual owner detail exposes deterministic preparation in four viewport/theme combinations; read failure retries without creating a job or changing source data');
    await budget();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.goto(`${base}/chat/${fixture.storyId}`);
  if (correctionsCheck) {
    const navigation = page.getByRole('complementary', { name: '独立分支导航' });
    await expect(navigation.locator('.story-branch-family')).toContainText('原始开始');
    await navigation.getByRole('button', { name: '分支存档', exact: true }).click();
    await expect(navigation.locator('.story-branch-family')).toHaveCount(0);
    await navigation.getByRole('button', { name: '展开分支存档', exact: true }).click();
    await expect(navigation.locator('.story-branch-family')).toBeVisible();
    await page.getByRole('button', { name: '纠正与分支', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: '阅读修订内容' }).fill('本次只读核验：此文字仅在本标签页草稿，不提交。');
    await dialog.getByRole('button', { name: '预览影响', exact: true }).click();
    await expect(dialog.getByLabel('阅读修订预览')).toContainText('原始消息与模型上下文保持原文');
    await screenshot('corrections-local-preview-desktop');
    await dialog.getByRole('button', { name: '暂不修改', exact: true }).click();
    await expect(page.getByRole('button', { name: '纠正与分支', exact: true })).toBeFocused();
    await budget();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok((await page.locator('.chat-info').boundingBox()).width >= 350, 'Mobile story title needs a full row');
    assert.ok((await page.locator('.chat-info').boundingBox()).height <= 72, 'Mobile heading must not wrap vertically');
    await navigation.getByRole('button', { name: '分支存档', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '分支存档' })).toContainText('原始开始');
    await screenshot('corrections-navigation-mobile');
    assert.ok((await page.getByRole('dialog', { name: '分支存档' }).boundingBox()).x >= -1, 'Opened mobile navigation must stay onscreen');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '分支存档' })).toBeHidden();
    await expect(navigation.getByRole('button', { name: '分支存档', exact: true })).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 1000 });
    checks.push('Actual reader desktop collapse and mobile drawer/focus, local annotation preview/cancel; business writes and generation blocked');
  }
  const dossier = page.locator('.story-dossier');
  await expect(page.getByTestId('current-story-state')).toContainText('80');
  await expect(dossier.locator('.current-location')).toContainText('港口');
  for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    if (width === 390 && await dossier.locator('.dossier-toggle').getAttribute('aria-expanded') !== 'true') await dossier.locator('.dossier-toggle').click();
    await screenshot(`confirmed-${width}-${theme}`);
  }
  checks.push('Actual saved structured state and discovered location display first in four viewport/theme combinations');
  await dossier.getByRole('button', { name: '查看依据', exact: true }).click();
  await expect(dossier.getByRole('article', { name: '所选状态依据' })).toContainText('第 1 轮');
  await expect(dossier.getByRole('article', { name: '所选状态依据' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dossier.locator('.dossier-toggle')).toBeFocused();
  await dossier.locator('.dossier-toggle').click();
  await dossier.getByRole('button', { name: '概况', exact: true }).click();
  await budget();
  const stateRoute = `**/api/v1/chats/${fixture.storyId}/story-state`;
  await page.route(stateRoute, handler => handler.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'OVERVIEW_UNAVAILABLE', message: '只读概况读取故障注入' } }) }));
  await dossier.getByRole('button', { name: '重新核对记录', exact: true }).click();
  await expect(page.getByTestId('state-freshness')).toContainText('本次未更新');
  await expect(page.getByTestId('current-story-state')).toContainText('80');
  await screenshot('retained-state-mobile');
  await page.unroute(stateRoute);
  await dossier.getByRole('button', { name: '重新读取', exact: true }).click();
  await expect(page.getByTestId('state-freshness')).toHaveCount(0);
  await dossier.getByRole('button', { name: '记忆', exact: true }).click();
  await expect(dossier.getByRole('heading', { name: '我的手记' })).toBeVisible();
  checks.push('Actual old source uses direct lookup; Escape restores focus; injected read failure retains 80, actual retry restores freshness, scoped memory stays reachable');
  const literal = value => `'${String(value).replaceAll("'", "''")}'`;
  const examples = JSON.parse(await query(`SELECT coalesce(json_agg(id),'[]'::json) FROM (SELECT chats.id FROM chats JOIN story_content ON story_content.chat_id=chats.id WHERE chats.user_id=${literal(auth.user.id)} AND chats.id<>${literal(fixture.storyId)} ORDER BY (story_content.snapshot->'characters'->0->'openingRecord'->>'status'='initial-only') DESC NULLS LAST,chats.created_at DESC LIMIT 2) samples`));
  let historicalRecordsChecked = 0;
  for (let index = 0; index < examples.length; index++) {
    await budget();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/chat/${examples[index]}`);
    await expect(page.getByTestId('current-story-state')).toBeVisible();
    await expect(dossier.locator('header [role="status"]')).toContainText('已读取');
    const opening = page.getByTestId('saved-opening-record');
    if (await opening.count()) {
      await expect(opening).not.toHaveAttribute('open');
      await opening.locator(':scope > summary').click();
      await expect(opening).toContainText('不代表当前余额');
      historicalRecordsChecked++;
    }
    const report = page.getByTestId('saved-adaptation-report');
    if (await report.count()) await expect(report).not.toHaveAttribute('open');
    await screenshot(`existing-story-${index + 1}-desktop`);
    await page.setViewportSize({ width: 390, height: 844 });
    await dossier.locator('.dossier-toggle').click();
    await screenshot(`existing-story-${index + 1}-mobile`);
  }
  checks.push(`Read-only existing-save overview and collapsed material checked for ${examples.length} other saves; ${historicalRecordsChecked} saved initial-only records available`);
  assert.deepEqual(errors, []);
  assert.deepEqual(mutations, []);
  const after = await audit();
  assert.deepEqual(after, before);
  const hashes = {};
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const filename = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile()) hashes[filename] = createHash('sha256').update(await readFile(filename)).digest('hex');
    }
  }
  await walk('dist/client'); await walk('dist/server');
  const containerHashes = JSON.parse((await execute('docker', ['exec', 'squaretable-exploration-app-1', 'node', '--input-type=module', '-e', "import {readdirSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';const hashes={};function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){const file=path+'/'+entry.name;if(entry.isDirectory())walk(file);else if(entry.isFile())hashes[file]=createHash('sha256').update(readFileSync(file)).digest('hex')}}walk('dist');console.log(JSON.stringify(hashes))"], { maxBuffer: 4 * 1024 * 1024 })).stdout);
  assert.deepEqual(containerHashes, hashes);
  const health = {};
  for (const port of [3080, 3081, 5188]) health[port] = (await fetch(`http://127.0.0.1:${port}${port === 5188 ? '/' : '/health/ready'}`, { signal: AbortSignal.timeout(15000) })).status;
  assert.deepEqual(Object.values(health), [200, 200, 200]);
  assert.equal((await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-beta-app-1'])).stdout.trim(), historicalImage);
  const image = (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim();
  const migrationCount = Number(await query('SELECT count(*) FROM beta_release.__drizzle_migrations'));
  const publicTables = Number(await query("SELECT count(*) FROM pg_tables WHERE schemaname='public'"));
  if (adapterCheck) { assert.equal(migrationCount, presentationCheck ? 16 : 14); assert.equal(publicTables, presentationCheck ? 76 : 74); }
  checks.push(`${tables.length} full business table fingerprints unchanged, all deployed runtime files match local build, old service unchanged and all three ports healthy; no generation or paid call`);
  await writeFile(`${directory}/report.json`, JSON.stringify({ result: 'passed', checks, screenshots, errors, mutations, blockedTelemetry, historicalRecordsChecked, migrationCount, publicTables, comparedBuildFiles: Object.keys(hashes).length, htmlSha256: hashes['dist/client/index.html'], serverSha256: hashes['dist/server/index.js'], tablesUnchanged: tables, counts: Object.fromEntries(tables.map(table => [table, after[table].count])), memoryAttempts: work.attempts, image, historicalImage, health, paidProviderCalls: 0, scope: 'Actual 3081 read-only checks; screenshots private, not human visual acceptance' }, null, 2), { mode: 0o600 });
  console.info(`PASS: ${checks.length} deployed ${feature} groups; ${directory}/report.json`);
} catch (error) {
  await writeFile(`${directory}/failure.json`, JSON.stringify({ message: error.message, checks, errors, mutations, tablesUnchanged: JSON.stringify(await audit()) === JSON.stringify(before) }, null, 2), { mode: 0o600 });
  throw error;
} finally { await browser.close(); }
