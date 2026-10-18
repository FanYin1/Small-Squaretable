import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 预付点数模式下的配额检查（P3-1）。
 * 订阅模式的行为由 feature.service.spec.ts 覆盖且保持不变；这里只验证 credits 模式。
 */

const { mockConfig } = vi.hoisted(() => ({ mockConfig: { billingMode: 'credits' as 'credits' | 'subscription' } }));

vi.mock('../../core/config', () => ({ config: mockConfig }));
vi.mock('../../db/repositories/subscription.repository');
vi.mock('./usage.service');

import { featureService } from './feature.service';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { usageService } from './usage.service';

describe('FeatureService.checkQuota in credits mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.billingMode = 'credits';
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(null);
  });

  it.each(['messages', 'llm_tokens'] as const)('%s: 套餐配额已用完也放行，用量照常返回', async (resource) => {
    vi.mocked(usageService.checkQuota).mockResolvedValue({
      allowed: false,
      currentUsage: 999_999_999,
      limit: 0,
      remaining: 0,
    } as any);

    const result = await featureService.checkQuota('t1', resource);

    expect(result.allowed).toBe(true);
    expect(result.currentUsage).toBe(999_999_999);
    expect(result.limit).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('images 仍按套餐限额（free = 10）', async () => {
    vi.mocked(usageService.checkQuota).mockResolvedValue({ currentUsage: 10 } as any);

    const result = await featureService.checkQuota('t1', 'images');

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(10);
  });

  it('订阅模式下 messages 仍按套餐限额（free = 100）', async () => {
    mockConfig.billingMode = 'subscription';
    vi.mocked(usageService.checkQuota).mockResolvedValue({ currentUsage: 100 } as any);

    const result = await featureService.checkQuota('t1', 'messages');

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(100);
  });
});
