import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const execute = promisify(execFile);
const openingModes = process.argv.includes('--opening-modes');
const base = 'http://127.0.0.1:3081';
const directory = `backups/exploration/${openingModes ? 'opening-mode' : 'ritual'}-deployed-${randomUUID()}`;
await mkdir(directory, { mode: 0o700 });
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const tables = ['characters', 'worldbooks', 'worldbook_entries', 'credit_ledger', 'credit_reservations', 'chats', 'messages', 'story_content', 'story_states', 'story_events', 'story_memory_jobs', 'story_memory_progress', 'generation_requests', 'story_adapter_jobs', 'character_presentations', 'presentation_jobs'];
async function fingerprint() {
  return JSON.parse(await query(`SELECT jsonb_object_agg(name, summary) FROM (${tables.map(table => `SELECT '${table}' AS name, jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(item)::text),'' ORDER BY md5(to_jsonb(item)::text)),''))) AS summary FROM public.${table} item`).join(' UNION ALL ')}) fingerprints`));
}
const before = await fingerprint();
let auth;
let csrf;
let cardId;
let browser;
const report = { result: 'started', supplierCalls: 0, screenshots: [], errors: [],
  scope: 'Original PNG imported privately into engineering account, deterministic compilation/detail/restart; no story creation, narration, personal points or human acceptance' };
async function api(path, data, method = data ? 'POST' : 'GET') {
  const form = data instanceof FormData;
  const response = await fetch(`${base}/api/v1${path}`, { method,
    headers: { ...(!form ? { 'content-type': 'application/json' } : {}),
      ...(auth ? { authorization: `Bearer ${auth.tokens.accessToken}`, 'x-tenant-id': auth.user.tenantId } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    ...(data ? { body: form ? data : JSON.stringify(data) } : {}), signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  const body = await response.json();
  return body.data ?? body;
}
try {
  auth = await api('/auth/login', JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8')));
  csrf = (await api('/csrf-token')).csrfToken;
  const file = openingModes
    ? process.env.OPENING_MODE_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/已分类/2025年3月前/正常向(不分类)/sans.png'
    : process.env.RITUAL_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/未分类/2025年3月前/kakaa.png';
  const bytes = await readFile(file);
  report.sampleDigest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(report.sampleDigest, openingModes ? '297188b16b6fe4754ca4d9595711b6b67eae46595110f68b0703fd47ca8c1e19' : 'f11040eeb4ac883009ebb51cb9d3b1a2702f36da19d3b9a9600aa218d57c411e');
  const body = new FormData();
  body.append('files', new Blob([bytes], { type: 'image/png' }), openingModes ? 'sans.png' : 'kakaa.png');
  const imported = await api('/characters/import/batch', body);
  assert.equal(imported.failed.length, 0);
  cardId = imported.imported[0].id;
  await writeFile(`${directory}/cleanup.json`, JSON.stringify({ cardId }), { mode: 0o600 });
  for (const task of await api(`/characters/${cardId}/presentation-jobs`)) {
    assert.ok(['queued', 'skipped'].includes(task.status));
    if (task.status === 'queued') await api(`/characters/${cardId}/presentation-jobs/${task.id}/cancel`, {});
  }
  await api(`/characters/${cardId}/adaptations`, { requestId: randomUUID() });
  const deadline = Date.now() + 30000;
  while (true) {
    const [task] = await api(`/characters/${cardId}/adaptations`);
    if (task.status === 'ready') {
      assert.equal(task.result.reason, openingModes ? 'reviewed-opening-mode' : 'reviewed-ritual');
      assert.equal(task.result.fieldCount, openingModes ? 3 : 2);
      assert.equal(task.result.actionCount, openingModes ? 2 : 0);
      report.jobId = task.id;
      break;
    }
    assert.ok(Date.now() < deadline, 'Reviewed check did not finish');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const profile = await api(`/characters/${cardId}/story-entry`);
  assert.equal(profile.rulesStatus, 'adapted');
  assert.equal(profile.initialFields[0].value, openingModes ? '未选择' : 0);
  assert.equal(profile.initialFields.length, 1);
  if (openingModes) {
    assert.deepEqual(profile.openings.map(opening => opening.kind), ['directory', 'narrative']);
    assert.equal(profile.openings[1].adaptationReport.ruleScope, 'sans-opening-modes-v1');
  } else assert.equal(profile.openings[0].adaptationReport.turnEffect, 'kakaa-ritual-v2');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(({ token, tenantId }) => {
    localStorage.setItem('token', token); localStorage.setItem('tenantId', tenantId);
    localStorage.setItem('locale', 'zh-CN'); localStorage.setItem('theme-preference', 'light');
  }, { token: auth.tokens.accessToken, tenantId: auth.user.tenantId });
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base || request.method() !== 'GET' && url.pathname.startsWith('/api/v1/')) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(`${base}/characters/${cardId}`);
    const panel = page.getByRole('region', { name: '整理与兼容检查', exact: true });
    await expect(panel).toContainText(openingModes ? '3 项状态 · 2 项有限行动 · 1 份来源' : '2 项状态 · 0 项有限行动 · 1 份来源');
    if (openingModes) {
      await expect(panel).toContainText('首次模式选择');
      await expect(page.getByTestId('story-opening')).toContainText(profile.openings[1].preview);
      await expect(page.getByTestId('story-opening')).not.toContainText('本角色卡分享于以下');
    } else await expect(page.getByRole('region', { name: '体验支持情况', exact: true })).toContainText('本次没有新增规则行动或地图');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const name = `${openingModes ? 'opening-mode' : 'ritual'}-detail-${width}.png`;
    await page.screenshot({ path: `${directory}/${name}`, fullPage: true, animations: 'disabled' });
    report.screenshots.push(name);
  }
  await execute('docker', ['restart', 'squaretable-exploration-app-1']);
  const until = Date.now() + 60000;
  while (true) {
    try { if ((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
    assert.ok(Date.now() < until, 'Candidate failed to restart');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.deepEqual(await api(`/characters/${cardId}/story-entry`), profile);
  assert.equal((await api(`/characters/${cardId}/adaptations`))[0].id, report.jobId);
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
} finally {
  await browser?.close();
  if (cardId) await api(`/characters/${cardId}`, undefined, 'DELETE');
  report.afterCleanup = await fingerprint();
  report.before = before;
  report.businessRowsUnchanged = JSON.stringify(report.afterCleanup) === JSON.stringify(before);
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.info(`Reviewed ${openingModes ? 'opening mode' : 'ritual'} deployed check: ${directory}/report.json`);
  assert.deepEqual(report.afterCleanup, before, 'Existing business rows changed after test-card cleanup');
}
