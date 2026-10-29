import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { parseCharacterFile } from '../src/types/character-card-import.ts';
import { chromium, expect } from '@playwright/test';

const base = 'http://127.0.0.1:3081';
const directory = `backups/exploration/azure-opening-${randomUUID()}`;
await mkdir(directory, { recursive: true, mode: 0o700 });
const credentials = JSON.parse(await readFile('backups/exploration/acceptance-account.json', 'utf8'));
const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
assert.equal(login.status, 200);
const auth = (await login.json()).data;
const headers = { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId, 'Content-Type': 'application/json' };
const csrf = await fetch(`${base}/api/v1/csrf-token`, { headers });
assert.equal(csrf.status, 200);
headers['X-CSRF-Token'] = (await csrf.json()).csrfToken;
const bytes = await readFile('backups/exploration/presentation-adoption-20261027/azure.png');
const parsed = await parseCharacterFile(bytes);
const created = await fetch(`${base}/api/v1/characters`, { method: 'POST', headers, body: JSON.stringify(parsed.character) });
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
  await page.goto(`${base}/my-characters`);
  await page.locator('.private-story-card').filter({ has: page.getByRole('button', { name: `查看故事: ${card.name}`, exact: true }) }).first().locator('.private-story-enter').click();
  await page.locator('[data-opening="1"]').click();
  await page.getByTestId('opening-start').click();
  await page.waitForURL(/\/chat\/[a-f\d-]+$/);
  await expect(page.locator('.message-assistant').first()).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${directory}/before.png`, fullPage: true });
  const storyId = new URL(page.url()).pathname.split('/').at(-1);
  const stateResponse = await fetch(`${base}/api/v1/chats/${storyId}/story-state`, { headers });
  const state = await stateResponse.json();
  await writeFile(`${directory}/diagnostic.json`, JSON.stringify({errors, status: stateResponse.status, state: state.data ? {version: state.data.version, actionCount:state.data.actions.length} : state, suggestions: await page.locator('.opening-suggestions').count(), url:page.url()},null,2));
  console.info('Diagnostic:', directory);
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
  await writeFile(`${directory}/report.json`, JSON.stringify({ result: 'passed', sourceSha256: createHash('sha256').update(bytes).digest('hex'), checks: ['Azure card imported into engineering account and entered through private library', 'Actual alternate opening chosen and saved', 'Three enabled starter suggestions at mobile/desktop widths', 'Reload retains unplayed opening suggestions'], errors, paidProviderCalls: 0,
    scope: 'User-provided Azure card copied into engineering account; no generation sent or user story modified; does not establish why the user tab has no suggestions' }, null, 2), { mode: 0o600 });
  console.info(`PASS: Azure private library opening exposes starter suggestions; ${directory}`);
} catch (error) {
  await writeFile(`${directory}/failure.json`, JSON.stringify({ message: error.message, errors }, null, 2), { mode: 0o600 });
  throw error;
} finally { await browser.close(); }
