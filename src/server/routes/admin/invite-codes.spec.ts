/**
 * Admin Invite Code Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../../middleware/error-handler';
import { NotFoundError } from '../../../core/errors';

vi.mock('../../../db/index', () => ({ db: {} }));

const { mockGenerate, mockList, mockDisable, mockListUses, authState } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockList: vi.fn(),
  mockDisable: vi.fn(),
  mockListUses: vi.fn(),
  authState: { role: 'admin' as 'admin' | 'user' | 'moderator' },
}));

vi.mock('../../services/invite-code.service', () => ({
  inviteCodeService: {
    generate: mockGenerate,
    list: mockList,
    disable: mockDisable,
    listUses: mockListUses,
  },
}));

// 用真实的 requireRole，只替换认证中间件：403 要测真实的 RBAC，而不是 mock 出来的。
vi.mock('../../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'admin-123',
      tenantId: 'tenant-123',
      email: 'admin@example.com',
      displayName: 'Admin',
      avatarUrl: null,
      role: authState.role,
    });
    c.set('tenantId', 'tenant-123');
    return next();
  },
}));

import { adminInviteCodeRoutes } from './invite-codes';

const ID = '3f2b8a52-6f0e-4a55-9a7c-0d6a1f0c9e11';
const BASE = '/api/v1/admin/invite-codes';

const post = (path: string, body?: unknown) =>
  app.request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

let app: Hono;

beforeEach(() => {
  app = new Hono();
  app.route(BASE, adminInviteCodeRoutes);
  app.onError(errorHandler);
  vi.clearAllMocks();
  authState.role = 'admin';
});

describe('权限：非 admin 一律 403，且不触达 service', () => {
  it.each(['user', 'moderator'] as const)('%s 角色', async (role) => {
    authState.role = role;

    const responses = await Promise.all([
      app.request(BASE),
      post('', { count: 1, maxUses: 1 }),
      post(`/${ID}/disable`),
      app.request(`${BASE}/${ID}/uses`),
    ]);

    for (const res of responses) expect(res.status).toBe(403);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
    expect(mockListUses).not.toHaveBeenCalled();
  });
});

describe('POST / 批量生成', () => {
  it('按数量、次数、过期时间、备注生成，201 返回码列表', async () => {
    mockGenerate.mockResolvedValue([
      { id: 'a', code: 'AAAA-2222-BBBB', maxUses: 5, usedCount: 0 },
      { id: 'b', code: 'CCCC-3333-DDDD', maxUses: 5, usedCount: 0 },
    ]);
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();

    const res = await post('', { count: 2, maxUses: 5, expiresAt, note: 'beta' });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(mockGenerate).toHaveBeenCalledWith(
      { count: 2, maxUses: 5, expiresAt: new Date(expiresAt), note: 'beta' },
      expect.objectContaining({ adminId: 'admin-123', tenantId: 'tenant-123' }),
    );
  });

  it('count / maxUses 缺省为 1，不过期', async () => {
    mockGenerate.mockResolvedValue([]);

    const res = await post('', {});

    expect(res.status).toBe(201);
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1, maxUses: 1, expiresAt: undefined }),
      expect.anything(),
    );
  });

  it.each([
    ['count 为 0', { count: 0 }],
    ['count 超过 100', { count: 101 }],
    ['count 非整数', { count: 1.5 }],
    ['maxUses 为 0', { maxUses: 0 }],
    ['maxUses 为负', { maxUses: -1 }],
    ['expiresAt 不是时间', { expiresAt: 'tomorrow' }],
    ['expiresAt 已过去', { expiresAt: '2020-01-01T00:00:00.000Z' }],
    ['note 超长', { note: 'x'.repeat(201) }],
  ])('参数非法（%s）→ 400，不生成', async (_label, body) => {
    const res = await post('', body);

    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe('GET / 列表', () => {
  it('返回码、已用次数与分页信息', async () => {
    mockList.mockResolvedValue({
      items: [{ id: 'a', code: 'AAAA-2222-BBBB', maxUses: 5, usedCount: 2, disabled: false }],
      total: 41,
    });

    const res = await app.request(`${BASE}?page=2&limit=20`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items[0].usedCount).toBe(2);
    expect(body.data.pagination).toEqual({
      page: 2,
      limit: 20,
      total: 41,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
    expect(mockList).toHaveBeenCalledWith({ page: 2, limit: 20 });
  });

  it('不带分页参数时用默认值', async () => {
    mockList.mockResolvedValue({ items: [], total: 0 });

    await app.request(BASE);

    expect(mockList).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('limit 超过上限 → 400', async () => {
    const res = await app.request(`${BASE}?limit=1000`);

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('POST /:id/disable 停用', () => {
  it('停用成功', async () => {
    mockDisable.mockResolvedValue({ id: ID, code: 'AAAA-2222-BBBB', disabled: true });

    const res = await post(`/${ID}/disable`);

    expect(res.status).toBe(200);
    expect((await res.json()).data.disabled).toBe(true);
    expect(mockDisable).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ adminId: 'admin-123', tenantId: 'tenant-123' }),
    );
  });

  it('码不存在 → 404', async () => {
    mockDisable.mockRejectedValue(new NotFoundError('Invite code'));

    const res = await post(`/${ID}/disable`);

    expect(res.status).toBe(404);
  });

  it('id 不是 uuid → 400，不查库', async () => {
    const res = await post('/not-a-uuid/disable');

    expect(res.status).toBe(400);
    expect(mockDisable).not.toHaveBeenCalled();
  });
});

describe('GET /:id/uses 使用记录（追溯谁用了这个码）', () => {
  it('返回使用者与使用时间', async () => {
    mockListUses.mockResolvedValue([
      { id: 'u1', userId: 'user-1', userEmail: 'a@example.com', usedAt: new Date().toISOString() },
    ]);

    const res = await app.request(`${BASE}/${ID}/uses`);

    expect(res.status).toBe(200);
    expect((await res.json()).data[0].userEmail).toBe('a@example.com');
    expect(mockListUses).toHaveBeenCalledWith(ID);
  });

  it('码不存在 → 404', async () => {
    mockListUses.mockRejectedValue(new NotFoundError('Invite code'));

    const res = await app.request(`${BASE}/${ID}/uses`);

    expect(res.status).toBe(404);
  });
});
