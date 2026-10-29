import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const base = 'http://127.0.0.1:3081';
const directory = 'backups/exploration/opening-feedback-20261028/deployed';
await mkdir(directory, { recursive: true, mode: 0o700 });
const credentials = JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8'));
const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
const auth = (await login.json()).data;
const headers = { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId, 'Content-Type': 'application/json' };
const csrf = await fetch(`${base}/api/v1/csrf-token`, { headers });
assert.equal(csrf.status, 200);
headers['X-CSRF-Token'] = (await csrf.json()).csrfToken;
const created = await fetch(`${base}/api/v1/characters`, { method: 'POST', headers, body: JSON.stringify({ name: `起步验收-${randomUUID()}`, cardData: {
  first_mes: '你来到一座安静的车站。站牌上留着一张便笺。', alternate_greetings: ['雨后，你走进书店，发现窗边留着一本书。'],
} }) });
assert.equal(created.status, 201);
const card = (await created.json()).data;
const browser = await chromium.launch({ headless: true });
const errors = [];
const sent = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => socket.on('framesent', frame => {
    const payload = String(frame.payload);
    if (payload.includes('user_message')) sent.push('user_message');
  }));
  await page.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  await page.goto(`${base}/chat?characterId=${card.id}&storyEntry=quick`);
  await page.locator('[data-opening="1"]').click();
  await page.getByTestId('opening-start').click();
  await page.waitForURL(/\/chat\/[a-f\d-]+$/);
  await expect(page.locator('.message-assistant').first()).toContainText('书店');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.opening-suggestions button')).toHaveCount(3);
    await expect(page.locator('.opening-suggestions button').first()).toBeEnabled();
    for (const button of await page.locator('.opening-suggestions button').all()) await expect(button).toBeInViewport();
    assert.ok((await page.locator('.opening-suggestions').boundingBox()).height < 180);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${directory}/opening-${width}.png`, fullPage: true });
  }
  await page.reload();
  await expect(page.locator('.opening-suggestions')).toBeVisible();
  assert.deepEqual(errors, []);
  assert.deepEqual(sent, []);
  await writeFile(`${directory}/report.json`, JSON.stringify({ result: 'passed', checks: ['Actual alternate opening chosen and saved', 'Three enabled starter suggestions at mobile/desktop widths', 'Reload retains unplayed opening suggestions'], errors, paidProviderCalls: 0,
    scope: 'Synthetic private card/story in engineering account; no generation sent; no real-device or narrative quality signoff' }, null, 2), { mode: 0o600 });
  console.info('PASS: deployed selected opening exposes starter suggestions, no generation sent');
} finally { await browser.close(); }
