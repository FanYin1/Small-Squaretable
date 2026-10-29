import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function checkLibraryRecovery({ page, base, card, budget, screenshot }) {
  const results = [];
  for (const width of [1440, 390]) for (const failure of ['timeout', 'rate-limit']) {
    await budget();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    let requests = 0;
    let release;
    const stalled = new Promise(resolve => { release = resolve; });
    const matches = url => url.origin === base && url.pathname === '/api/v1/characters';
    const routeRead = async route => {
      assert.equal(route.request().method(), 'GET');
      requests++;
      if (requests !== 1) return route.fallback();
      if (failure === 'rate-limit') return route.fulfill({ status: 429, contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Controlled read-only rate limit' } }) });
      await stalled;
      await route.abort('timedout').catch(() => {});
    };
    await page.route(matches, routeRead);
    try {
      await page.goto(`${base}/my-characters`);
      const alert = page.getByTestId('library-load-error');
      await expect(alert).toContainText(failure === 'timeout' ? '读取故事库超时' : '获取角色列表失败', { timeout: 20000 });
      const retry = alert.getByRole('button', { name: '重新读取故事库', exact: true });
      await expect(retry).toBeEnabled();
      assert.equal(requests, 1, 'Failed reads must not automatically retry');
      await screenshot(`library-${failure}-${width}`);
      release();
      await retry.click();
      await expect(page.getByRole('button', { name: `查看故事: ${card.name}`, exact: true })).toBeVisible();
      await expect(alert).toHaveCount(0);
      assert.equal(requests, 2, 'Manual recovery makes exactly one additional read');
      await screenshot(`library-${failure}-recovered-${width}`);
      results.push({ width, failure, requests });
    } finally {
      release();
      await page.unroute(matches, routeRead);
    }
  }
  return results;
}
