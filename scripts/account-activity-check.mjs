import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

export async function checkAccountActivity({ browser, base, sql, getStreamCount }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = `/tmp/squaretable-account-evidence/${randomUUID()}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const initialStreams = getStreamCount();
  const checks = [];
  const screenshots = [];
  const errors = [];
  let remaining = 100;
  let resetAt = 0;
  function observe(headers) {
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const nextReset = Number(headers['x-ratelimit-reset']);
    remaining = nextReset > resetAt + 2000 ? Number(headers['x-ratelimit-remaining']) : Math.min(remaining, Number(headers['x-ratelimit-remaining']));
    resetAt = Math.max(resetAt, nextReset);
  }
  async function budget() {
    if (remaining >= 30) return;
    console.info('Account checks waiting for the normal rate-limit window');
    while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 30000)));
    remaining = 100;
  }
  let auth;
  async function api(path, body, expected = 200, identity = auth) {
    await budget();
    const response = await fetch(`${base}/api/v1${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(identity ? { Authorization: `Bearer ${identity.tokens.accessToken}`, 'X-Tenant-ID': identity.user.tenantId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    observe(Object.fromEntries(response.headers));
    assert.equal(response.status, expected, path);
    const result = await response.json();
    return result.data ?? result;
  }
  async function register() {
    const invite = `ACCOUNT-${randomUUID()}`.toUpperCase();
    await sql`INSERT INTO invite_codes (code, max_uses) VALUES (${invite}, 1)`;
    return api('/auth/register', { email: `${randomUUID()}@example.test`, password: randomBytes(24).toString('hex'), ageConfirmed: true, inviteCode: invite }, 201, null);
  }
  auth = await register();
  const other = await register();
  const start = new Date(Date.now() - 86400000);
  const end = new Date(Date.now() - 3600000);
  const inside = new Date(start.getTime() + 3600000);
  const range = { from: start.toISOString(), to: end.toISOString() };
  const query = new URLSearchParams(range);
  const tenantId = auth.user.tenantId;
  const originalCredit = randomUUID();
  const entries = [
    { id: originalCredit, kind: 'topup', amount: 500000, at: start, metadata: { secret: 'PRIVATE_METADATA' } },
    { kind: 'charge', amount: -300, at: inside, metadata: { inputTokens: 100, outputTokens: 200 } },
    { kind: 'charge', amount: -100, at: inside, metadata: {} },
    { kind: 'charge', amount: -100, at: inside, metadata: { inputTokens: 0, outputTokens: 0 } },
    { kind: 'charge', amount: -100, at: inside, metadata: { inputTokens: '30', outputTokens: 40 } },
    { kind: 'charge', amount: -100, at: inside, metadata: { inputTokens: -1, outputTokens: 40 } },
    { kind: 'charge', amount: -100, at: inside, metadata: { inputTokens: 1.5, outputTokens: 40 } },
    { kind: 'charge', amount: -100, at: inside, metadata: { inputTokens: 9007199254740992, outputTokens: 40 } },
    { kind: 'charge', amount: -100, at: inside, metadata: { inputTokens: 10 } },
    { kind: 'charge', amount: -100, at: inside, metadata: [] },
    { kind: 'charge', amount: -100, at: inside, metadata: null },
    { kind: 'charge', amount: -100, at: inside, metadata: { inputTokens: 10, outputTokens: 20 } },
    { kind: 'reversal', amount: -500000, at: inside, metadata: { inputTokens: 99999, outputTokens: 99999 } },
    { kind: 'topup', amount: 70000, at: end, metadata: {} },
    { kind: 'topup', amount: 90000, at: new Date(start.getTime() - 1), metadata: {} },
  ];
  for (const entry of entries) await sql`INSERT INTO credit_ledger (id, tenant_id, kind, amount, metadata, created_at, note, idempotency_key, operator_id, reverses_id)
    VALUES (${entry.id ?? randomUUID()}, ${tenantId}, ${entry.kind}, ${entry.amount}, ${entry.metadata === null ? sql`'null'::jsonb` : sql.json(entry.metadata)}, ${entry.at}, 'PRIVATE_NOTE', ${randomUUID()}, ${auth.user.id}, ${entry.kind === 'reversal' ? originalCredit : null})`;
  await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${other.user.tenantId}, 'topup', 999999)`;
  await sql`INSERT INTO credit_reservations (tenant_id, tokens, expires_at) VALUES (${tenantId}, 2000, now() + interval '1 hour')`;
  const audit = async () => (await sql`SELECT md5(string_agg(row_to_json(ledger)::text, '' ORDER BY id)) AS digest FROM credit_ledger ledger`)[0].digest;
  const before = await audit();
  const activity = await api(`/credits/activity?${query}&tenantId=${other.user.tenantId}`);
  assert.deepEqual(activity, { ...range, spentPoints: 0.13, creditedPoints: 50, adjustmentPoints: -50, chargeCount: 11, knownUsageCount: 3, unknownUsageCount: 8, inputTokens: 110, outputTokens: 220 });
  checks.push('Real SQL aggregate: start included/end excluded, all 11 charges, 3 known usage records, malformed metadata unknown, reversals do not inflate usage, forged tenant ignored');
  const emptyRange = new URLSearchParams({ from: '2020-01-01T00:00:00Z', to: '2020-01-02T00:00:00Z' });
  assert.deepEqual(await api(`/credits/activity?${emptyRange}`), { from: '2020-01-01T00:00:00Z', to: '2020-01-02T00:00:00Z', spentPoints: 0, creditedPoints: 0, adjustmentPoints: 0, chargeCount: 0, knownUsageCount: 0, unknownUsageCount: 0, inputTokens: null, outputTokens: null });
  const otherActivity = await api(`/credits/activity?${query}`, undefined, 200, other);
  assert.equal(otherActivity.creditedPoints, 0);
  await api(`/credits/activity?${query}`, undefined, 401, null);
  for (const suffix of ['from=invalid&to=invalid', 'from=2026-01-01T00:00:00Z', 'from=2024-01-01T00:00:00Z&to=2026-01-01T00:00:00Z']) await api(`/credits/activity?${suffix}`, undefined, 400);
  checks.push('Empty range has zero financial activity and unknown usage; unauthenticated/invalid queries rejected; second tenant isolated');
  const first = await api(`/credits/ledger?${query}&kind=charge&limit=10`);
  const second = await api(`/credits/ledger?${query}&kind=charge&limit=10&page=2`);
  assert.equal(first.pagination.total, 11);
  assert.equal(first.items.length, 10);
  assert.equal(second.items.length, 1);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 11);
  assert.equal(first.pagination.hasNext, true);
  assert.equal(second.pagination.hasPrev, true);
  const listing = [...first.items, ...second.items];
  assert.equal(listing.filter(item => item.inputTokens !== undefined).length, 3);
  assert.ok(listing.every(item => item.kind === 'charge'));
  for (const item of listing) assert.deepEqual(Object.keys(item).sort(), ['id', 'kind', 'tokens', 'points', 'chatId', 'messageId', 'createdAt', ...(item.inputTokens === undefined ? [] : ['inputTokens', 'outputTokens'])].sort());
  const topups = await api(`/credits/ledger?${query}&kind=topup`);
  assert.equal(topups.items.length, 1);
  assert.equal(topups.items[0].points, 50);
  assert.ok(!JSON.stringify(topups).includes('PRIVATE_'));
  checks.push('Stable pagination across identical timestamps, filters and public field allowlist; no operator/notes/raw metadata returned');
  const balance = await api('/credits/balance');
  assert.equal(balance.heldTokens, 2000);
  assert.equal(balance.availablePoints, 15.67);
  const context = await browser.newContext();
  try {
    await context.addInitScript(({ tokens, user }) => {
      localStorage.setItem('token', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      localStorage.setItem('tenantId', user.tenantId);
      if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'zh-CN');
    }, auth);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => observe(response.headers()));
    async function screenshot(name) {
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} horizontal overflow`);
      await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
      screenshots.push(`${name}.png`);
    }
    for (const width of [390, 1440]) {
      await budget();
      await page.setViewportSize({ width, height: 950 });
      await page.goto(`${base}/profile`);
      await expect(page.getByTestId('account-available')).toContainText('15.67');
      await expect(page.getByTestId('recorded-usage')).toContainText('3 / 11');
      await expect(page.locator('.activity-ledger li')).toHaveCount(10);
      for (const theme of ['dark', 'light']) {
        await page.locator('.preference-actions').getByRole('button', { name: theme === 'dark' ? '深色' : '浅色', exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await screenshot(`account-${width}-${theme}`);
      }
    }
    await page.getByTestId('ledger-kind').selectOption('charge');
    await expect(page.locator('.activity-ledger li')).toHaveCount(10);
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(page.locator('.activity-ledger li')).toHaveCount(1);
    await expect(page.getByTestId('recorded-usage')).toContainText('3 / 11');
    await page.locator('#account-period').selectOption('7');
    await expect(page.locator('.activity-ledger li')).toHaveCount(10);
    await page.getByTestId('ledger-kind').selectOption('reversal');
    await expect(page.locator('.activity-ledger li')).toHaveCount(1);
    await screenshot('filtered-reversal');
    checks.push('Real browser 390/1440 dark/light, filtered pagination and range reset; whole-period summary unaffected by page/type');
    for (const size of [15, 17, 19]) {
      await page.getByRole('button', { name: `${size}px`, exact: true }).click();
      await expect(page.locator('.reading-preview p').first()).toHaveCSS('font-size', `${size}px`);
    }
    await page.reload();
    await expect(page.locator('.reading-preview p').first()).toHaveCSS('font-size', '19px');
    await page.locator('.preference-actions').getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Credits and activity', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot('account-mobile-english-large');
    checks.push('All three actual CSS font sizes previewed, preference survives reload, English at mobile width');

    for (const [endpoint, label] of [['activity', 'The period summary could not be loaded.'], ['ledger', 'Activity could not be loaded.'], ['balance', '']]) {
      const pattern = `**/api/v1/credits/${endpoint}*`;
      await page.route(pattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'isolated failure' } }) }));
      await budget();
      await page.reload();
      await expect(page.locator('.account-activity [role="alert"]')).toBeVisible();
      if (label) await expect(page.locator('.account-activity [role="alert"]')).toContainText(label);
      if (endpoint === 'balance') await expect(page.getByTestId('account-available')).toHaveCount(0);
      await screenshot(`injected-${endpoint}-failure`);
      await page.unroute(pattern);
      await page.locator('.account-activity [role="alert"] button').click();
      await expect(page.locator('.account-activity [role="alert"]')).toHaveCount(0);
      await expect(page.getByTestId('account-available')).toContainText('15.67');
    }
    await page.route('**/api/v1/credits/balance', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...balance, billingMode: 'subscription' } }) }));
    await budget();
    await page.reload();
    await expect(page.locator('.subscription-mode')).toBeVisible();
    await expect(page.getByTestId('account-available')).toHaveCount(0);
    await expect(page.locator('.activity-ledger')).toHaveCount(0);
    await screenshot('injected-subscription-mode');
    checks.push('Injected HTTP failures for balance/summary/ledger recover independently; injected subscription mode hides credits; these cases are fixtures');
  } finally { await context.close(); }
  assert.deepEqual(errors, []);
  assert.equal(await audit(), before);
  assert.equal(getStreamCount(), initialStreams);
  checks.push('Account package changes no ledger rows and invokes no model streams');
  await writeFile(`${directory}/report.json`, JSON.stringify({ at: new Date().toISOString(), result: 'passed', checks, screenshots, errors, modelStreamsDuringAccountCheck: 0, scope: 'Disposable real PostgreSQL + HTTP + production browser; injected failure/subscription cases labelled separately' }, null, 2), { mode: 0o600 });
  console.info(`PASS: ${checks.length} account checks; ${directory}/report.json`);
}
