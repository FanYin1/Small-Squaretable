/**
 * User Credits Routes Tests (P3-1)
 *
 * 用户只能看自己租户的余额和流水；流水里不能泄露运营者 id、幂等键、运营备注。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../middleware/error-handler';

vi.mock('../../db/index', () => ({ db: {} }));

const { mockSummary, mockLedger, cfg } = vi.hoisted(() => ({
  mockSummary: vi.fn(),
  mockLedger: vi.fn(),
  cfg: { billingMode: 'credits', creditTokensPerPoint: 10000 },
}));

vi.mock('../services/credit.service', () => ({
  creditService: { getSummary: mockSummary, listLedger: mockLedger },
}));

vi.mock('../../core/config', () => ({ config: cfg }));

vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', { id: 'user-1', tenantId: 'tenant-1', email: 'u@example.com', role: 'user' });
    c.set('tenantId', 'tenant-1');
    return next();
  },
}));

import { creditRoutes } from './credits';

const BASE = '/api/v1/credits';
let app: Hono;

const summary = {
  tokensPerPoint: 10000,
  balanceTokens: 62000,
  heldTokens: 0,
  availableTokens: 62000,
  balancePoints: 6.2,
  availablePoints: 6.2,
};

beforeEach(() => {
  app = new Hono();
  app.route(BASE, creditRoutes);
  app.onError(errorHandler);
  vi.clearAllMocks();
  cfg.billingMode = 'credits';
  mockSummary.mockResolvedValue(summary);
  mockLedger.mockResolvedValue({ items: [], total: 0 });
});

describe('GET /balance', () => {
  it('返回当前租户的余额概览和计费模式', async () => {
    const res = await app.request(`${BASE}/balance`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockSummary).toHaveBeenCalledWith('tenant-1');
    expect(body.data).toEqual({ billingMode: 'credits', ...summary });
  });

  it('订阅模式下也能调用，billingMode 让前端决定是否展示', async () => {
    cfg.billingMode = 'subscription';

    const res = await app.request(`${BASE}/balance`);

    expect((await res.json()).data.billingMode).toBe('subscription');
  });
});

describe('GET /ledger', () => {
  const rows = [
    {
      id: 'l1',
      tenantId: 'tenant-1',
      kind: 'charge',
      amount: -6200,
      chatId: 'chat-1',
      messageId: 42,
      operatorId: null,
      idempotencyKey: null,
      note: null,
      metadata: { inputTokens: 6000, outputTokens: 200, secret: 'x' },
      createdAt: '2026-10-18T00:00:00.000Z',
    },
    {
      id: 'l2',
      tenantId: 'tenant-1',
      kind: 'topup',
      amount: 100000,
      chatId: null,
      messageId: null,
      operatorId: 'admin-1',
      idempotencyKey: 'topup-key-0001',
      note: '内部备注：线下转账',
      metadata: { points: 10, targetUserId: 'user-1' },
      createdAt: '2026-10-17T00:00:00.000Z',
    },
  ];

  it('只查当前租户，并带分页信息', async () => {
    mockLedger.mockResolvedValue({ items: rows, total: 45 });

    const res = await app.request(`${BASE}/ledger?page=2&limit=20`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockLedger).toHaveBeenCalledWith('tenant-1', { page: 2, limit: 20 });
    expect(body.data.pagination).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('消费流水带上 chat / message 追溯和输入输出拆分，并换算成点数', async () => {
    mockLedger.mockResolvedValue({ items: rows, total: 2 });

    const { data } = await (await app.request(`${BASE}/ledger`)).json();

    expect(data.items[0]).toEqual({
      id: 'l1',
      kind: 'charge',
      tokens: -6200,
      points: -0.62,
      chatId: 'chat-1',
      messageId: 42,
      inputTokens: 6000,
      outputTokens: 200,
      createdAt: '2026-10-18T00:00:00.000Z',
    });
  });

  it('不泄露运营者 id、幂等键、运营备注和其它 metadata', async () => {
    mockLedger.mockResolvedValue({ items: rows, total: 2 });

    const text = await (await app.request(`${BASE}/ledger`)).text();

    expect(text).not.toContain('admin-1');
    expect(text).not.toContain('topup-key-0001');
    expect(text).not.toContain('内部备注');
    expect(text).not.toContain('operatorId');
    expect(text).not.toContain('idempotencyKey');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('targetUserId');
  });

  it('metadata 缺失时不报错', async () => {
    mockLedger.mockResolvedValue({ items: [{ ...rows[1], metadata: null }], total: 1 });

    const res = await app.request(`${BASE}/ledger`);

    expect(res.status).toBe(200);
    expect((await res.json()).data.items[0].inputTokens).toBeUndefined();
  });

  it('空流水 totalPages 为 0 且没有上下页', async () => {
    const { data } = await (await app.request(`${BASE}/ledger`)).json();

    expect(data.items).toEqual([]);
    expect(data.pagination).toMatchObject({ total: 0, totalPages: 0, hasNext: false, hasPrev: false });
  });

  it('非法分页参数返回 400', async () => {
    const res = await app.request(`${BASE}/ledger?limit=100000`);

    expect(res.status).toBe(400);
    expect(mockLedger).not.toHaveBeenCalled();
  });
});

describe('没有写入口', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s /balance 与 /ledger 都不存在', async (method) => {
    const responses = await Promise.all([
      app.request(`${BASE}/balance`, { method }),
      app.request(`${BASE}/ledger`, { method }),
    ]);

    for (const res of responses) expect(res.status).toBe(404);
  });
});
