import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.AUTH_CHECK_BASE || 'http://127.0.0.1:5197';
const output = process.env.AUTH_CHECK_OUTPUT || 'backups/exploration/auth-session-20261101/local';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', args: ['--no-proxy-server'] });
const report = { base, mode: 'isolated authentication/API fixtures; no production writes or model calls', results: [], errors: [] };
const makeToken = () => 'fixture.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64') + '.fixture';
try {
  for (const width of [1440, 390]) {
    for (const expiredRefresh of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      await context.addInitScript(token => {
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', 'fixture-refresh');
        localStorage.setItem('tenantId', 'fixture-tenant');
        localStorage.setItem('locale', 'zh-CN');
      }, makeToken());
      const meta = { id: 'fixture-model', provider: 'custom', contextWindow: 128000, maxOutputTokens: 4096, outputCapabilityTokens: 8192 };
      const config = { providers: [{ id: 'custom', name: '测试渠道', provider: 'custom', apiFormat: 'openai', baseUrl: 'https://fixture.invalid/v1', hasApiKey: true, models: [meta], defaultModel: meta.id }], models: [meta], defaultModel: meta.id };
      let refreshes = 0;
      const saves = [];
      const renewedToken = makeToken() + '-renewed';
      await context.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const deny = () => route.fulfill({ status: 401, json: { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid authentication token' } } });
        if (path.endsWith('/auth/refresh')) {
          refreshes++;
          if (expiredRefresh) return deny();
          return route.fulfill({ json: { success: true, data: { accessToken: renewedToken, refreshToken: 'renewed-refresh', expiresIn: 21600 } } });
        }
        if (path.endsWith('/csrf-token')) return route.fulfill({ json: { csrfToken: (refreshes ? 'b' : 'a').repeat(64) } });
        let data = {};
        if (path.endsWith('/auth/me')) data = { user: { id: 'fixture-user', tenantId: 'fixture-tenant', displayName: '测试管理员', email: 'fixture@example.invalid', role: 'admin' } };
        if (path.endsWith('/admin/models')) {
          if (request.method() === 'PUT') {
            saves.push({ body: request.postDataJSON(), headers: request.headers() });
            if (saves.length === 1) return deny();
          }
          data = config;
        }
        return route.fulfill({ json: { success: true, data } });
      });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(base + '/admin/models');
      const form = page.locator('.edit-card');
      const key = form.locator('input[type="password"]');
      await expect(form.locator('input').filter({ visible: true }).first()).toBeVisible();
      await key.fill('fixture-unsaved-key');
      await form.locator('button[type="submit"]').click();
      await expect.poll(() => refreshes).toBe(1);
      if (expiredRefresh) {
        await expect(page.getByText('登录已过期，请重新登录后再试', { exact: true })).toBeVisible();
        await expect(key).toHaveValue('fixture-unsaved-key');
        expect(saves).toHaveLength(1);
        expect(new URL(page.url()).pathname).toBe('/admin/models');
        expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
      } else {
        await expect.poll(() => saves.length).toBe(2);
        expect(saves[1].body).toEqual(saves[0].body);
        expect(saves[1].headers.authorization).toBe('Bearer ' + renewedToken);
        expect(saves[1].headers['x-csrf-token']).toBe('b'.repeat(64));
        await expect(key).toHaveValue('');
        expect(await page.evaluate(() => localStorage.getItem('refreshToken'))).toBe('renewed-refresh');
      }
      await page.screenshot({ path: `${output}/${width}-${expiredRefresh ? 'expired' : 'recovered'}.png`, fullPage: true });
      report.results.push({ width, expiredRefresh, refreshes, saveAttempts: saves.length, draftRetainedOnFailure: expiredRefresh || undefined });
      await context.close();
    }
  }
  expect(report.errors).toEqual([]);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report));
