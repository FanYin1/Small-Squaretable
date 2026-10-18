/**
 * 角色路由的 NSFW 可见性（P2-6）：marketplace、搜索、详情、Fork、导出
 *
 * 可见性在服务端由「平台开关 + 用户偏好（数据库）」决定。这里用真实的
 * nsfw-preference.service，只 mock 用户仓储，所以断言覆盖的是整条
 * 路由 -> 偏好解析 -> 传给服务/缓存的参数。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { characterRoutes } from './characters';
import { characterService } from '../services/character.service';
import { searchService } from '../services/search.service';
import { cacheService } from '../services/cache.service';
import { errorHandler } from '../middleware/error-handler';
import { config } from '../../core/config';
import { verifyAccessToken } from '../../core/jwt';
import { userRepository } from '../../db/repositories/user.repository';

vi.mock('../services/character.service');
vi.mock('../services/search.service', () => ({
  searchService: { searchCharacters: vi.fn() },
}));

vi.mock('../services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    deletePattern: vi.fn(),
    invalidateCharacter: vi.fn(),
    invalidateMarketplace: vi.fn(),
    getCachedCharacter: vi.fn().mockResolvedValue(null),
    setCachedCharacter: vi.fn(),
    getCachedMarketplace: vi.fn().mockResolvedValue(null),
    setCachedMarketplace: vi.fn(),
    getCachedSearch: vi.fn().mockResolvedValue(null),
    setCachedSearch: vi.fn(),
  },
}));

vi.mock('../services/event-bus.service', () => ({ eventBus: { emit: vi.fn() } }));

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: { findById: vi.fn() },
}));

vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: { findByTenantId: vi.fn() },
}));

vi.mock('../services/character-version.service', () => ({
  characterVersionService: {
    saveVersion: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue(null),
  },
}));

// 导出会拼装世界书；这里不关心内容，视为没有世界书
vi.mock('../../db/repositories/worldbook.repository', () => ({
  worldBookRepository: { findByCharacter: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }),
  },
}));

const TENANT = 'tenant-1';
const AUTH = { Authorization: 'Bearer token' };

/** 登录为 userId，并设定其偏好/年龄状态。 */
function loginAs(userId: string, opts: { showNsfw?: boolean; ageConfirmed?: boolean } = {}) {
  vi.mocked(verifyAccessToken).mockResolvedValue({
    userId,
    tenantId: TENANT,
    email: `${userId}@example.com`,
  } as never);
  vi.mocked(userRepository.findById).mockResolvedValue({
    id: userId,
    tenantId: TENANT,
    email: `${userId}@example.com`,
    isActive: true,
    showNsfw: opts.showNsfw ?? false,
    ageConfirmedAt: opts.ageConfirmed === false ? null : new Date('2026-01-01'),
  } as never);
}

const nsfwCard = { id: 'nsfw-1', name: 'Spicy', tenantId: TENANT, creatorId: 'author', isPublic: true, isNsfw: true };
const plainCard = { id: 'plain-1', name: 'Plain', tenantId: TENANT, creatorId: 'author', isPublic: true, isNsfw: false };

const emptyPage = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
};

