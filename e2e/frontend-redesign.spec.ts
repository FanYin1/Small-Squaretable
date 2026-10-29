import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { setupRedesign } from './utils/redesign-fixtures';
import { mockCommonEndpoints, mockModules, mockUnhandledApi } from './utils/helpers';

const evidence = '/tmp/squaretable-exploration-entry';
for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`production route matrix ${width} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await mkdir(evidence, { recursive: true });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await setupRedesign(page);
      await page.addInitScript(value => localStorage.setItem('theme-preference', value), theme);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const pages = [
        ['discover', '/market', '.story-card'], ['detail', '/characters/redesign-story', '.story-hero'],
        ['library', '/chat', '.library-story'], ['reader', '/chat/redesign-chat', '.greeting-bubble'],
        ['creator', '/my-characters', '.story-page-intro'], ['editor', '/characters/new', '.character-preview'],
        ['account', '/profile', '.profile-form'], ['credits', '/subscription?returnTo=/chat/redesign-chat', '.credits-ledger'],
      ];
      for (const [name, path, ready] of pages) {
        await page.goto(path);
        await expect(page.locator(ready).first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name).toBe(true);
        await expect(page.locator('main')).toHaveCount(1);
        const navigation = page.locator('.story-navigation:visible').first();
        if (['discover', 'detail', 'library'].includes(name)) {
          await expect(navigation).toHaveCSS('display', 'flex');
          const positions = await navigation.getByRole('link').evaluateAll(links => links.map(link => link.getBoundingClientRect().top));
          expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1);
        }
        if (name !== 'reader') {
          await expect(navigation.getByRole('link')).toHaveCount(4);
          await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
        }
        if (name === 'reader') {
          await expect(page.locator('.story-back')).toBeVisible();
          await expect(page.locator('.chat-sidebar-wrapper')).toHaveCount(0);
          await expect(page.locator('.reading-settings')).not.toHaveAttribute('open');
          await expect(page.locator('.bottom-tab-bar')).toHaveCount(0);
          await page.screenshot({ path: `${evidence}/${name}-${width}-${theme}.png`, fullPage: true });
          await page.locator('.reading-settings > summary').click();
          await page.getByRole('button', { name: '19px', exact: true }).click();
          await expect(page.locator('html')).toHaveAttribute('data-chat-font-size', 'large');
          await expect(page.locator('.greeting-bubble .markdown-content')).toHaveCSS('font-size', '19px');
          await expect(page.locator('.model-select')).toBeVisible();
          await page.screenshot({ path: `${evidence}/settings-${width}-${theme}.png`, fullPage: true });
        } else {
          if (name === 'credits') {
            await expect(page.locator('.plans-section')).toHaveCount(0);
            await expect(page.locator('.story-return-link')).toHaveAttribute('href', '/chat/redesign-chat');
          }
          await page.screenshot({ path: `${evidence}/${name}-${width}-${theme}.png`, fullPage: true });
        }
      }
      await page.goto('/chat?characterId=redesign-story&storyEntry=1');
      await expect(page.locator('.story-identity-page')).toBeVisible();
      await page.screenshot({ path: `${evidence}/identity-${width}-${theme}.png`, fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}

test('anonymous routes use the same brand without legacy marketing statistics', async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(evidence, { recursive: true });
  const privateRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/v1/notifications')) privateRequests.push(request.url()); });
  await mockUnhandledApi(page);
  await mockModules(page, []);
  await mockCommonEndpoints(page);
  await page.routeWebSocket(/\/ws(?:\?|$)/, () => {});
  for (const width of [390, 768, 1440]) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(value => { localStorage.setItem('theme-preference', value); localStorage.setItem('locale', 'zh-CN'); }, theme);
      for (const route of ['login', 'register']) {
        await page.goto(`/auth/${route}`);
        await expect(page.locator('.auth-story-intro')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: `${evidence}/${route}-${width}-${theme}.png`, fullPage: true });
      }
    }
  }
  await page.goto('/');
  await expect(page).toHaveURL(/\/market$/);
  await expect(page.locator('.guest-login')).toBeVisible();
  expect(privateRequests).toEqual([]);
});

for (const role of ['user', 'moderator', 'admin']) {
  test(`account navigation preserves ${role} permissions and hides disabled modules`, async ({ page }) => {
    await setupRedesign(page, role);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/profile');
    const links = page.locator('.story-shortcuts');
    await expect(links.locator('a[href="/admin/users"]')).toHaveCount(role === 'admin' ? 1 : 0);
    await expect(links.locator('a[href="/admin/content"]')).toHaveCount(role === 'moderator' ? 1 : 0);
    await expect(links.locator('a[href*="plugin"], a[href*="developer"], a[href*="analytics"]')).toHaveCount(0);
    await page.goto('/my-characters');
    await expect(page.locator('.card-actions-overlay').first()).toBeVisible();
    await expect(page.locator('.card-actions-overlay').first().getByRole('button', { name: '编辑', exact: true })).toBeVisible();
    await page.goto('/profile');
    await page.route('**/api/v1/auth/logout', route => route.fulfill({ json: { success: true } }));
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    expect(await page.evaluate(() => ['token', 'refreshToken', 'tenantId'].map(key => localStorage.getItem(key)))).toEqual([null, null, null]);
  });
}
