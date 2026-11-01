import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const base = 'http://47.116.114.103';
const auth = JSON.parse(await readFile('/var/aichat/Small-Squaretable/backups/exploration/remote-verification-20261030/auth.private.json', 'utf8'));
const detailPath = '/characters/b45bf0e3-85c9-444e-aec5-10eb58e56a82';
const chatPath = '/chat/f1e32cd3-a9d4-460c-aecf-315bbe706f81';
const entryPath = `/chat?characterId=b45bf0e3-85c9-444e-aec5-10eb58e56a82&storyEntry=quick`;
const results = [];
const errors = [];
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-proxy-server'] });

async function newContext(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript((value) => {
    localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem('token', value.tokens.accessToken);
    localStorage.setItem('refreshToken', value.tokens.refreshToken);
    localStorage.setItem('tenantId', value.user.tenantId);
  }, auth);
  return context;
}

async function visit(page, path, selector, count) {
  const start = Date.now();
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.locator('.paper-workbench')).toBeVisible({ timeout: 60000 });
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 60000 });
  if (count !== undefined) await expect(page.locator(selector)).toHaveCount(count, { timeout: 60000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  results.push({ path, visibleMs: Date.now() - start, count: await page.locator(selector).count() });
}

try {
  for (const width of [1440, 390]) {
    const context = await newContext(width);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ width, type: 'pageerror', message: error.message }));
    page.on('requestfailed', request => {
      const message = request.failure()?.errorText;
      if (message !== 'net::ERR_ABORTED') errors.push({ width, type: 'requestfailed', path: new URL(request.url()).pathname, message });
    });

    await visit(page, '/market', '.paper-workbench');
    const sidebar = page.locator('.workbench-sidebar');
    if (width >= 760) {
      await expect(sidebar).toBeVisible();
      const sidebarWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width);
      expect(sidebarWidth).toBeGreaterThan(200);
      expect(sidebarWidth).toBeLessThan(240);
      const toggle = page.locator('.workbench-topbar .workbench-icon').first();
      await toggle.click();
      await expect(page.locator('.paper-workbench')).toHaveClass(/workbench-collapsed/);
      expect(await page.evaluate(() => localStorage.getItem('squaretable:workbench:collapsed'))).toBe('true');
      await page.goto(base + '/my-characters', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await expect(page.locator('.private-story-card').first()).toBeVisible({ timeout: 60000 });
      await expect(page.locator('.paper-workbench')).toHaveClass(/workbench-collapsed/);
      results.push({ width, check: 'desktop sidebar state persists across routes' });
    } else {
      const toggle = page.locator('.workbench-topbar .workbench-icon').first();
      await toggle.click();
      await expect(page.locator('.paper-workbench')).toHaveClass(/navigation-open/);
      await expect(page.locator('.workbench-backdrop')).toBeVisible();
      expect(await page.locator('.workbench-body').getAttribute('inert')).not.toBeNull();
      await page.keyboard.press('Escape');
      await expect(page.locator('.paper-workbench')).not.toHaveClass(/navigation-open/);
      await expect(toggle).toBeFocused();
      results.push({ width, check: 'mobile drawer backdrop, inert body, Escape and focus restoration' });
    }

    await visit(page, '/chat', '.library-story');
    await visit(page, entryPath, '[data-opening]', 10);
    await visit(page, detailPath, '.story-opening');
    await visit(page, chatPath, '.chat-window');
    await expect(page.locator('.turn-recommendations .story-action-choice')).toHaveCount(3, { timeout: 60000 });
    await expect(page.locator('.turn-recommendations .story-action-choice').first()).toBeVisible();
    const dossierTrigger = page.locator('.dossier-open-button');
    if (await dossierTrigger.count()) {
      await dossierTrigger.click();
      await expect(page.locator('.story-dossier[role="dialog"]')).toBeVisible({ timeout: 30000 });
      await page.keyboard.press('Escape');
      await expect(page.locator('.story-dossier[role="dialog"]')).toHaveCount(0);
      results.push({ width, check: 'story dossier overlay opens and closes without affecting reader' });
    }
    await context.close();
  }
  expect(errors).toEqual([]);
} finally {
  await writeFile('/tmp/squaretable-workbench-paper-20261031-browser-report.json', JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ results, errors }, null, 2));