describe('Character routes NSFW visibility', () => {
  let app: Hono;
  const originalSwitch = config.nsfwEnabled;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/characters', characterRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
    config.nsfwEnabled = true;
    vi.mocked(cacheService.getCachedCharacter).mockResolvedValue(null);
    vi.mocked(cacheService.getCachedMarketplace).mockResolvedValue(null);
    vi.mocked(cacheService.getCachedSearch).mockResolvedValue(null);
    vi.mocked(characterService.getPublicCharacters).mockResolvedValue(emptyPage as never);
    vi.mocked(searchService.searchCharacters).mockResolvedValue({
      items: [],
      pagination: emptyPage.pagination,
    } as never);
  });

  afterEach(() => {
    config.nsfwEnabled = originalSwitch;
  });

  // ── marketplace ──

  describe('GET /marketplace', () => {
    it('开关开 + 偏好开：向服务传 showNsfw=true，缓存键用 nsfw 变体', async () => {
      loginAs('viewer', { showNsfw: true });

      const res = await app.request('/api/v1/characters/marketplace?page=1&limit=20', { headers: AUTH });

      expect(res.status).toBe(200);
      expect(characterService.getPublicCharacters).toHaveBeenCalledWith(expect.anything(), { showNsfw: true });
      expect(cacheService.getCachedMarketplace).toHaveBeenCalledWith(1, 20, true);
      expect(cacheService.setCachedMarketplace).toHaveBeenCalledWith(1, 20, expect.anything(), true);
    });

    it('开关开 + 偏好关：showNsfw=false', async () => {
      loginAs('viewer', { showNsfw: false });

      await app.request('/api/v1/characters/marketplace?page=1&limit=20', { headers: AUTH });

      expect(characterService.getPublicCharacters).toHaveBeenCalledWith(expect.anything(), { showNsfw: false });
      expect(cacheService.getCachedMarketplace).toHaveBeenCalledWith(1, 20, false);
    });

    it('未登录：视为偏好关', async () => {
      await app.request('/api/v1/characters/marketplace?page=1&limit=20');

      expect(characterService.getPublicCharacters).toHaveBeenCalledWith(expect.anything(), { showNsfw: false });
    });

    it('开关关 + 偏好开：仍然 showNsfw=false，且不查偏好', async () => {
      config.nsfwEnabled = false;
      loginAs('viewer', { showNsfw: true });
      // optionalAuthMiddleware 自己会查一次用户；清掉后只看偏好解析是否额外查询
      vi.mocked(userRepository.findById).mockClear();

      await app.request('/api/v1/characters/marketplace?page=1&limit=20', { headers: AUTH });

      expect(characterService.getPublicCharacters).toHaveBeenCalledWith(expect.anything(), { showNsfw: false });
      // 只有鉴权中间件那一次，偏好解析在开关关闭时直接短路
      expect(vi.mocked(userRepository.findById).mock.calls.length).toBe(1);
    });

    it('偏好为真但未确认年龄：showNsfw=false', async () => {
      loginAs('viewer', { showNsfw: true, ageConfirmed: false });

      await app.request('/api/v1/characters/marketplace?page=1&limit=20', { headers: AUTH });

      expect(characterService.getPublicCharacters).toHaveBeenCalledWith(expect.anything(), { showNsfw: false });
    });

    it('客户端在 query 里塞 showNsfw / isNsfw 不改变结论', async () => {
      loginAs('viewer', { showNsfw: false });

      await app.request('/api/v1/characters/marketplace?page=1&limit=20&showNsfw=true&isNsfw=true', {
        headers: AUTH,
      });

      expect(characterService.getPublicCharacters).toHaveBeenCalledWith(expect.anything(), { showNsfw: false });
    });
  });

  // ── 搜索 ──

  describe('GET /search', () => {
    it('开关开 + 偏好开：searchService 收到 showNsfw=true', async () => {
      loginAs('viewer', { showNsfw: true });

      const res = await app.request('/api/v1/characters/search?q=wizard', { headers: AUTH });

      expect(res.status).toBe(200);
      expect(searchService.searchCharacters).toHaveBeenCalledWith(expect.objectContaining({ showNsfw: true }));
    });

    it('开关开 + 偏好关：showNsfw=false，客户端 isNsfw=true 不能绕过', async () => {
      loginAs('viewer', { showNsfw: false });

      await app.request('/api/v1/characters/search?q=wizard&isNsfw=true', { headers: AUTH });

      expect(searchService.searchCharacters).toHaveBeenCalledWith(expect.objectContaining({ showNsfw: false }));
    });

    it('开关关 + 偏好开：showNsfw=false', async () => {
      config.nsfwEnabled = false;
      loginAs('viewer', { showNsfw: true });

      await app.request('/api/v1/characters/search?q=wizard', { headers: AUTH });

      expect(searchService.searchCharacters).toHaveBeenCalledWith(expect.objectContaining({ showNsfw: false }));
    });

    it('未登录：showNsfw=false', async () => {
      await app.request('/api/v1/characters/search?q=wizard');

      expect(searchService.searchCharacters).toHaveBeenCalledWith(expect.objectContaining({ showNsfw: false }));
    });
  });

  // ── 详情 ──

  describe('GET /:id', () => {
    it('开关开 + 偏好开：可见', async () => {
      loginAs('viewer', { showNsfw: true });
      vi.mocked(characterService.getById).mockResolvedValue(nsfwCard as never);

      const res = await app.request('/api/v1/characters/nsfw-1', { headers: AUTH });

      expect(res.status).toBe(200);
    });

    it('开关开 + 偏好关：404，与「不存在 / 私有卡」同一形状', async () => {
      loginAs('viewer', { showNsfw: false });
      vi.mocked(characterService.getById).mockResolvedValue(nsfwCard as never);
      const hidden = await app.request('/api/v1/characters/nsfw-1', { headers: AUTH });

      // 对照：别的租户的私有卡（既有的 IDOR 防护返回的 404）
      vi.mocked(characterService.getById).mockResolvedValue({
        ...plainCard,
        tenantId: 'other-tenant',
        isPublic: false,
      } as never);
      const priv = await app.request('/api/v1/characters/plain-1', { headers: AUTH });

      expect(hidden.status).toBe(404);
      expect(priv.status).toBe(404);
      const hiddenBody = await hidden.json();
      const privBody = await priv.json();
      expect(hiddenBody.error.code).toBe(privBody.error.code);
      expect(hiddenBody.error.message).toBe(privBody.error.message);
      expect(hiddenBody.data).toBeUndefined();
    });

    it('开关开 + 偏好关：缓存命中时同样 404（缓存里是角色本身，与观看者无关）', async () => {
      loginAs('viewer', { showNsfw: false });
      vi.mocked(cacheService.getCachedCharacter).mockResolvedValue(nsfwCard as never);

      const res = await app.request('/api/v1/characters/nsfw-1', { headers: AUTH });

      expect(res.status).toBe(404);
      expect(characterService.getById).not.toHaveBeenCalled();
    });

    it('开关开 + 偏好开：缓存命中时可见', async () => {
      loginAs('viewer', { showNsfw: true });
      vi.mocked(cacheService.getCachedCharacter).mockResolvedValue(nsfwCard as never);

      const res = await app.request('/api/v1/characters/nsfw-1', { headers: AUTH });

      expect(res.status).toBe(200);
    });

    it('开关关 + 偏好开：404', async () => {
      config.nsfwEnabled = false;
      loginAs('viewer', { showNsfw: true });
      vi.mocked(characterService.getById).mockResolvedValue(nsfwCard as never);

      const res = await app.request('/api/v1/characters/nsfw-1', { headers: AUTH });

      expect(res.status).toBe(404);
    });

    it('未确认年龄 + 偏好为真：404', async () => {
      loginAs('viewer', { showNsfw: true, ageConfirmed: false });
      vi.mocked(characterService.getById).mockResolvedValue(nsfwCard as never);

      const res = await app.request('/api/v1/characters/nsfw-1', { headers: AUTH });

      expect(res.status).toBe(404);
    });

    it('作者自见：偏好关也能打开自己的 NSFW 卡', async () => {
      loginAs('author', { showNsfw: false });
      vi.mocked(characterService.getById).mockResolvedValue(nsfwCard as never);

      const res = await app.request('/api/v1/characters/nsfw-1', { headers: AUTH });

      expect(res.status).toBe(200);
    });

    it('作者自见：开关关闭时同样可以', async () => {
      config.nsfwEnabled = false;
      loginAs('author', { showNsfw: false });
      vi.mocked(characterService.getById).mockResolvedValue(nsfwCard as never);

      const res = await app.request('/api/v1/characters/nsfw-1', { headers: AUTH });

      expect(res.status).toBe(200);
    });

    it('非 NSFW 的卡不受影响，也不额外查偏好', async () => {
      loginAs('viewer', { showNsfw: false });
      vi.mocked(characterService.getById).mockResolvedValue(plainCard as never);
      vi.mocked(userRepository.findById).mockClear();

      const res = await app.request('/api/v1/characters/plain-1', { headers: AUTH });

      expect(res.status).toBe(200);
      // 只有鉴权中间件那一次查询
      expect(vi.mocked(userRepository.findById).mock.calls.length).toBe(1);
    });
  });

  // ── Fork ──

  describe('POST /:id/fork', () => {
    it('把观看者的可见性传给服务（由服务决定是否 404）', async () => {
      loginAs('viewer', { showNsfw: false });
      vi.mocked(characterService.fork).mockResolvedValue({ id: 'forked' } as never);

      await app.request('/api/v1/characters/nsfw-1/fork', { method: 'POST', headers: AUTH });

      expect(characterService.fork).toHaveBeenCalledWith('nsfw-1', 'viewer', TENANT, { showNsfw: false });
    });

    it('偏好开时传 showNsfw=true', async () => {
      loginAs('viewer', { showNsfw: true });
      vi.mocked(characterService.fork).mockResolvedValue({ id: 'forked' } as never);

      await app.request('/api/v1/characters/nsfw-1/fork', { method: 'POST', headers: AUTH });

      expect(characterService.fork).toHaveBeenCalledWith('nsfw-1', 'viewer', TENANT, { showNsfw: true });
    });
  });

  // ── 导出 ──

  describe('GET /:id/export/json', () => {
    it('开关开 + 偏好关：非作者 404', async () => {
      loginAs('viewer', { showNsfw: false });
      vi.mocked(characterService.getById).mockResolvedValue({ ...nsfwCard, cardData: {} } as never);

      const res = await app.request('/api/v1/characters/nsfw-1/export/json', { headers: AUTH });

      expect(res.status).toBe(404);
    });

    it('开关开 + 偏好开：可导出', async () => {
      loginAs('viewer', { showNsfw: true });
      vi.mocked(characterService.getById).mockResolvedValue({ ...nsfwCard, cardData: {} } as never);

      const res = await app.request('/api/v1/characters/nsfw-1/export/json', { headers: AUTH });

      expect(res.status).toBe(200);
    });

    it('作者可导出自己的卡', async () => {
      loginAs('author', { showNsfw: false });
      vi.mocked(characterService.getById).mockResolvedValue({ ...nsfwCard, cardData: {} } as never);

      const res = await app.request('/api/v1/characters/nsfw-1/export/json', { headers: AUTH });

      expect(res.status).toBe(200);
    });
  });
  describe('POST /export/batch', () => {
    const NSFW_UUID = '11111111-1111-4111-8111-111111111111';
    const batch = () =>
      app.request('/api/v1/characters/export/batch', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterIds: [NSFW_UUID], format: 'json' }),
      });

    it('开关开 + 偏好关：NSFW 卡被跳过（只请求它时 404）', async () => {
      loginAs('viewer', { showNsfw: false });
      vi.mocked(characterService.getById).mockResolvedValue({ ...nsfwCard, id: NSFW_UUID, cardData: {} } as never);

      const res = await batch();

      expect(res.status).toBe(404);
    });

    it('开关开 + 偏好开：可导出', async () => {
      loginAs('viewer', { showNsfw: true });
      vi.mocked(characterService.getById).mockResolvedValue({ ...nsfwCard, id: NSFW_UUID, cardData: {} } as never);

      const res = await batch();

      expect(res.status).toBe(200);
    });

    it('作者偏好关也能批量导出自己的卡', async () => {
      loginAs('author', { showNsfw: false });
      vi.mocked(characterService.getById).mockResolvedValue({ ...nsfwCard, id: NSFW_UUID, cardData: {} } as never);

      const res = await batch();

      expect(res.status).toBe(200);
    });
  });
});
