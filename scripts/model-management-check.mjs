import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.MODEL_CHECK_BASE || 'http://127.0.0.1:5196';
const output = process.env.MODEL_CHECK_OUTPUT || 'backups/exploration/model-channels-20261031/local';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', args: ['--no-proxy-server'] });
const report = { base, mode: 'isolated API fixtures; no live credentials or model calls', results: [], errors: [] };
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const token = 'fixture.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64') + '.fixture';
    await context.addInitScript(token => { localStorage.setItem('token', token); localStorage.setItem('tenantId', 'fixture-tenant'); localStorage.setItem('locale', 'zh-CN'); }, token);
    const meta = { id: 'existing-model', provider: 'custom', contextWindow: 1000000, maxOutputTokens: 4096, outputCapabilityTokens: 64000, defaultTemperature: 0.7 };
    const providers = [{ id: 'custom', name: '现有渠道', provider: 'custom', apiFormat: 'gemini', baseUrl: 'https://existing.invalid/v1beta', hasApiKey: true, models: [meta], defaultModel: meta.id, modelCount: 1, modelAliases: {}, requestOptions: {} }];
    let saved;
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/csrf-token')) {
        await route.fulfill({ json: { csrfToken: 'a'.repeat(64) } });
        return;
      }
      let data = {};
      if (path.endsWith('/auth/me')) data = { user: { id: 'fixture-user', tenantId: 'fixture-tenant', displayName: '隔离管理员', email: 'fixture@example.invalid', role: 'admin' } };
      else if (path.endsWith('/config/modules')) data = {};
      else if (path.endsWith('/admin/models')) {
        if (route.request().method() === 'PUT') {
          saved = route.request().postDataJSON();
          providers.push({ ...saved, hasApiKey: true, apiKey: undefined, models: saved.models.map(id => ({ ...meta, id })), modelCount: saved.models.length });
        }
        data = { source: 'runtime', restartRequired: false, providers, models: providers.flatMap(p => p.models), defaultModel: meta.id };
      }
      await route.fulfill({ json: { success: true, data } });
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ width, message: error.message }));
    await page.goto(base + '/admin/models');
    await expect(page.getByRole('button', { name: '新增渠道', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '新增渠道', exact: true }).click();
    await page.locator('.el-form-item').filter({ hasText: '端点模板' }).locator('.el-select').click();
    await page.getByRole('option', { name: 'Anthropic / Claude', exact: true }).click();
    const form = page.locator('.edit-card');
    await form.locator('input').evaluateAll(inputs => {
      if (!inputs.some(input => input.value === 'https://api.anthropic.com/v1')) throw new Error('Preset endpoint missing');
    });
    // Inputs are identified by their form labels rather than supplier-specific IDs.
    const inputFor = label => form.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: label }) }).locator('input').first();
    await inputFor('模型列表').fill('claude-test');
    await form.locator('input[type="password"]').fill('fixture-key-only');
    await form.locator('button[type="submit"]').click();
    await expect.poll(() => saved?.apiFormat).toBe('anthropic');
    expect(saved.provider).toBe('anthropic'); expect(saved.models).toEqual(['claude-test']);
    await expect(page.locator('.provider-list')).toContainText('Anthropic / Claude');
    await page.screenshot({ path: `${output}/${width}.png`, fullPage: true, animations: 'disabled' });
    report.results.push({ width, addedChannel: true, originalChannelRetained: providers[0].id === 'custom', overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) });
    await context.close();
  }
  expect(report.errors).toEqual([]);
} finally { await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report));
