/**
 * 这组测试守的是一个真实缺口：index.ts 里 CSRF 全部注册成
 * `app.use('/api/v1/characters', csrfProtection())` 这种精确路径。
 * Hono 的精确路径不匹配子路径，所以只有集合端点被保护，
 * `POST /api/v1/characters/:id/publish`、发消息、删除等所有子路径写操作
 * 一律没有 CSRF 校验——实测带 Authorization 头即可通过。
 *
 * 而简单地全都加 `/*` 会打死计费：Stripe webhook 是
 * `POST /api/v1/subscriptions/webhook`，由 Stripe 服务器直接调用，
 * 不可能携带 CSRF token。它今天能工作恰恰是因为 CSRF 没覆盖子路径。
 * 这和 publicPaths 曾经漏掉同一条路径导致所有回调被 400 是同一个坑。
 *
 * 所以用真实的 csrfProtection() 跑真实挂载方式，而不是断言数组里有某个字符串：
 * 前缀语义和豁免语义都在被测范围内。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { csrfProtectedPrefixes, csrfExemptPaths, isCsrfExempt } from './csrf-paths';
import { csrfProtection, getCsrfToken } from '../middleware/csrf';

/**
 * index.ts 拉起 Kafka / scheduler / WebSocket，测试不能导入它，
 * 所以对「实际挂载方式」的断言只能读源码。这是有意的取舍：
 * 覆盖范围漏一条在生产上完全静默，宁可用静态检查也不能没有检查。
 */
const indexSource = readFileSync(join(__dirname, '../index.ts'), 'utf8');

/**
 * 注释里会出现示例代码（比如说明缺口时写的那行 app.use），
 * 不剥掉的话静态断言会被自己的注释绊倒。
 */
const indexCode = indexSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

/** index.ts 里显式挂载的 /api/v1 路由前缀 */
const mountedPrefixes = [...indexCode.matchAll(/app\.route\(\s*'(\/api\/v1[^']*)'/g)].map(
  (m) => m[1],
);

/**
 * 刻意不做 CSRF 校验的前缀，每条都必须有理由。
 * 新增路由组如果既不在保护清单也不在这里，下面的测试会红——
 * 逼着做一次决定，而不是默认漏掉。
 */
const INTENTIONALLY_UNPROTECTED = [
  '/api/v1/auth', // 登录前拿不到 token；前端 api.ts 也对 /auth 跳过
  '/api/v1/auth/oauth',
  '/api/v1/auth/mfa',
  '/api/v1/analytics/vitals', // sendBeacon 不能带自定义头，且注册在 CSRF 之前
  '/api/v1/quick-replies', // 历史遗留，未覆盖
  '/api/v1/personas',
  '/api/v1/share',
  '/api/v1', // intelligenceRoutes 挂在根上，加 /* 会连带覆盖所有路由
];

// extractSessionId 取 Authorization Bearer 的前 32 字符作为 session id，
// 所以要触发校验就必须带一个足够长、且不是 API key 前缀的 token
const BEARER = 'Bearer ' + 'a'.repeat(48);

/** 按 index.ts 的方式挂载：一个前缀 + 一条兜底路由 */
function appFor(prefix: string) {
  const app = new Hono();
  app.get('/api/v1/csrf-token', getCsrfToken);
  app.use(`${prefix}/*`, csrfProtection());
  app.all('*', (c) => c.json({ reached: true }));
  return app;
}

async function issueToken(app: Hono): Promise<string> {
  const res = await app.request('/api/v1/csrf-token', { headers: { Authorization: BEARER } });
  return (await res.json()).csrfToken;
}

