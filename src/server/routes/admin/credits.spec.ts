/**
 * Admin Credits Routes Tests (P3-1)
 *
 * service 被替换：这里验证 RBAC、参数校验、状态码、以及 actor（谁在操作）是否传给 service。
 * 账本与审计的落库规则由 credit.service.spec.ts 守住。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../../middleware/error-handler';
import { AppError, NotFoundError } from '../../../core/errors';

vi.mock('../../../db/index', () => ({ db: {} }));

const { mockLookup, mockTopUp, mockReverse, mockEntries, authState } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
  mockTopUp: vi.fn(),
  mockReverse: vi.fn(),
  mockEntries: vi.fn(),
  authState: { role: 'admin' as 'admin' | 'user' | 'moderator' },
}));

vi.mock('../../services/credit.service', () => ({
  MAX_TOPUP_POINTS: 100000,
  creditService: {
    lookupUser: mockLookup,
    topUp: mockTopUp,
    reverse: mockReverse,
    listOperatorEntries: mockEntries,
  },
}));

// 用真实的 requireRole，只替换认证中间件
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

import { adminCreditRoutes } from './credits';

const USER_ID = '3f2b8a52-6f0e-4a55-9a7c-0d6a1f0c9e11';
const ENTRY_ID = '9a1c2d3e-4b5f-4a6b-8c7d-0e1f2a3b4c5d';
const BASE = '/api/v1/admin/credits';

let app: Hono;

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const validTopUp = { userId: USER_ID, points: 10, idempotencyKey: 'topup-key-0001' };

beforeEach(() => {
  app = new Hono();
  app.route(BASE, adminCreditRoutes);
  app.onError(errorHandler);
  vi.clearAllMocks();
  authState.role = 'admin';
  mockTopUp.mockResolvedValue({ entry: { id: 'e1' }, summary: {}, replayed: false });
  mockReverse.mockResolvedValue({ entry: { id: 'e2' }, summary: {}, replayed: false });
  mockEntries.mockResolvedValue({ items: [], total: 0 });
});

describe('权限：非 admin 一律 403，且不触达 service', () => {
  it.each(['user', 'moderator'] as const)('%s 角色', async (role) => {
    authState.role = role;

    const responses = await Promise.all([
      app.request(`${BASE}/lookup?userId=${USER_ID}`),
      post('/topups', validTopUp),
      post(`/entries/${ENTRY_ID}/reverse`, {}),
      app.request(`${BASE}/entries`),
    ]);

    for (const res of responses) expect(res.status).toBe(403);
    expect(mockLookup).not.toHaveBeenCalled();
    expect(mockTopUp).not.toHaveBeenCalled();
    expect(mockReverse).not.toHaveBeenCalled();
    expect(mockEntries).not.toHaveBeenCalled();
  });
});

describe('GET /lookup', () => {
  it('按 userId 查询', async () => {
    mockLookup.mockResolvedValue({ user: { id: USER_ID }, summary: { balanceTokens: 0 } });

    const res = await app.request(`${BASE}/lookup?userId=${USER_ID}`);

    expect(res.status).toBe(200);
    expect(mockLookup).toHaveBeenCalledWith({ userId: USER_ID });
    expect((await res.json()).data.user.id).toBe(USER_ID);
  });

  it('按邮箱查询', async () => {
    mockLookup.mockResolvedValue({ user: {}, summary: {} });

    await app.request(`${BASE}/lookup?email=u@example.com`);

    expect(mockLookup).toHaveBeenCalledWith({ email: 'u@example.com' });
  });

  it.each([
    ['两个都不给', ''],
    ['两个都给', `?userId=${USER_ID}&email=u@example.com`],
    ['userId 不是 uuid', '?userId=abc'],
    ['邮箱格式错误', '?email=nope'],
  ])('参数错误返回 400：%s', async (_label, query) => {
    const res = await app.request(`${BASE}/lookup${query}`);

    expect(res.status).toBe(400);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('账号不存在时 404', async () => {
    mockLookup.mockRejectedValue(new NotFoundError('User'));

    const res = await app.request(`${BASE}/lookup?userId=${USER_ID}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /topups', () => {
  it('新充值返回 201，并把操作者与 IP 交给 service', async () => {
    const res = await post('/topups', { ...validTopUp, note: '线下转账' }, { 'x-forwarded-for': '203.0.113.9' });

    expect(res.status).toBe(201);
    expect(mockTopUp).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, points: 10, note: '线下转账', idempotencyKey: 'topup-key-0001' }),
      { adminId: 'admin-123', tenantId: 'tenant-123', actorIp: '203.0.113.9' }
    );
  });

  it('幂等键重放返回 200', async () => {
    mockTopUp.mockResolvedValue({ entry: { id: 'e1' }, summary: {}, replayed: true });

    const res = await post('/topups', validTopUp);

    expect(res.status).toBe(200);
    expect((await res.json()).data.replayed).toBe(true);
  });

  it('支持按邮箱充值', async () => {
    const res = await post('/topups', { email: 'u@example.com', points: 1.5, idempotencyKey: 'topup-key-0002' });

    expect(res.status).toBe(201);
    expect(mockTopUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'u@example.com', points: 1.5 }), expect.anything());
  });

  it.each([
    ['缺少幂等键', { userId: USER_ID, points: 10 }],
    ['幂等键过短', { ...validTopUp, idempotencyKey: 'short' }],
    ['金额为 0', { ...validTopUp, points: 0 }],
    ['金额为负', { ...validTopUp, points: -3 }],
    ['金额超过单次上限', { ...validTopUp, points: 100001 }],
    ['金额不是数字', { ...validTopUp, points: '10' }],
    ['小数超过 4 位', { ...validTopUp, points: 0.00001 }],
    ['userId 与 email 都不给', { points: 10, idempotencyKey: 'topup-key-0003' }],
    ['userId 与 email 都给', { ...validTopUp, email: 'u@example.com' }],
    ['备注过长', { ...validTopUp, note: 'x'.repeat(201) }],
  ])('参数错误返回 400 且不入账：%s', async (_label, body) => {
    const res = await post('/topups', body);

    expect(res.status).toBe(400);
    expect(mockTopUp).not.toHaveBeenCalled();
  });

  it('接受恰好 4 位小数', async () => {
    const res = await post('/topups', { ...validTopUp, points: 0.1234 });

    expect(res.status).toBe(201);
  });

  it('把 service 的 409 原样返回', async () => {
    // CreditConflictError 就是 409 的 AppError；service 已被替换，用同形状的错误验证错误处理链
    mockTopUp.mockRejectedValue(new AppError('conflict', 409, 'IDEMPOTENCY_CONFLICT'));

    const res = await post('/topups', validTopUp);

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

describe('POST /entries/:id/reverse', () => {
  it('冲正返回 201，并传入备注与操作者', async () => {
    const res = await post(`/entries/${ENTRY_ID}/reverse`, { note: '录错了' });

    expect(res.status).toBe(201);
    expect(mockReverse).toHaveBeenCalledWith(
      ENTRY_ID,
      { note: '录错了' },
      { adminId: 'admin-123', tenantId: 'tenant-123', actorIp: undefined }
    );
  });

  it('id 不是 uuid 时 400', async () => {
    const res = await post('/entries/not-a-uuid/reverse', {});

    expect(res.status).toBe(400);
    expect(mockReverse).not.toHaveBeenCalled();
  });

  it('备注过长时 400', async () => {
    const res = await post(`/entries/${ENTRY_ID}/reverse`, { note: 'x'.repeat(201) });

    expect(res.status).toBe(400);
    expect(mockReverse).not.toHaveBeenCalled();
  });

  it('记录不存在时 404', async () => {
    mockReverse.mockRejectedValue(new NotFoundError('Ledger entry'));

    const res = await post(`/entries/${ENTRY_ID}/reverse`, {});

    expect(res.status).toBe(404);
  });
});

describe('GET /entries', () => {
  it('返回分页信息', async () => {
    mockEntries.mockResolvedValue({ items: [{ id: 'a' }, { id: 'b' }], total: 45 });

    const res = await app.request(`${BASE}/entries?page=2&limit=20`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockEntries).toHaveBeenCalledWith({ page: 2, limit: 20 });
    expect(body.data.items).toHaveLength(2);
    expect(body.data.pagination).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('非法分页参数返回 400', async () => {
    const res = await app.request(`${BASE}/entries?page=0`);

    expect(res.status).toBe(400);
    expect(mockEntries).not.toHaveBeenCalled();
  });
});
