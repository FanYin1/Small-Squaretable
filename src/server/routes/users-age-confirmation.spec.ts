/**
 * POST /api/v1/users/me/age-confirmation（P2-6 遗留：存量用户补确认年龄）
 *
 * 这里用真实的 authMiddleware 和真实的 NsfwPreferenceService，只替换仓储 / JWT / 审计，
 * 这样「未登录 401」和「确认之后才能打开 NSFW 偏好」都是端到端走过路由的。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

const { repo, row, verifyAccessToken, auditLog } = vi.hoisted(() => {
  const row = {
    current: null as null | Record<string, unknown>,
  };
  return {
    row,
    repo: { findById: vi.fn(), update: vi.fn() },
    verifyAccessToken: vi.fn(),
    auditLog: vi.fn(),
  };
});

vi.mock('../../db/repositories/user.repository', () => ({ userRepository: repo }));
vi.mock('../services/user.service', () => ({ userService: {} }));
vi.mock('../services/audit.service', () => ({ auditService: { log: auditLog } }));
vi.mock('../../core/jwt', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../core/jwt');
  return { ...actual, verifyAccessToken };
});

import { userRoutes } from './users';
import { errorHandler } from '../middleware/error-handler';
import { config } from '../../core/config';

const AUTH = { Authorization: 'Bearer test-token' };

describe('POST /api/v1/users/me/age-confirmation', () => {
  let app: Hono;
  const originalNsfw = config.nsfwEnabled;

  beforeEach(() => {
    vi.clearAllMocks();
    config.nsfwEnabled = originalNsfw;
    app = new Hono();
    app.route('/api/v1/users', userRoutes);
    app.onError(errorHandler);

    row.current = {
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'old@example.com',
      displayName: 'Old',
      avatarUrl: null,
      role: 'user',
      isActive: true,
      totpEnabled: false,
      showNsfw: false,
      ageConfirmedAt: null,
      ageConfirmedIp: null,
    };
    verifyAccessToken.mockResolvedValue({ userId: 'user-1' });
    repo.findById.mockImplementation(async () => row.current);
    repo.update.mockImplementation(async (_id: string, data: Record<string, unknown>) => {
      row.current = { ...row.current, ...data };
      return row.current;
    });
  });

  const post = (headers: Record<string, string> = AUTH) =>
    app.request('/api/v1/users/me/age-confirmation', { method: 'POST', headers });

  it('未登录 -> 401，且不碰数据', async () => {
    const res = await post({});

    expect(res.status).toBe(401);
    expect(repo.update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('成功：返回与 GET /me/preferences 同形的状态，ageConfirmed=true', async () => {
    const res = await post({ ...AUTH, 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ nsfwEnabled: true, showNsfw: false, ageConfirmed: true });
    // 只取 x-forwarded-for 的第一跳，并且只存哈希
    expect(row.current?.ageConfirmedAt).toBeInstanceOf(Date);
    expect(row.current?.ageConfirmedIp).toMatch(/^[0-9a-f]{16}$/);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        actorIp: '203.0.113.7',
        action: 'age_confirm',
        metadata: { source: 'settings' },
      }),
    );
  });

  it('重复调用：200 且不覆盖第一次的时间 / IP，不重复写审计', async () => {
    await post({ ...AUTH, 'x-real-ip': '203.0.113.7' });
    const firstAt = row.current?.ageConfirmedAt;
    const firstIp = row.current?.ageConfirmedIp;

    const res = await post({ ...AUTH, 'x-real-ip': '198.51.100.9' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.ageConfirmed).toBe(true);
    expect(row.current?.ageConfirmedAt).toBe(firstAt);
    expect(row.current?.ageConfirmedIp).toBe(firstIp);
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it('平台开关关闭时仍可确认', async () => {
    config.nsfwEnabled = false;

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ nsfwEnabled: false, showNsfw: false, ageConfirmed: true });
  });

  it('确认前 PATCH /me/preferences showNsfw=true 为 403，确认后成功', async () => {
    const patch = () =>
      app.request('/api/v1/users/me/preferences', {
        method: 'PATCH',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ showNsfw: true }),
      });

    const denied = await patch();
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe('AGE_CONFIRMATION_REQUIRED');

    expect((await post()).status).toBe(200);

    const allowed = await patch();
    const body = await allowed.json();
    expect(allowed.status).toBe(200);
    expect(body.data).toEqual({ nsfwEnabled: true, showNsfw: true, ageConfirmed: true });
  });
});