describe('csrf 覆盖范围', () => {
  describe('子路径必须被保护', () => {
    it('发布角色（子路径）缺 token 时被拒', async () => {
      const res = await appFor('/api/v1/characters').request(
        '/api/v1/characters/char-1/publish',
        { method: 'POST', headers: { Authorization: BEARER } },
      );
      expect(res.status).toBe(403);
    });

    it('带正确 token 时放行', async () => {
      const app = appFor('/api/v1/characters');
      const token = await issueToken(app);
      const res = await app.request('/api/v1/characters/char-1/publish', {
        method: 'POST',
        headers: { Authorization: BEARER, 'X-CSRF-Token': token },
      });
      expect(res.status).toBe(200);
    });

    it('集合端点仍然被保护（不能为了子路径把原有覆盖弄丢）', async () => {
      const res = await appFor('/api/v1/characters').request('/api/v1/characters', {
        method: 'POST',
        headers: { Authorization: BEARER },
      });
      expect(res.status).toBe(403);
    });

    it('GET 不受影响', async () => {
      const res = await appFor('/api/v1/characters').request('/api/v1/characters/char-1', {
        headers: { Authorization: BEARER },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('第三方回调必须豁免（不可能带 CSRF token）', () => {
    it('Stripe webhook 无 token 也放行', async () => {
      const res = await appFor('/api/v1/subscriptions').request(
        '/api/v1/subscriptions/webhook',
        {
          method: 'POST',
          headers: { Authorization: BEARER, 'stripe-signature': 't=1,v1=deadbeef' },
          body: '{}',
        },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ reached: true });
    });

    it('豁免是精确匹配，不能顺带放过兄弟路径', async () => {
      const res = await appFor('/api/v1/subscriptions').request(
        '/api/v1/subscriptions/webhook-fake',
        { method: 'POST', headers: { Authorization: BEARER } },
      );
      expect(res.status).toBe(403);
    });

    it('isCsrfExempt 只认清单里的路径', () => {
      expect(isCsrfExempt('/api/v1/subscriptions/webhook')).toBe(true);
      expect(isCsrfExempt('/api/v1/subscriptions/webhook/')).toBe(true);
      expect(isCsrfExempt('/api/v1/subscriptions')).toBe(false);
      expect(isCsrfExempt('/api/v1/characters/x/publish')).toBe(false);
    });
  });

  describe('配置本身', () => {
    it('每个前缀都不带尾部通配符——挂载时才补 /*，避免写成精确路径', () => {
      for (const p of csrfProtectedPrefixes) {
        expect(p, `${p} 不该自带通配符`).not.toMatch(/\*$/);
        expect(p, `${p} 应是 /api/v1 下的前缀`).toMatch(/^\/api\/v1\//);
      }
    });

    it('计费回调在豁免清单里', () => {
      expect(csrfExemptPaths).toContain('/api/v1/subscriptions/webhook');
    });

    it('豁免路径必须落在某个受保护前缀下，否则这条配置没有意义', () => {
      for (const ex of csrfExemptPaths) {
        expect(
          csrfProtectedPrefixes.some((p) => ex.startsWith(p + '/') || ex === p),
          `${ex} 不在任何受保护前缀下`,
        ).toBe(true);
      }
    });
  });

  // 配置和 index.ts 漂移是这次缺口的直接成因：清单少写一条，
  // 就等于静默摘掉一个路由组的 CSRF 保护，没有任何报错。
  describe('与 index.ts 实际挂载一致', () => {
    it('index.ts 不再有精确路径式的 CSRF 注册（那正是缺口本身）', () => {
      const exactMounts = [
        ...indexCode.matchAll(/app\.use\(\s*'([^']*)'\s*,\s*csrfProtection\(\)/g),
      ].map((m) => m[1]);
      expect(exactMounts, `这些注册没带 /*，不会匹配子路径`).toEqual([]);
    });

    it('index.ts 用带 /* 的前缀通配遍历清单挂载', () => {
      expect(indexCode).toMatch(/for\s*\(\s*const\s+prefix\s+of\s+csrfProtectedPrefixes\s*\)/);
      expect(indexCode).toMatch(/app\.use\(\s*`\$\{prefix\}\/\*`\s*,\s*csrfProtection\(\)\s*\)/);
    });

    it('每个受保护前缀都真的挂了路由，否则是条死配置', () => {
      for (const p of csrfProtectedPrefixes) {
        expect(mountedPrefixes, `${p} 在 index.ts 没有对应的 app.route`).toContain(p);
      }
    });

    it('没有既不受保护、也未记录豁免理由的路由组', () => {
      const covered = new Set<string>([...csrfProtectedPrefixes, ...INTENTIONALLY_UNPROTECTED]);
      const orphans = [...new Set(mountedPrefixes)].filter((p) => !covered.has(p));
      expect(
        orphans,
        '新路由组要么加进 csrfProtectedPrefixes，要么在 INTENTIONALLY_UNPROTECTED 里写明理由',
      ).toEqual([]);
    });
  });
});
