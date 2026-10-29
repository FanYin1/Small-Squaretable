import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';

export async function checkStoryReadingPosition({ browser, base, sql, api, auth, evidence, waitForBudget }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const card = await api('/characters', { name: '阅读位置恢复检查', description: '隔离环境的阅读记录，不代表第三方卡片剧情。',
    cardData: { name: '阅读位置恢复检查', first_mes: '从这里开始阅读。' } });
  const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
  const inserted = await sql`INSERT INTO messages (chat_id, role, content, sent_at)
    SELECT ${story.id}, 'assistant', '阅读记录 ' || sequence || '：' || repeat('雨声落在旧书店的窗沿，桌上的笔记仍停在昨天的位置。', 14),
      '2026-10-28T00:00:00Z'::timestamptz + sequence * interval '1 second'
    FROM generate_series(1, 90) AS sequence RETURNING id`;
  const anchor = String(inserted[5].id);
  const latest = String(inserted.at(-1).id);
  const key = `story-position:${JSON.stringify([auth.user.tenantId, auth.user.id, story.id])}`;
  const checks = [];
  const screenshots = [];
  const errors = [];
  const context = await browser.newContext();
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
  }, auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const routePattern = `**/api/v1/chats/${story.id}/messages?*`;
  const snapshot = await sql`SELECT id, role, content FROM messages WHERE chat_id = ${story.id} ORDER BY id`;
  async function prepare(width, theme) {
    await api('/csrf-token');
    await waitForBudget(60);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(base);
    await page.evaluate(({ key, anchor, theme }) => {
      sessionStorage.setItem(key, JSON.stringify({ messageId: anchor, offset: 0, latest: false }));
      localStorage.setItem('theme-preference', theme);
    }, { key, anchor, theme });
  }
  async function capture(name) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${evidence}/${name}`, fullPage: true, animations: 'disabled' });
    screenshots.push(name);
  }
  async function expectLatest() {
    await expect(page.locator(`[data-message-id="${latest}"]`)).toBeInViewport();
    await expect(page.locator('.reading-position-status')).toHaveCount(0);
  }
  try {
    for (const width of [1440, 390]) {
      for (const theme of ['light', 'dark']) {
        await prepare(width, theme);
        await page.route(routePattern, route => new URL(route.request().url()).searchParams.has('before')
          ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false,
            error: { code: 'READING_TEST_UNAVAILABLE', message: '旧记录暂时无法加载。' } }) }) : route.continue());
        await page.goto(`${base}/chat/${story.id}`);
        const status = page.locator('.reading-position-status');
        await expect(status).toContainText('原阅读位置暂不可用');
        await expect(page.locator('.message-input textarea')).toBeVisible();
        await capture(`reading-failure-${width}-${theme}.png`);
        await status.getByRole('button', { name: '返回最新', exact: true }).click();
        await expectLatest();
        await page.unroute(routePattern);
        checks.push(`${width}/${theme}: failed older-page request preserves reader and input, explains missing position and returns to latest explicitly`);

        await prepare(width, theme);
        let release;
        const held = new Promise(resolve => { release = resolve; });
        let received = false;
        await page.route(routePattern, async route => {
          if (!new URL(route.request().url()).searchParams.has('before')) return route.continue();
          received = true;
          await held;
          return route.continue();
        });
        try {
          await page.goto(`${base}/chat/${story.id}`);
          await expect.poll(() => received).toBe(true);
          await expect(status).toContainText('正在找回');
          await capture(`reading-pending-${width}-${theme}.png`);
          await status.getByRole('button', { name: '返回最新', exact: true }).click();
          await expectLatest();
        } finally { release(); }
        await expect(page.locator('.loading-older')).toHaveCount(0);
        await expectLatest();
        await page.unroute(routePattern);
        checks.push(`${width}/${theme}: return-to-latest cancels in-flight position restoration; late pagination does not move the reader back`);
      }
    }
    await prepare(1440, 'light');
    await page.goto(`${base}/chat/${story.id}`);
    await expect(page.locator('.reading-position-status')).toHaveCount(0);
    await expect(page.locator(`[data-message-id="${anchor}"]`)).toBeInViewport();
    assert.deepEqual(await sql`SELECT id, role, content FROM messages WHERE chat_id = ${story.id} ORDER BY id`, snapshot);
    assert.deepEqual(errors, []);
    checks.push('Successful restoration still locates the original older anchor; all saved messages remain unchanged; no browser page errors');
    return { checks, screenshots, pageErrors: errors, historyMessages: snapshot.length, generationRequests: 0 };
  } finally { await context.close(); }
}
