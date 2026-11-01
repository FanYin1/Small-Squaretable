import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.MODEL_REFRESH_BASE || 'http://127.0.0.1:5192';
const output = process.env.MODEL_REFRESH_OUTPUT || 'backups/exploration/model-refresh-20261031/local';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', args: ['--no-proxy-server'] });
const report = { base, mode: 'isolated API and WebSocket fixtures; no production writes or model calls', results: [], errors: [] };
const storyId = '00000000-0000-4000-8000-000000000001';
const characterId = '00000000-0000-4000-8000-000000000002';
const meta = id => ({ id, provider: 'custom', contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: .7 });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const token = 'fixture.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64') + '.fixture';
    await context.addInitScript(token => {
      for (const [key, value] of Object.entries({ token, tenantId: 'fixture-tenant', locale: 'zh-CN', ['story-onboarding:v1:' + JSON.stringify(['fixture-tenant','fixture-user'])]: 'done' })) localStorage.setItem(key, value);
    }, token);
    await context.routeWebSocket('**/ws*', ws => {
      ws.send(JSON.stringify({ type: 'connected', data: { userId: 'fixture-user' } }));
      ws.onMessage(raw => { const message = JSON.parse(String(raw));  if (message.type === 'ping') ws.send(JSON.stringify({ type: 'pong' })); });
    });
    let models = [meta('original-model')], reads = 0, fail = false, selected = 'original-model';
    const mutations = [], paths = new Set();
    const chat = () => ({ id: storyId, title: '模型刷新隔离故事', characterId, characterName: '隔离角色', tenantId: 'fixture-tenant', userId: 'fixture-user', contentSnapshotVersion: 1, createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z', metadata: { model: selected } });
    await context.route('**/api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname.replace('/api/v1', '');
      paths.add(path);
      let data = {};
      if (path === '/csrf-token') return route.fulfill({ json: { csrfToken: 'a'.repeat(64) } });
      if (path === '/auth/me') data = { user: { id: 'fixture-user', tenantId: 'fixture-tenant', name: '隔离读者', role: 'user', email: 'fixture@example.invalid' } };
      else if (path === '/llm/models') {
        reads++;
        if (fail) return route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: 'Fixture failure' } } });
        data = models;
      }
      else if (path === '/chats') data = { items: [chat()], pagination: { total: 1, hasNext: false } };
      else if (path === `/chats/${storyId}`) data = chat();
      else if (path.endsWith('/messages')) data = { items: [], pagination: { hasNext: false } };
      else if (path.endsWith('/characters')) data = [{ id: characterId, name: '隔离角色', cardData: { name: '隔离角色', first_mes: '这是模型列表刷新测试。' } }];
      else if (path.endsWith('/pinned') || path.endsWith('/story-readings') || path.endsWith('/story-branches')) data = [];
      else if (path.endsWith('/story-state')) data = { protocol: 1, legacy: false, native: false, version: 0, revision: null, fields: [], actions: [], map: null, events: [], notes: [] };
      else if (path === `/characters/${characterId}`) data = { id: characterId, name: '隔离角色', cardData: { name: '隔离角色', first_mes: '这是模型列表刷新测试。' } };
      else if (path === '/credits/balance') data = { billingMode: 'subscription', unlimited: true, availableTokens: 100000 };
      else if (path.endsWith('/model') && req.method() === 'PATCH') { selected = req.postDataJSON().model; mutations.push({ path, selected }); }
      if (!['GET', 'HEAD'].includes(req.method()) && !path.endsWith('/model')) throw new Error(`Unexpected mutation: ${path}`);
      await route.fulfill({ json: { success: true, data } });
    });
    const page = await context.newPage();
    page.on('pageerror', err => report.errors.push({ width, message: err.message }));
    await page.goto(`${base}/chat/${storyId}`);
    const trigger = page.locator('.model-picker-trigger');
    try { await expect(trigger).toBeVisible({ timeout: 30000 }); } catch (error) { report.errors.push({ width, stage: 'initial-page', paths: [...paths], text: await page.locator('body').innerText() }); throw error; }
    await expect.poll(() => reads).toBeGreaterThan(0);
    const input = page.locator('.chat-input-container textarea');
    await input.fill('保留这段尚未发送的草稿');
    const before = reads;
    models = [meta('original-model'), meta('new-model')];
    await trigger.click();
    await expect.poll(() => reads).toBeGreaterThan(before);
    const added = page.getByRole('menuitemradio').filter({ hasText: 'new-model' });
    await expect(added).toBeVisible();
    await added.click();
    await expect(trigger).toContainText('new-model');
    expect(mutations.map(v => v.selected)).toEqual(['new-model']);
    await expect(input).toHaveValue('保留这段尚未发送的草稿');
    models = [meta('new-model')];
    await trigger.click();
    await expect(page.getByRole('menuitemradio')).toHaveCount(1);
    await expect(page.getByRole('menuitemradio')).toContainText('new-model');
    await page.keyboard.press('Escape');
    fail = true;
    await trigger.click();
    await expect(page.locator('.model-picker-error')).toBeVisible();
    fail = false;
    models = [meta('new-model'), meta('retry-model')];
    await page.locator('.model-picker-error button').click();
    await expect(page.getByRole('menuitemradio').filter({ hasText: 'retry-model' })).toBeVisible();
    await expect(page.locator('.model-picker-error')).toHaveCount(0);
    await expect(input).toHaveValue('保留这段尚未发送的草稿');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `${output}/${width}.png`, fullPage: true, animations: 'disabled' });
    report.results.push({ width, reads, hotAddition: true, replacement: true, retry: true, draftPreserved: true, persistedSelection: selected, paths: [...paths] });
    await context.close();
  }
  expect(report.errors).toEqual([]);
} finally { await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report));
