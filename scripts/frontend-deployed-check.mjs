import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.FRONTEND_CHECK_BASE_URL || 'http://127.0.0.1:3080';
assert.match(base, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
const output = '/tmp/squaretable-r5-deployed';
await mkdir(output, { recursive: true, mode: 0o700 });
assert.equal((await fetch(`${base}/health/ready`)).status, 200);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const failures = [];
  const privateRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('/api/v1/notifications')) privateRequests.push(request.url());
  });
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/api/')) {
      failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem('theme-preference', 'dark');
  });
  await page.goto(`${base}/market`);
  await page.locator('.discovery-intro').waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('.left-sidebar .story-navigation a').count(), 4);
  await page.locator('.guest-login').waitFor();
  await page.screenshot({ path: `${output}/anonymous-market.png`, fullPage: true });
  await page.goto(`${base}/auth/login`);
  await page.locator('.auth-story-intro').waitFor();
  await page.screenshot({ path: `${output}/anonymous-login.png`, fullPage: true });
  assert.deepEqual(privateRequests, [], 'Anonymous discovery must not request private notifications');
  assert.deepEqual(failures, [], 'Anonymous API requests must succeed');
  assert.deepEqual(errors, [], 'Deployed pages must not throw');
  console.info('Unmocked deployed anonymous discovery and login passed: four navigation entries, login entry, no private notification requests, no failed API responses or page errors.');
} finally {
  await browser.close();
}
