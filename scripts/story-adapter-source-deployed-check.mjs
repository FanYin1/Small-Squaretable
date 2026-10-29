import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import { chromium, expect } from '@playwright/test';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const directory = `backups/exploration/adapter-source-deployed-${randomUUID()}`;
await mkdir(directory, { mode: 0o700 });
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const tables = ['characters', 'character_versions', 'worldbooks', 'worldbook_entries', 'credit_ledger', 'credit_reservations', 'chats', 'messages', 'story_content', 'story_worldbooks', 'story_states', 'story_events', 'story_memory_jobs', 'story_memory_progress', 'generation_requests', 'story_branches', 'story_readings', 'story_adapter_jobs', 'character_presentations', 'presentation_jobs'];
const fingerprint = async () => JSON.parse(await query(`SELECT jsonb_object_agg(name, summary) FROM (${tables.map(table => `SELECT '${table}' AS name, jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(item)::text),'' ORDER BY md5(to_jsonb(item)::text)),''))) AS summary FROM public.${table} item`).join(' UNION ALL ')}) fingerprints`));
const before = await fingerprint();
let auth;
let csrf;
let browser;
const cards = [];
const report = { result: 'started', paidCalls: 0, screenshots: [], cases: [], browserErrors: [],
  scope: 'Synthetic engineering cards, actual candidate API/detail/restart, no story creation or supplier requests; old-grant mutation tested only in isolation' };
async function api(path, data, method = data ? 'POST' : 'GET') {
  const response = await globalThis.fetch(`${base}/api/v1${path}`, { method, headers: {
    'content-type': 'application/json',
    ...(auth ? { authorization: `Bearer ${auth.tokens.accessToken}`, 'x-tenant-id': auth.user.tenantId } : {}),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
  }, ...(data ? { body: JSON.stringify(data) } : {}), signal: globalThis.AbortSignal.timeout(30000) });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  const body = await response.json();
  return body.data ?? body;
}
try {
  auth = await api('/auth/login', JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8')));
  csrf = (await api('/csrf-token')).csrfToken;
  const rules = { version: 1, fields: [{ id: 'coins', label: '测试金币', type: 'number', initial: 10, min: 0 }],
    actions: [{ id: 'pay', label: '测试支付3枚', intent: 'act', requires: [{ field: 'coins', operator: 'gte', value: 3 }],
      changes: [{ field: 'coins', operation: 'add', value: -3 }], outcome: '测试支付3枚。' }] };
  const declaration = `\u0060\u0060\u0060squaretable-rules-v1\n${JSON.stringify(rules)}\n\u0060\u0060\u0060`;
  for (const constant of [false, true]) {
    const card = await api('/characters', { name: `工程规则来源检查-${constant ? '常驻' : '关键词'}`, description: '合成检查，仅用于规则来源条件回归。',
      cardData: { first_mes: '这里是工程规则检查。', character_book: { entries: [{ keys: ['金币'], content: declaration, constant }] } } });
    cards.push(card.id);
    await writeFile(`${directory}/cleanup.json`, JSON.stringify({ cardIds: cards }), { mode: 0o600 });
    assert.ok((await api(`/characters/${card.id}/presentation-jobs`)).every(job => job.status === 'skipped'));
    await api(`/characters/${card.id}/adaptations`, { requestId: randomUUID() });
    const deadline = Date.now() + 30000;
    let job;
    while (true) {
      [job] = await api(`/characters/${card.id}/adaptations`);
      if (job.status === 'ready') break;
      assert.ok(Date.now() < deadline, 'Source check did not complete');
      await delay(1000);
    }
    assert.equal(job.current, true);
    assert.equal(job.result.reason, constant ? 'compiled' : 'conditional-source');
    assert.equal(job.result.fieldCount, constant ? 1 : 0);
    assert.equal(job.result.actionCount, constant ? 1 : 0);
    const profile = await api(`/characters/${card.id}/story-entry`);
    if (constant) {
      assert.equal(profile.rulesStatus, 'adapted');
      assert.equal(profile.initialFields[0].value, 10);
    } else {
      assert.notEqual(profile.rulesStatus, 'adapted');
      assert.deepEqual(profile.initialFields, []);
    }
    report.cases.push({ cardId: card.id, jobId: job.id, constant, reason: job.result.reason, profile });
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(({ token, tenantId }) => {
    globalThis.localStorage.setItem('token', token); globalThis.localStorage.setItem('tenantId', tenantId);
    globalThis.localStorage.setItem('locale', 'zh-CN'); globalThis.localStorage.setItem('theme-preference', 'light');
  }, { token: auth.tokens.accessToken, tenantId: auth.user.tenantId });
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base || request.method() !== 'GET' && url.pathname.startsWith('/api/v1/')) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.browserErrors.push(error.message));
  for (const scenario of report.cases) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(`${base}/characters/${scenario.cardId}`);
    const panel = page.getByRole('region', { name: '整理与兼容检查', exact: true });
    await expect(panel).toContainText(scenario.constant ? '1 项状态 · 1 项有限行动' : '不要仅为通过检查删除原有条件');
    if (!scenario.constant) await expect(panel).not.toContainText('项有限行动');
    await panel.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1));
    const filename = `adapter-source-${scenario.constant ? 'constant' : 'keyword'}-${width}.png`;
    await page.screenshot({ path: `${directory}/${filename}`, fullPage: true, animations: 'disabled' });
    report.screenshots.push(filename);
  }
  await execute('docker', ['restart', 'squaretable-exploration-app-1']);
  const deadline = Date.now() + 60000;
  while (true) {
    let ready = false;
    try { ready = (await globalThis.fetch(`${base}/health/ready`, { signal: globalThis.AbortSignal.timeout(1000) })).ok; } catch { ready = false; }
    if (ready) break;
    assert.ok(Date.now() < deadline, 'Candidate did not restart');
    await delay(500);
  }
  for (const scenario of report.cases) {
    assert.deepEqual(await api(`/characters/${scenario.cardId}/story-entry`), scenario.profile);
    const [job] = await api(`/characters/${scenario.cardId}/adaptations`);
    assert.equal(job.id, scenario.jobId);
    assert.equal(job.result.reason, scenario.reason);
  }
  assert.deepEqual(report.browserErrors, []);
  report.result = 'passed';
} finally {
  await browser?.close();
  for (const cardId of cards) await api(`/characters/${cardId}`, undefined, 'DELETE');
  report.afterCleanup = await fingerprint();
  report.before = before;
  report.businessRowsUnchanged = JSON.stringify(report.afterCleanup) === JSON.stringify(before);
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  globalThis.console.info(`Source gates deployed check: ${directory}/report.json`);
  assert.deepEqual(report.afterCleanup, before, 'Business rows changed after engineering-card cleanup');
}
