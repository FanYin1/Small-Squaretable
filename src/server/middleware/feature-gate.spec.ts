/**
 * Feature gate 中间件
 *
 * 重点验一件事：权限判断读的是「生效套餐」而不是「买过什么」。
 * 之前所有 gate 都是 `subscription?.plan || 'free'`，于是付款失败甚至
 * 已取消的订阅照样过 pro 功能的检查，等于用户停付后功能一直开着。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { usageService } from '../services/usage.service';
import { requireFeature, requireQuota, requireFeatureAndQuota } from './feature-gate';
import { PAST_DUE_GRACE_MS } from '../services/entitlement';

vi.mock('../../db/repositories/subscription.repository');
vi.mock('../services/usage.service', () => ({
  usageService: { checkQuota: vi.fn() },
}));

const TENANT = 'tenant-1';

/** 挂上 tenantId 的最小 app，不经过真实 auth/tenant 中间件 */
const appWith = (mw: ReturnType<typeof requireFeature>) => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('tenantId', TENANT);
    await next();
  });
  app.get('/probe', mw, (c) => c.json({ reached: true }));
  return app;
};

const subscription = (over: Record<string, unknown> = {}) =>
  ({
    id: 'sub-row-1',
    tenantId: TENANT,
    plan: 'pro',
    status: 'active',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    stripePriceId: 'price_1',
    currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  // 配额默认充足，这样 feature 相关用例不会被配额挡住
  vi.mocked(usageService.checkQuota).mockResolvedValue({
    currentUsage: 0,
    limit: 10000,
    remaining: 10000,
    allowed: true,
  } as never);
});

describe('requireFeature', () => {
  it('allows an active pro subscription', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(subscription());

    const res = await appWith(requireFeature('advanced_models')).request('/probe');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reached: true });
  });

  it('denies a free user', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(null);

    const res = await appWith(requireFeature('advanced_models')).request('/probe');

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'Upgrade required', currentPlan: 'free' });
  });

  it('revokes pro features once a past_due subscription is out of grace', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(
      subscription({
        status: 'past_due',
        currentPeriodEnd: new Date(Date.now() - PAST_DUE_GRACE_MS - 60_000),
      })
    );

    const res = await appWith(requireFeature('advanced_models')).request('/probe');

    expect(res.status).toBe(403);
    // 提示必须是「订阅失效」而不是「请升级」：用户明明买过
    expect(await res.json()).toMatchObject({
      error: 'Subscription inactive',
      currentPlan: 'free',
      purchasedPlan: 'pro',
      reason: 'past_due_expired',
    });
  });

  it('still serves a past_due user inside the dunning grace window', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(
      subscription({ status: 'past_due', currentPeriodEnd: new Date(Date.now() - 60_000) })
    );

    const res = await appWith(requireFeature('advanced_models')).request('/probe');

    expect(res.status).toBe(200);
  });

  it('revokes pro features on a canceled subscription', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(
      subscription({ status: 'canceled' })
    );

    const res = await appWith(requireFeature('advanced_models')).request('/probe');

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ purchasedPlan: 'pro', reason: 'canceled' });
  });

  it('keeps free-tier features working for a lapsed subscriber', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(
      subscription({ status: 'canceled' })
    );

    const res = await appWith(requireFeature('basic_chat')).request('/probe');

    expect(res.status).toBe(200);
  });

  it('rejects a request with no tenant', async () => {
    const app = new Hono();
    app.get('/probe', requireFeature('basic_chat'), (c) => c.json({ reached: true }));

    const res = await app.request('/probe');

    expect(res.status).toBe(401);
    expect(subscriptionRepository.findByTenantId).not.toHaveBeenCalled();
  });
});

describe('requireQuota', () => {
  it('applies free-tier limits to a lapsed pro subscriber', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(
      subscription({ status: 'canceled' })
    );
    // 200 条已用：低于 pro 的 10000，但高于 free 的 100
    vi.mocked(usageService.checkQuota).mockResolvedValue({
      currentUsage: 200,
      limit: 0,
      remaining: 0,
      allowed: true,
    } as never);

    const res = await appWith(requireQuota('messages')).request('/probe');

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'Quota exceeded', limit: 100 });
  });

  it('applies pro limits while the subscription is active', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(subscription());
    vi.mocked(usageService.checkQuota).mockResolvedValue({
      currentUsage: 200,
      limit: 0,
      remaining: 0,
      allowed: true,
    } as never);

    const res = await appWith(requireQuota('messages')).request('/probe');

    expect(res.status).toBe(200);
  });
});

describe('requireFeatureAndQuota', () => {
  it('fails the feature check first for a lapsed subscriber', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(
      subscription({ status: 'canceled' })
    );

    const res = await appWith(
      requireFeatureAndQuota('advanced_models', 'images')
    ).request('/probe');

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'Subscription inactive' });
    // 功能就没权限，不必再去查用量
    expect(usageService.checkQuota).not.toHaveBeenCalled();
  });

  it('passes both checks for an active pro subscriber', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(subscription());

    const res = await appWith(
      requireFeatureAndQuota('advanced_models', 'images')
    ).request('/probe');

    expect(res.status).toBe(200);
  });
});
