import { describe, it, expect } from 'vitest';
import {
  resolveEntitlement,
  resolveEffectivePlan,
  isSuspended,
  PAST_DUE_GRACE_MS,
  type EntitlementSource,
} from './entitlement';

const sub = (over: Partial<EntitlementSource> = {}): EntitlementSource => ({
  plan: 'pro',
  status: 'active',
  currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
  ...over,
});

describe('resolveEntitlement', () => {
  it('treats a missing subscription as free', () => {
    expect(resolveEntitlement(null)).toEqual({
      plan: 'free',
      purchasedPlan: 'free',
      reason: 'no_subscription',
    });
  });

  it('honors an active subscription', () => {
    expect(resolveEntitlement(sub({ plan: 'team' }))).toMatchObject({
      plan: 'team',
      reason: 'active',
    });
  });

  it('honors a trial as the purchased plan', () => {
    expect(resolveEntitlement(sub({ status: 'trialing' }))).toMatchObject({
      plan: 'pro',
      reason: 'trialing',
    });
  });

  describe('past_due', () => {
    const paidThrough = new Date('2026-03-01T00:00:00Z');

    it('keeps the plan inside the dunning grace window', () => {
      const oneDayLate = new Date(paidThrough.getTime() + 24 * 60 * 60 * 1000);

      expect(resolveEntitlement(sub({ status: 'past_due', currentPeriodEnd: paidThrough }), oneDayLate))
        .toMatchObject({ plan: 'pro', purchasedPlan: 'pro', reason: 'past_due_grace' });
    });

    it('drops to free once the grace window closes', () => {
      const tooLate = new Date(paidThrough.getTime() + PAST_DUE_GRACE_MS + 1000);

      expect(resolveEntitlement(sub({ status: 'past_due', currentPeriodEnd: paidThrough }), tooLate))
        .toMatchObject({ plan: 'free', purchasedPlan: 'pro', reason: 'past_due_expired' });
    });

    it('does not grant an open-ended grace when there is no period end', () => {
      expect(resolveEntitlement(sub({ status: 'past_due', currentPeriodEnd: null })))
        .toMatchObject({ plan: 'free', reason: 'past_due_expired' });
    });

    it('is exactly at the boundary, not one tick past it', () => {
      const atBoundary = new Date(paidThrough.getTime() + PAST_DUE_GRACE_MS);
      const justAfter = new Date(paidThrough.getTime() + PAST_DUE_GRACE_MS + 1);
      const record = sub({ status: 'past_due', currentPeriodEnd: paidThrough });

      expect(resolveEffectivePlan(record, atBoundary)).toBe('pro');
      expect(resolveEffectivePlan(record, justAfter)).toBe('free');
    });
  });

  it('revokes a canceled subscription with no grace', () => {
    // Stripe 会把订阅留到周期结束才置 canceled，所以到这一步就是真的结束了
    const future = new Date('2099-01-01T00:00:00Z');

    expect(resolveEntitlement(sub({ status: 'canceled', currentPeriodEnd: future })))
      .toMatchObject({ plan: 'free', purchasedPlan: 'pro', reason: 'canceled' });
  });

  it('falls back to free on an unknown status instead of letting it through', () => {
    const weird = sub({ status: 'incomplete_expired' as never });
    expect(resolveEffectivePlan(weird)).toBe('free');
  });

  it('never upgrades anyone: effective plan is at most the purchased plan', () => {
    const cases: EntitlementSource[] = [
      sub({ plan: 'free', status: 'active' }),
      sub({ plan: 'free', status: 'past_due' }),
      sub({ plan: 'free', status: 'canceled' }),
      sub({ plan: 'pro', status: 'canceled' }),
    ];

    for (const record of cases) {
      const { plan, purchasedPlan } = resolveEntitlement(record);
      expect([purchasedPlan, 'free']).toContain(plan);
    }
  });
});

describe('isSuspended', () => {
  it('flags a downgrade so the UI can say "fix your payment" not "upgrade"', () => {
    const lapsed = resolveEntitlement(
      sub({ status: 'past_due', currentPeriodEnd: new Date('2020-01-01T00:00:00Z') })
    );
    expect(isSuspended(lapsed)).toBe(true);
  });

  it('is false for a genuinely free user', () => {
    expect(isSuspended(resolveEntitlement(null))).toBe(false);
  });
});
