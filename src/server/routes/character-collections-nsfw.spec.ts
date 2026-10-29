/**
 * 合集里的 NSFW 可见性（P2-6）
 *
 * 两条列出合集角色的路由（自己的合集、公开合集）都要按「平台开关 + 观看者偏好」
 * 过滤；作者本人的卡始终可见。这里用真实的 nsfw-preference.service，只 mock
 * 用户仓储和 db，通过检查传给 where() 的条件来断言过滤是否生效。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';

const { authState, dbMockRef, userFindById } = vi.hoisted(() => ({
  authState: { userId: null as string | null },
  dbMockRef: { select: vi.fn() },
  userFindById: vi.fn(),
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', { id: authState.userId ?? 'nobody', tenantId: 'tenant-1' });
    return next();
  },
  optionalAuthMiddleware: () => async (c: any, next: any) => {
    if (authState.userId) c.set('user', { id: authState.userId, tenantId: 'tenant-1' });
    return next();
  },
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: { findById: (...args: unknown[]) => userFindById(...args) },
}));

vi.mock('@db/index', () => ({ db: dbMockRef }));

import { characterCollectionRoutes } from './character-collections';
import { config } from '../../core/config';

/** 收集 where() 条件里出现的列名与绑定参数值。 */
function inspect(node: unknown, cols: Set<string> = new Set(), params: unknown[] = [], depth = 0) {
  if (!node || depth > 12 || typeof node !== 'object') return { cols, params };
  if (Array.isArray(node)) {
    node.forEach((n) => inspect(n, cols, params, depth + 1));
    return { cols, params };
  }
  const n = node as { constructor?: { name?: string }; name?: unknown; queryChunks?: unknown; value?: unknown };
  const ctor = n.constructor?.name ?? '';
  if (ctor.startsWith('Pg') && typeof n.name === 'string') cols.add(n.name);
  if (ctor === 'Param') params.push(n.value);
  if (Array.isArray(n.queryChunks)) inspect(n.queryChunks, cols, params, depth + 1);
  return { cols, params };
}

/** 构造 db 链：合集归属校验返回一条记录；角色列表查询返回空数组。 */
function setupDb() {
  const wheres: unknown[] = [];
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn((cond: unknown) => {
    wheres.push(cond);
    return chain;
  });
  chain.orderBy = vi.fn(() => Promise.resolve([]));
  // 合集归属校验是 await db.select().from().where()，直接 await chain
  chain.then = (resolve: any, reject: any) => Promise.resolve([{ id: 'col-1' }]).then(resolve, reject);
  dbMockRef.select.mockImplementation(chain.select);
  return { wheres };
}

function setUser(opts: { showNsfw?: boolean; ageConfirmed?: boolean } = {}) {
  userFindById.mockResolvedValue({
    id: authState.userId,
    showNsfw: opts.showNsfw ?? false,
    ageConfirmedAt: opts.ageConfirmed === false ? null : new Date('2026-01-01'),
  });
}

describe('Character collection routes NSFW visibility', () => {
  let app: Hono;
  const originalSwitch = config.nsfwEnabled;

  beforeEach(() => {
    app = new Hono();
    app.route('/collections', characterCollectionRoutes);
    vi.clearAllMocks();
    config.nsfwEnabled = true;
    authState.userId = null;
  });

  afterEach(() => {
    config.nsfwEnabled = originalSwitch;
  });

  describe('GET /collections/:id/characters（自己的合集）', () => {
    const call = () => app.request('/collections/col-1/characters');

    it('开关开 + 偏好开：不过滤 NSFW', async () => {
      authState.userId = 'viewer';
      setUser({ showNsfw: true });
      const { wheres } = setupDb();

      expect((await call()).status).toBe(200);
      const { cols } = inspect(wheres[1]);
      expect(cols.has('is_nsfw')).toBe(false);
    });

    it('开关开 + 偏好关：过滤 NSFW，但放行观看者自己的卡', async () => {
      authState.userId = 'viewer';
      setUser({ showNsfw: false });
      const { wheres } = setupDb();

      await call();
      const { cols, params } = inspect(wheres[1]);
      expect(cols.has('is_nsfw')).toBe(true);
      expect(cols.has('creator_id')).toBe(true);
      expect(params).toContain('viewer');
    });

    it('开关关 + 偏好开：仍然过滤', async () => {
      config.nsfwEnabled = false;
      authState.userId = 'viewer';
      setUser({ showNsfw: true });
      const { wheres } = setupDb();

      await call();
      expect(inspect(wheres[1]).cols.has('is_nsfw')).toBe(true);
    });

    it('偏好为真但未确认年龄：仍然过滤', async () => {
      authState.userId = 'viewer';
      setUser({ showNsfw: true, ageConfirmed: false });
      const { wheres } = setupDb();

      await call();
      expect(inspect(wheres[1]).cols.has('is_nsfw')).toBe(true);
    });
  });

  describe('GET /collections/public/:userId/:id/characters（公开合集）', () => {
    const call = () => app.request('/collections/public/owner/col-1/characters');

    it('未登录：过滤 NSFW，且没有作者豁免', async () => {
      const { wheres } = setupDb();

      expect((await call()).status).toBe(200);
      const { cols } = inspect(wheres[1]);
      expect(cols.has('is_nsfw')).toBe(true);
      expect(cols.has('creator_id')).toBe(false);
      // 未登录不查偏好
      expect(userFindById).not.toHaveBeenCalled();
    });

    it('开关开 + 偏好开：不过滤', async () => {
      authState.userId = 'viewer';
      setUser({ showNsfw: true });
      const { wheres } = setupDb();

      await call();
      expect(inspect(wheres[1]).cols.has('is_nsfw')).toBe(false);
    });

    it('开关开 + 偏好关：过滤，但作者本人看自己的卡不受影响', async () => {
      authState.userId = 'owner';
      setUser({ showNsfw: false });
      const { wheres } = setupDb();

      await call();
      const { cols, params } = inspect(wheres[1]);
      expect(cols.has('is_nsfw')).toBe(true);
      expect(cols.has('creator_id')).toBe(true);
      expect(params).toContain('owner');
    });

    it('开关关 + 偏好开：仍然过滤，且开关关闭时不查偏好', async () => {
      config.nsfwEnabled = false;
      authState.userId = 'viewer';
      setUser({ showNsfw: true });
      const { wheres } = setupDb();

      await call();
      expect(inspect(wheres[1]).cols.has('is_nsfw')).toBe(true);
      expect(userFindById).not.toHaveBeenCalled();
    });
  });
});
