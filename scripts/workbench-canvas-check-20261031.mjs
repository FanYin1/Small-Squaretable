import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base = process.env.CANVAS_CHECK_BASE || 'http://127.0.0.1:5192';
const output = process.env.CANVAS_CHECK_OUTPUT || 'backups/exploration/workbench-canvas-20261031/local';
await mkdir(output, { recursive: true });
const auth = JSON.parse(await readFile('backups/exploration/workbench-canvas-20261031/auth.private.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chromium', args: ['--no-proxy-server'] });
const report = { base, results: [], errors: [] };
let nextApiRequestAt = 0;
const chatPath = '/chat/f1e32cd3-a9d4-460c-aecf-315bbe706f81';
try {
  for (const width of (process.env.CANVAS_CHECK_WIDTHS || '1920,1440,768,390').split(',').map(Number)) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    // Four full journeys share one production IP; stay below the API's 100/minute limit.
    await context.route('**/api/**', async route => {
      const scheduled = Math.max(Date.now(), nextApiRequestAt);
      nextApiRequestAt = scheduled + 800;
      await new Promise(resolve => setTimeout(resolve, scheduled - Date.now()));
      await route.continue();
    });
    await context.addInitScript(v => {
      const entries = { token: v.tokens.accessToken, refreshToken: v.tokens.refreshToken, tenantId: v.user.tenantId, locale: 'zh-CN', 'theme-preference': 'light',
        ['story-onboarding:v1:' + JSON.stringify([v.user.tenantId, v.user.id])]: 'done' };
      for (const [k, value] of Object.entries(entries)) localStorage.setItem(k, value);
    }, auth);
    const page = await context.newPage();
    page.on('response', response => { if(response.status() >= 400) { const error = {width, path: new URL(response.url()).pathname, status:response.status()}; console.log(JSON.stringify(error)); report.errors.push(error); } });
    page.on('pageerror', error => report.errors.push({ width, message: error.message }));
    page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') report.errors.push({ width, path: new URL(request.url()).pathname, message: request.failure()?.errorText }); });
    await page.goto(base + chatPath, { waitUntil: 'domcontentloaded' });
    const recommendations = page.locator('.turn-recommendations .story-action-choice');
    await expect(recommendations).toHaveCount(3, { timeout: 60000 });
    await expect(page.locator('.input-wrapper')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('.workbench-topbar')).toHaveCount(0);
    await expect(page.locator('.story-branch-navigation')).toHaveCount(0);
    const dimensions = await page.evaluate(() => Object.fromEntries(['.chat-header', '.chat-messages', '.messages-list', '.chat-input-container', '.input-wrapper', '.workbench-main'].map(selector => {
      const r = document.querySelector(selector).getBoundingClientRect(); return [selector, { x: r.x, y: r.y, width: r.width, height: r.height }];
    })));
    console.log(JSON.stringify({ width, dimensions }));
    expect(dimensions['.chat-header'].height).toBeLessThanOrEqual(68);
    expect(dimensions['.chat-messages'].height).toBeGreaterThan(600);
    expect(dimensions['.input-wrapper'].width).toBeGreaterThan(width < 760 ? width - 60 : dimensions['.chat-header'].width * 0.8);
    if (width < 760) expect(dimensions['.workbench-main'].width).toBe(width);
    expect(Math.abs(dimensions['.messages-list'].width - dimensions['.input-wrapper'].width)).toBeLessThan(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const recommendationBounds = await page.locator('.turn-recommendations').evaluate(el => { const list = el.querySelector('ul').getBoundingClientRect(); const hint = el.querySelector('p').getBoundingClientRect(); return { listBottom: list.bottom, hintTop: hint.top }; });
    expect(recommendationBounds.hintTop).toBeGreaterThanOrEqual(recommendationBounds.listBottom);
    const readerBefore = await page.locator('.chat-messages').evaluate(el => ({ width: el.clientWidth, top: el.scrollTop }));
    for (const triggerSelector of ['.branch-navigation-toggle', '.reading-settings-trigger', '.dossier-open-button']) {
      const trigger = page.locator(triggerSelector);
      await trigger.click();
      await expect(page.locator('[role="dialog"][aria-modal="true"]').filter({ visible: true }).last()).toBeVisible();
      expect(await page.locator('#app').evaluate(el => el.inert)).toBe(true);
      if (triggerSelector === '.reading-settings-trigger') {
        await page.getByRole('button', { name: '19px', exact: true }).click();
        expect(await page.locator('.markdown-content').last().evaluate(el => getComputedStyle(el).fontSize)).toBe('19px');
        await page.getByRole('button', { name: '15px', exact: true }).click();
        expect(await page.locator('.markdown-content').last().evaluate(el => getComputedStyle(el).fontSize)).toBe('15px');
        await page.getByRole('button', { name: '17px', exact: true }).click();
      }
      const dialog = page.locator('[role="dialog"][aria-modal="true"]').filter({ visible: true }).last();
      const focus = dialog.locator('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]').filter({ visible: true });
      await focus.first().focus();
      await page.keyboard.press('Shift+Tab');
      await expect(focus.last()).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(focus.first()).toBeFocused();
      await page.screenshot({ animations: 'disabled', path: `${output}/${width}-${triggerSelector.slice(1)}.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('[role="dialog"][aria-modal="true"]').filter({ visible: true })).toHaveCount(0);
      expect(await page.locator('#app').evaluate(el => el.inert)).toBe(false);
      await expect(trigger).toBeFocused();
      expect(await page.locator('.chat-messages').evaluate(el => el.clientWidth)).toBe(readerBefore.width);
    }
    await page.locator('.reading-settings-trigger').click();
    await page.locator('.tools-btn').click();
    await page.getByRole('menuitem', { name: '角色记忆', exact: true }).click();
    const memoryDialog = page.getByRole('dialog', { name: '智能面板' });
    await expect(memoryDialog).toBeVisible();
    expect(await page.locator('#app').evaluate(el => el.inert)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(memoryDialog).toHaveCount(0);
    expect(await page.locator('#app').evaluate(el => el.inert)).toBe(false);
    await expect(page.locator('.reading-settings-trigger')).toBeFocused();
    await page.locator('.chat-messages').evaluate(el => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(300);
    await page.screenshot({ animations: 'disabled', path: `${output}/${width}-light.png` });
    const toggle = page.locator('.workbench-navigation-toggle');
    if (width >= 760) {
      await toggle.click();
      await expect(page.locator('.paper-workbench')).toHaveClass(/workbench-collapsed/);
      const widthAfter = await page.locator('.chat-messages').evaluate(el => el.clientWidth);
      expect(widthAfter).toBeGreaterThan(readerBefore.width);
      await page.locator('.workbench-sidebar a[href="/chat"]').click();
      await expect(page.locator('.library-story').first()).toBeVisible({ timeout: 60000 });
      await expect(page.locator('.paper-workbench')).toHaveClass(/workbench-collapsed/);
      await page.goto(base + chatPath);
      console.log(JSON.stringify({width, stage:'return-to-chat', path: new URL(page.url()).pathname}));
      await expect(page.locator('.input-wrapper')).toBeVisible({ timeout: 60000 });
      await page.screenshot({ animations: 'disabled', path: `${output}/${width}-return-to-chat.png` });
      await expect(page.locator('.paper-workbench')).toHaveClass(/workbench-collapsed/);
      await toggle.click();
    } else {
      await toggle.click();
      await expect(page.locator('.workbench-backdrop')).toBeVisible();
      expect(await page.locator('.workbench-body').evaluate(el => el.inert)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(toggle).toBeFocused();
    }
    if (width < 760) await toggle.click();
    await page.locator('.workbench-theme').click();
    if (width < 760) await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.screenshot({ animations: 'disabled', path: `${output}/${width}-dark.png` });
    // The secondary actions remain reachable through the single menu.
    await page.locator('.story-management-trigger').click();
    await expect(page.getByRole('menuitem', { name: '纠正与分支' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '删除会话' })).toBeVisible();
    await page.keyboard.press('Escape');
    for (const [path, selector] of [['/my-characters', '.private-story-card'], ['/characters/b45bf0e3-85c9-444e-aec5-10eb58e56a82', '.story-opening']]) {
      await page.goto(base + path);
      await expect(page.locator(selector).first()).toBeVisible({ timeout: 60000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width === 1440 || width === 390) await page.screenshot({ animations: 'disabled', path: `${output}/${width}-${path.startsWith('/my') ? 'library' : 'detail'}.png` });
    }
    report.results.push({ width, dimensions, recommendations: 3, overlays: 'inert, focus trap, Escape, focus restore, stable reader width', fontPreference: '15/17/19px', navigation: 'preserved' });
    await context.close();
  }
  expect(report.errors).toEqual([]);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
