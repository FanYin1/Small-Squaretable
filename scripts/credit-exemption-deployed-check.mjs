import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { parse } from 'dotenv';
import { SignJWT } from 'jose';
import { chromium, expect } from '@playwright/test';

const userId = process.argv[2];
assert.match(userId ?? '', /^[0-9a-f-]{36}$/i);
const directory = 'backups/exploration/credit-exemption-20261028';
const configuration = parse(await readFile('.env.exploration', 'utf8'));
const execute = promisify(execFile);
const query = async statement => (await execute('docker', ['exec', 'squaretable-exploration-postgres-1', 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim();
const accounts = JSON.parse(await query(`SELECT jsonb_agg(item) FROM (SELECT id, tenant_id FROM users WHERE is_active AND (id = '${userId}' OR tenant_id <> (SELECT tenant_id FROM users WHERE id = '${userId}')) ORDER BY (id = '${userId}') DESC LIMIT 2) item`));
assert.equal(accounts[0].id, userId);
assert.equal(accounts.length, 2);
const snapshot = () => query(`SELECT jsonb_build_object('ledger', (SELECT md5(coalesce(string_agg(row_to_json(item)::text, '' ORDER BY id), '')) FROM credit_ledger item), 'reservations', (SELECT md5(coalesce(string_agg(row_to_json(item)::text, '' ORDER BY id), '')) FROM credit_reservations item))`);
const before = await snapshot();
async function token(account) {
  return new SignJWT({ userId: account.id, tenantId: account.tenant_id, type: 'access', role: 'user' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(configuration.JWT_SECRET));
}
async function balance(account) {
  const accessToken = await token(account);
  const response = await fetch('http://127.0.0.1:3081/api/v1/credits/balance', { headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(response.status, 200);
  return { accessToken, data: (await response.json()).data };
}
const target = await balance(accounts[0]);
const other = await balance(accounts[1]);
assert.equal(target.data.billingMode, 'credits');
assert.equal(target.data.unlimited, true);
assert.notEqual(other.data.unlimited, true);
const browser = await chromium.launch({ headless: true });
const errors = [];
const writes = [];
const screenshots = [];
try {
  const context = await browser.newContext();
  await context.addInitScript(({ accessToken, tenantId }) => {
    localStorage.setItem('token', accessToken);
    localStorage.setItem('tenantId', tenantId);
    localStorage.setItem('locale', 'zh-CN');
  }, { accessToken: target.accessToken, tenantId: accounts[0].tenant_id });
  await context.route('**/api/v1/**', route => {
    if (route.request().method() === 'GET') return route.continue();
    if (!route.request().url().endsWith('/analytics/vitals')) writes.push(new URL(route.request().url()).pathname);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const theme of ['light', 'dark']) {
      await page.addInitScript(value => localStorage.setItem('theme-preference', value), theme);
      await page.goto('http://127.0.0.1:3081/profile');
      await expect(page.getByTestId('account-available')).toContainText('无限');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const path = `${directory}/profile-${width}-${theme}.png`;
      await page.screenshot({ path });
      await chmod(path, 0o600);
      screenshots.push(path);
    }
  }
  await page.goto('http://127.0.0.1:3081/subscription');
  await expect(page.getByTestId('available-points')).toHaveText('无限');
  await expect(page.getByTestId('credits-rules')).toContainText('不消耗点数');
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  assert.equal(await snapshot(), before);
  await writeFile(`${directory}/deployed-report.json`, JSON.stringify({ passed: true, date: new Date().toISOString(), actualBalancePoints: target.data.balancePoints, unlimited: true, otherAccountExempt: false, screenshots, errors, writes, ledgerAndReservationsUnchanged: true, modelCalls: 0, limits: ['Not real-device or user visual acceptance', 'No provider generation was requested'] }, null, 2), { mode: 0o600 });
  console.info('PASS: live account exemption, other account unchanged, desktop/mobile light/dark balance display; no ledger/reservation changes, model calls or browser writes.');
} finally {
  await browser.close();
}
