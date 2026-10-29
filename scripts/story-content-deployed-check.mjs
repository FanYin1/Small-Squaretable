import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { checkWorldbookAuthoring } from './worldbook-authoring-check.mjs';

const execute = promisify(execFile);
const base = 'http://127.0.0.1:3081';
const evidence = `/tmp/squaretable-content-deployed-${randomUUID()}`;
await mkdir(evidence, { recursive: true, mode: 0o700 });
const credentials = JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8'));
let remaining = 100;
let reset = 0;
function observeBudget(headers) {
  if (Number(headers['x-ratelimit-limit']) !== 100) return;
  const nextReset = Number(headers['x-ratelimit-reset']);
  const nextRemaining = Number(headers['x-ratelimit-remaining']);
  remaining = nextReset > reset + 2000 ? nextRemaining : Math.min(remaining, nextRemaining);
  reset = Math.max(reset, nextReset);
}
async function waitBudget() {
  if (remaining >= 45) return;
  console.info('Waiting for normal candidate API rate limit');
  while (Date.now() < reset + 1100) await new Promise(resolve => setTimeout(resolve, 1000));
  remaining = 100;
}
const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
observeBudget(Object.fromEntries(login.headers));
const auth = (await login.json()).data;
let csrf;
async function api(path, body, method = body ? 'POST' : 'GET', expected = body ? 201 : 200) {
  await waitBudget();
  const response = await fetch(`${base}/api/v1${path}`, { method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId,
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  observeBudget(Object.fromEntries(response.headers));
  assert.equal(response.status, expected, `${method} ${path}`);
  const result = await response.json();
  return result.data ?? result;
}
csrf = (await api('/csrf-token')).csrfToken;
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = async (parts, ...values) => JSON.parse(await query(`SELECT coalesce(json_agg(result), '[]'::json) FROM (${parts.reduce((text, part, index) => text + part + (index < values.length ? literal(values[index]) : ''), '')}) result`));
const generationCount = () => query(`SELECT count(*) FROM generation_requests request JOIN chats chat ON chat.id = request.chat_id WHERE chat.user_id = ${literal(auth.user.id)}`);
const beforeGenerations = await generationCount();
const browser = await chromium.launch({ headless: true });
const checks = [];
const errors = [];
let artifacts;
let generationSends = 0;
try {
  const context = await browser.newContext();
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
  }, auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => observeBudget(response.headers()));
  page.on('websocket', socket => socket.on('framesent', frame => {
    if (JSON.parse(String(frame.payload)).type === 'user_message') generationSends++;
  }));
  artifacts = await checkWorldbookAuthoring({ page, owner: { api }, sql, base, evidence, checks });
  await writeFile('backups/exploration/acceptance-03a.json', JSON.stringify(artifacts, null, 2), { mode: 0o600 });
  const before = await api(`/worldbooks/${artifacts.bookId}/export`);
  const snapshots = () => sql`SELECT content.snapshot AS content, books.snapshot AS books FROM story_content content JOIN story_worldbooks books ON books.chat_id = content.chat_id WHERE content.chat_id IN (${artifacts.oldStoryId}, ${artifacts.newStoryId}) ORDER BY content.chat_id`;
  const beforeSnapshots = await snapshots();
  await execute('docker', ['restart', 'squaretable-exploration-app-1']);
  const deadline = Date.now() + 30000;
  while (true) {
    try { assert.equal((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) })).status, 200); break; }
    catch { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  assert.deepEqual(await api(`/worldbooks/${artifacts.bookId}/export`), before);
  assert.deepEqual(await snapshots(), beforeSnapshots);
  checks.push('Actual 3081 container restart preserves author settings, export and both frozen story snapshots');
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true });
  await writeFile(`${evidence}/failure.json`, JSON.stringify({ errors, message: error.message }, null, 2));
  console.error(`Content candidate evidence: ${evidence}`);
  throw error;
} finally { await browser.close(); }
assert.deepEqual(errors, []);
assert.equal(generationSends, 0);
assert.equal(await generationCount(), beforeGenerations);
const hashes = {};
for (const file of ['dist/server/index.js', 'dist/client/index.html']) {
  hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  assert.equal((await execute('docker', ['exec', 'squaretable-exploration-app-1', 'sha256sum', `/app/${file}`])).stdout.split(' ')[0], hashes[file]);
}
await writeFile(`${evidence}/report.json`, JSON.stringify({ passed: true, at: new Date().toISOString(), checks, artifacts, hashes,
  screenshots: ['purpose-desktop.png', 'purpose-mobile.png'], errors, generationSends, paidProviderTokens: 0,
  provider: 'not called; synthetic authoring fixtures', migrationCount: Number(await query('SELECT count(*) FROM beta_release.__drizzle_migrations')),
  image: (await execute('docker', ['inspect', '--format', '{{.Image}}', 'squaretable-exploration-app-1'])).stdout.trim() }, null, 2));
console.info(`Deployed content authoring passed: ${evidence}/report.json`);
