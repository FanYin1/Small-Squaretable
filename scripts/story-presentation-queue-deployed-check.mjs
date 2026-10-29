import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const inspectionCheck = process.argv.includes('--rule-inspection');
const directory = `backups/exploration/${inspectionCheck ? 'rule-inspection' : 'presentation-queue'}-deployed-${randomUUID()}`;
await mkdir(directory, { mode: 0o700 });
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const tables = ['characters', 'worldbooks', 'worldbook_entries', 'credit_ledger', 'credit_reservations', 'chats', 'messages', 'story_content', 'story_states', 'story_events', 'story_memory_jobs', 'story_memory_progress', 'generation_requests', 'story_adapter_jobs', 'character_presentations', 'presentation_jobs'];
async function fingerprint() {
  return JSON.parse(await query(`SELECT jsonb_object_agg(name, summary) FROM (${tables.map(table => `SELECT '${table}' AS name, jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(item)::text),'' ORDER BY md5(to_jsonb(item)::text)),''))) AS summary FROM public.${table} item`).join(' UNION ALL ')}) fingerprints`));
}
const before = await fingerprint();
let token;
let tenantId;
let csrf;
let cardId;
let browser;
const report = { result: 'started', supplierCalls: 0, screenshots: [], errors: [],
  scope: 'One synthetic private card in existing engineering test account; create/cancel/delete and optional deterministic adaptation check, not read-only or real gameplay' };
async function api(path, data, method = data ? 'POST' : 'GET') {
  const response = await fetch(`${base}/api/v1${path}`, { method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(tenantId ? { 'x-tenant-id': tenantId } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  const body = await response.json();
  return body.data ?? body;
}
try {
  const auth = await api('/auth/login', JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8')));
  token = auth.tokens.accessToken;
  tenantId = auth.user.tenantId;
  csrf = (await api('/csrf-token')).csrfToken;
  const card = await api('/characters', { name: `工程验收-自动介绍队列-${randomUUID()}`, cardData: { first_mes: '清晨你走进安静的车站，同伴递来一封等候已久的信。',
    ...(inspectionCheck ? { character_book: { entries: [{ keys: ['测试规则'], enabled: true,
      content: '每月如果余额达到100，支付10金币。随机掷骰决定结果。\n<UpdateVariable>_.add("coins", -10)</UpdateVariable>' }] } } : {}) } });
  cardId = card.id;
  const [job] = await api(`/characters/${cardId}/presentation-jobs`);
  assert.equal(job.status, 'queued');
  if (inspectionCheck) {
    await api(`/characters/${cardId}/adaptations`, { requestId: randomUUID() });
    const deadline = Date.now() + 20000;
    while (true) {
      const [task] = await api(`/characters/${cardId}/adaptations`);
      if (task.status === 'ready') {
        assert.equal(task.result.conclusion, 'unsupported');
        assert.equal(task.result.inspection.groups.length, 5);
        report.ruleInspection = { groups: task.result.inspection.groups.length, sourceRevision: task.sourceRevision };
        break;
      }
      assert.ok(Date.now() < deadline, 'Deterministic inspection did not finish');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(({ token, tenantId }) => {
    localStorage.setItem('token', token); localStorage.setItem('tenantId', tenantId);
    localStorage.setItem('locale', 'zh-CN'); localStorage.setItem('theme-preference', 'light');
  }, { token, tenantId: auth.user.tenantId });
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (request.method() === 'GET' || !url.pathname.startsWith('/api/v1/')) return route.continue();
    if (request.method() === 'POST' && url.pathname === `/api/v1/characters/${cardId}/presentation-jobs/${job.id}/cancel`) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  const panel = page.getByRole('region', { name: '介绍整理进度', exact: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(`${base}/characters/${cardId}`);
    await expect(panel).toContainText('排队不代表已经调用模型');
    await expect(page.getByRole('region', { name: '体验支持情况', exact: true }).getByText('正在核对已绑定设定与身份声明…', { exact: true })).toHaveCount(0);
    if (inspectionCheck) {
      const clues = page.getByRole('region', { name: '规则线索与依赖核对', exact: true });
      assert.equal(await clues.getAttribute('open'), null);
      await clues.locator('summary').first().click();
      await expect(clues).toContainText('文本线索不是已确认规则');
      await expect(clues).toContainText('周期与轮次线索');
      await clues.getByText('查看来源定位（最多3份）', { exact: true }).first().click();
      await expect(clues.getByRole('link', { name: '打开绑定资料', exact: true }).first()).toBeVisible();
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const name = `queue-${width}.png`;
    await page.screenshot({ path: `${directory}/${name}`, fullPage: true, animations: 'disabled' });
    report.screenshots.push(name);
  }
  await panel.getByRole('button', { name: '停止采用本次整理', exact: true }).click();
  await expect(panel).toContainText('已停止采用本次整理');
  await execute('docker', ['restart', 'squaretable-exploration-app-1']);
  const until = Date.now() + 60000;
  while (true) {
    try { if ((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(2000) })).ok) break; } catch {}
    assert.ok(Date.now() < until, 'Restart did not become ready');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await page.reload();
  await expect(panel).toContainText('已停止采用本次整理');
  const [cancelled] = await api(`/characters/${cardId}/presentation-jobs`);
  assert.equal(cancelled.status, 'cancelled');
  if (inspectionCheck) {
    const [task] = await api(`/characters/${cardId}/adaptations`);
    assert.equal(task.sourceRevision, report.ruleInspection.sourceRevision);
    assert.equal(task.result.inspection.groups.length, 5);
    await expect(page.getByRole('region', { name: '规则线索与依赖核对', exact: true })).toContainText('数值增减线索');
  }
  assert.deepEqual(report.errors, []);
  report.restartPreservedCancellation = true;
  report.result = 'passed';
} catch (error) {
  report.result = 'failed';
  report.error = error.message;
  throw error;
} finally {
  await browser?.close();
  try {
    if (cardId) await api(`/characters/${cardId}`, undefined, 'DELETE');
    assert.deepEqual(await fingerprint(), before, 'Synthetic fixture cleanup changed preexisting business rows');
    report.businessTablesUnchangedAfterCleanup = tables.length;
  } finally { await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 }); }
  console.info(`Presentation queue deployed evidence: ${directory}`);
}
