import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const evidence = `/tmp/squaretable-07ac-deployed-${randomUUID()}`;
await mkdir(evidence, { recursive: true, mode: 0o700 });
const credentials = JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8'));
const fixture = JSON.parse(await readFile('backups/exploration/acceptance-04ab-safe.json', 'utf8'));
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const audit = () => query("SELECT json_build_object('jobs',count(*),'attempts',coalesce(sum(attempts),0),'running',count(*) FILTER (WHERE status='running'),'due',count(*) FILTER (WHERE status IN ('pending','retry','running') AND available_at <= now()),'generationRequests',(SELECT count(*) FROM generation_requests)) FROM story_memory_jobs");
const before = await audit();
assert.equal(JSON.parse(before).running, 0, 'Candidate verification requires no in-flight memory jobs');
assert.equal(JSON.parse(before).due, 0, 'Candidate verification requires no due memory jobs');
const response = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(response.status, 200);
const auth = (await response.json()).data;
const browser = await chromium.launch({ headless: true });
const errors = [];
const mutations = [];
const blockedTelemetry = [];
const screenshots = [];
let remaining = 100;
let resetAt = 0;
try {
  const context = await browser.newContext();
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
  }, auth);
  await context.route('**/api/v1/**', route => {
    if (route.request().method() === 'GET') return route.continue();
    const request = { method: route.request().method(), path: new URL(route.request().url()).pathname };
    if (request.method === 'POST' && request.path === '/api/v1/analytics/vitals') blockedTelemetry.push(request);
    else mutations.push(request);
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
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [name, path, selector] of [
      ['create', '/characters/new', '.editor-container'],
      ['edit', `/characters/${fixture.cardId}/edit`, '[data-testid="editor-save-status"]'],
      ['works', '/my-characters', '.characters-section'],
      ['account', '/profile', '.profile-form'],
      ['balance', '/subscription', '[data-testid="available-points"]'],
    ]) {
      if (remaining < 45) {
        console.info('Read-only candidate checks waiting for normal API rate limit');
        while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 30000)));
        remaining = 100;
      }
      await page.goto(`${base}${path}`);
      await page.locator(selector).waitFor();
      if (name === 'edit') await expect(page.getByTestId('editor-save-status')).toContainText('已从服务端载入');
      if (name === 'create') await expect(page.getByTestId('editor-save-status')).toContainText('尚未保存');
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const filename = `${name}-${width}.png`;
      await page.screenshot({ path: `${evidence}/${filename}`, fullPage: true, animations: 'disabled' });
      screenshots.push(filename);
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(mutations, [], 'Read-only page checks must not submit data or generate');
  assert.equal(await audit(), before, 'No new generation or memory jobs/attempts during candidate page checks');
  const hashes = {};
  for (const file of ['dist/server/index.js', 'dist/client/index.html']) {
    hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
    assert.equal((await execute('docker', ['exec', 'squaretable-exploration-app-1', 'sha256sum', `/app/${file}`])).stdout.split(' ')[0], hashes[file]);
  }
  const health = {};
  for (const port of [3080, 3081, 5188]) health[port] = (await fetch(`http://127.0.0.1:${port}${port === 5188 ? '/' : '/health/ready'}`)).status;
  assert.deepEqual(Object.values(health), [200, 200, 200]);
  await writeFile(`${evidence}/report.json`, JSON.stringify({ result: 'passed', at: new Date().toISOString(), scope: 'actual candidate read-only pages; no import, publish, checkout or generation executed here', screenshots, hashes, mutations, blockedTelemetry, jobAudit: { before: JSON.parse(before), after: JSON.parse(await audit()) }, health, image: (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim() }, null, 2));
  console.info(`PASS: read-only candidate pages; ${evidence}/report.json`);
} catch (error) {
  await writeFile(`${evidence}/failure.json`, JSON.stringify({ message: error.message, errors, mutations, blockedTelemetry, jobAudit: { before: JSON.parse(before), after: JSON.parse(await audit()) } }, null, 2));
  throw error;
} finally { await browser.close(); }
