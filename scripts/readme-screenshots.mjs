// Capture the built product with repository-owned demo content and isolated APIs.
// Start `npx vite preview --host 127.0.0.1 --port 5197` first.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const base = process.env.README_SCREENSHOT_BASE || 'http://127.0.0.1:5197';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use a local preview build');
const output = process.env.README_SCREENSHOT_OUTPUT || 'backups/exploration/github-readme-20261101/demo';
await mkdir(output, { recursive: true });
const card = JSON.parse(await readFile(new URL('../docs/product/examples/rainy-record-shop.json', import.meta.url), 'utf8')).data;
const storyId = '00000000-0000-4000-8000-000000000001';
const characterId = '00000000-0000-4000-8000-000000000002';
const chat = { id: storyId, title: '雨夜留声馆 · 没有寄件人的唱片', characterId, characterName: '沈栖', contentSnapshotVersion: 1,
  tenantId: 'demo-tenant', userId: 'demo-user', createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z', summary: '纸袋背面只有一道被水洇开的蓝色线条，像河，也像一段声波。',
  metadata: { model: 'demo-story-model' } };
const character = { id: characterId, name: card.name, cardData: card, description: card.description,
  tags: card.tags, creatorId: 'demo-user', isPublic: false, isNsfw: false,
  createdAt: chat.createdAt, updatedAt: chat.createdAt, downloadCount: 0, viewCount: 0, ratingCount: 0 };
const pagination = { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false };
const messages = [
  { id: 'demo-opening', role: 'assistant', content: card.first_mes.replaceAll('{{user}}', '旅人') },
  { id: 'demo-action', role: 'user', content: '我先看看信封背面。' },
  { id: 'demo-reply', role: 'assistant', content: card.mes_example.split('{{char}}: ')[1], extra: { storyRecommendations: [
    { label: '用放大镜看看蓝色线条', input: '我用放大镜仔细看看纸袋背面的蓝色线条。' },
    { label: '询问送信人的样子', input: '我问沈栖，送来纸袋的人是什么样子。' },
    { label: '先听听那张唱片', input: '我提议先听听纸袋里的那张唱片。' },
  ] } },
].map(message => ({ ...message, chatId: storyId, sentAt: '2026-11-01T00:00:00Z' }));
const models = ['demo-story-model', 'demo-fast-model'].map(id => ({ id, provider: 'custom', contextWindow: 128000, maxOutputTokens: 4096 }));
const browser = await chromium.launch({ channel: 'chromium', args: ['--no-proxy-server'] });
const report = { mode: 'built product; isolated APIs; repository example; no model calls', results: [], errors: [] };
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => {
      const token = 'fixture.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture';
      const values = { token, tenantId: 'demo-tenant', locale: 'zh-CN', 'theme-preference': 'light',
        ['story-onboarding:v1:' + JSON.stringify(['demo-tenant', 'demo-user'])]: 'done' };
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    });
    await context.routeWebSocket('**/ws*', ws => {
      ws.send(JSON.stringify({ type: 'connected', data: { userId: 'demo-user' } }));
      ws.onMessage(raw => { if (JSON.parse(String(raw)).type === 'ping') ws.send(JSON.stringify({ type: 'pong' })); });
    });
    await context.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
      if (!['GET', 'HEAD'].includes(request.method())) throw new Error(`Unexpected write: ${path}`);
      let data = {};
      if (path === '/csrf-token') return route.fulfill({ json: { csrfToken: 'a'.repeat(64) } });
      if (path === '/auth/me') data = { user: { id: 'demo-user', tenantId: 'demo-tenant', name: '旅人', role: 'user', email: 'demo@example.invalid' } };
      else if (path === '/llm/models') data = models;
      else if (path === '/chats') data = { items: [chat], pagination: { total: 1, hasNext: false } };
      else if (path === `/chats/${storyId}`) data = chat;
      else if (path.endsWith('/messages')) data = { items: messages, pagination: { hasNext: false } };
      else if (path === '/characters') data = { items: [character], pagination };
      else if (path === '/characters/search') data = { items: [{ ...character, isPublic: true, moderationStatus: 'approved' }], pagination };
      else if (path === '/character-collections') data = [];
      else if (path === '/chat-templates') data = { own: [], public: [] };
      else if (path.startsWith('/social/favorites/')) data = { isFavorited: false, favoriteCount: 0 };
      else if (path.endsWith('/characters')) data = [character];
      else if (path === `/characters/${characterId}`) data = character;
      else if (path.endsWith('/pinned') || path.endsWith('/story-readings') || path.endsWith('/story-branches')) data = [];
      else if (path.endsWith('/story-state')) data = { protocol: 1, legacy: false, native: false, version: 0, revision: null, fields: [], actions: [], map: null, events: [], notes: [] };
      else if (path === '/credits/balance') data = { billingMode: 'subscription', unlimited: true };
      await route.fulfill({ json: { success: true, data } });
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ width, message: error.message }));
    await page.goto(`${base}/chat/${storyId}`);
    await expect(page.locator('.turn-recommendations button')).toHaveCount(3);
    await expect(page.locator('.model-picker-trigger')).toContainText('demo-story-model');
    await page.locator('.chat-messages').evaluate(element => element.scrollTo(0, element.scrollHeight));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `${output}/${width}.png`, fullPage: true, animations: 'disabled' });
    report.results.push({ page: 'workbench', width, recommendations: 3, overflow: false });
    for (const [name, path, selector] of [
      ['discover', '/market', '.story-card'],
      ['story-library', '/chat', '.library-story'],
      ['private-library', '/my-characters', '.private-story-card'],
    ]) {
      await page.goto(`${base}${path}`);
      await expect(page.locator(selector)).toHaveCount(1);
      await expect(page.locator(selector)).toContainText('雨夜留声馆');
      if (name === 'story-library') await expect(page.locator('.library-delete')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true, animations: 'disabled' });
      report.results.push({ page: name, width, cards: 1, overflow: false });
    }
    await context.close();
  }
  expect(report.errors).toEqual([]);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report));
