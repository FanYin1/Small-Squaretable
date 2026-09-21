import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { publicPaths } from './public-paths';
import { tenantMiddleware } from '../middleware/tenant';

/**
 * 这组测试守的是一个真实事故：`/api/v1/subscriptions/webhook` 不在 publicPaths 里，
 * 于是 tenantMiddleware 用 400 "Missing tenant ID" 挡掉了所有 Stripe 回调 ——
 * 签名校验根本没被执行，用户付款成功但订阅状态永远不会写回库。
 *
 * 用真实的 publicPaths + 真实的 tenantMiddleware 跑，而不是断言数组里有某个字符串：
 * 前缀匹配的语义（`startsWith`）也在被测范围内。
 */
describe('publicPaths', () => {
  /** 按 index.ts 的方式挂载，模拟一条受租户隔离保护的路由 */
  const appFor = (mountPrefix: string) => {
    const app = new Hono();
    app.use(`${mountPrefix}/*`, tenantMiddleware({ publicPaths }));
    app.all('*', (c) => c.json({ reached: true }));
    return app;
  };

  describe('第三方服务回调（不可能带 X-Tenant-ID）', () => {
    it('lets the Stripe webhook through without a tenant header', async () => {
      const res = await appFor('/api/v1/subscriptions').request('/api/v1/subscriptions/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=deadbeef' },
        body: '{}',
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ reached: true });
    });
  });

  describe('公开读取端点', () => {
    const publicRequests: Array<[string, string]> = [
      ['/api/v1/characters', '/api/v1/characters/search?q=a'],
      ['/api/v1/characters', '/api/v1/characters/marketplace'],
      ['/api/v1/plugins', '/api/v1/plugins/marketplace'],
      ['/api/v1/recommendations', '/api/v1/recommendations/trending'],
      ['/api/v1/recommendations', '/api/v1/recommendations/similar/abc'],
    ];

    it.each(publicRequests)('%s: %s needs no tenant header', async (mount, url) => {
      const res = await appFor(mount).request(url);
      expect(res.status).toBe(200);
    });
  });

  describe('租户隔离仍然生效', () => {
    const protectedRequests: Array<[string, string]> = [
      ['/api/v1/subscriptions', '/api/v1/subscriptions/checkout'],
      ['/api/v1/subscriptions', '/api/v1/subscriptions/status'],
      ['/api/v1/chats', '/api/v1/chats'],
      ['/api/v1/usage', '/api/v1/usage/stats'],
    ];

    it.each(protectedRequests)('%s: %s still requires a tenant header', async (mount, url) => {
      const res = await appFor(mount).request(url);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'Missing tenant ID' });
    });

    it('does not accidentally open a whole route group', () => {
      // '/api/v1/subscriptions' 作为前缀会放开 checkout/portal/status，
      // 必须是完整的 webhook 路径。
      expect(publicPaths).not.toContain('/api/v1/subscriptions');
      expect(publicPaths).toContain('/api/v1/subscriptions/webhook');
    });
  });
});
