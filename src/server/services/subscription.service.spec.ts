/**
 * Subscription Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { NotFoundError, ValidationError } from '../../core/errors';
import type Stripe from 'stripe';

// Mock repositories
vi.mock('../../db/repositories/subscription.repository');
vi.mock('../../db/repositories/user.repository');

// webhook 去重表。这里默认「抢占成功」，让每个用例都走完整的处理链路；
// 去重本身（重复投递、失败重试、卡死回收）在
// subscription-webhook.integration.spec.ts 和 repository 自己的 spec 里验。
vi.mock('../../db/repositories/stripe-webhook-event.repository', () => ({
  stripeWebhookEventRepository: {
    claim: vi.fn().mockResolvedValue(true),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
  },
}));

// Create mock Stripe instance - must be defined before vi.mock
const mockCustomersCreate = vi.fn();
const mockCheckoutSessionsCreate = vi.fn();
const mockBillingPortalSessionsCreate = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockWebhooksConstructEvent = vi.fn();
const mockChargesRetrieve = vi.fn();

// Mock Stripe constructor
vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      customers = { create: mockCustomersCreate };
      checkout = { sessions: { create: mockCheckoutSessionsCreate } };
      billingPortal = { sessions: { create: mockBillingPortalSessionsCreate } };
      subscriptions = { retrieve: mockSubscriptionsRetrieve };
      charges = { retrieve: mockChargesRetrieve };
      webhooks = { constructEvent: mockWebhooksConstructEvent };
    },
  };
});

// 退款/拒付要留审计痕迹。auditService 是 fire-and-forget 的，不会影响主流程，
// 但「谁在什么时候被吊销了权限」是财务对账要查的，所以这里断言它被写了。
const mockAuditLog = vi.fn();
vi.mock('./audit.service', () => ({
  auditService: { log: mockAuditLog },
}));

// Import after mocks
const { SubscriptionService } = await import('./subscription.service');

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SubscriptionService();
  });

  describe('getSubscriptionStatus', () => {
    it('should return subscription for tenant', async () => {
      const mockSubscription = {
        id: '1',
        tenantId: 'tenant-1',
        plan: 'pro' as const,
        status: 'active' as const,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_123',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(mockSubscription);

      const result = await service.getSubscriptionStatus('tenant-1');

      expect(result).toEqual(mockSubscription);
      expect(subscriptionRepository.findByTenantId).toHaveBeenCalledWith('tenant-1');
    });

    it('should return null when subscription not found', async () => {
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(null);

      const result = await service.getSubscriptionStatus('tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('createOrGetCustomer', () => {
    it('should return existing customer ID if subscription exists', async () => {
      const mockSubscription = {
        id: '1',
        tenantId: 'tenant-1',
        plan: 'free' as const,
        status: 'active' as const,
        stripeCustomerId: 'cus_existing',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(mockSubscription);

      const result = await service.createOrGetCustomer('tenant-1', 'test@example.com');

      expect(result).toBe('cus_existing');
      expect(mockCustomersCreate).not.toHaveBeenCalled();
    });

    it('should create new customer and update subscription', async () => {
      const mockSubscription = {
        id: '1',
        tenantId: 'tenant-1',
        plan: 'free' as const,
        status: 'active' as const,
        stripeCustomerId: null,
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(mockSubscription);
      mockCustomersCreate.mockResolvedValue({ id: 'cus_new' });
      vi.mocked(subscriptionRepository.update).mockResolvedValue({
        ...mockSubscription,
        stripeCustomerId: 'cus_new',
      });

      const result = await service.createOrGetCustomer('tenant-1', 'test@example.com');

      expect(result).toBe('cus_new');
      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'test@example.com',
        metadata: { tenantId: 'tenant-1' },
      });
      expect(subscriptionRepository.update).toHaveBeenCalledWith('1', {
        stripeCustomerId: 'cus_new',
      });
    });

    it('should create new customer and subscription if none exists', async () => {
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(null);
      mockCustomersCreate.mockResolvedValue({ id: 'cus_new' });
      vi.mocked(subscriptionRepository.create).mockResolvedValue({
        id: '1',
        tenantId: 'tenant-1',
        plan: 'free',
        status: 'active',
        stripeCustomerId: 'cus_new',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createOrGetCustomer('tenant-1', 'test@example.com');

      expect(result).toBe('cus_new');
      expect(subscriptionRepository.create).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        stripeCustomerId: 'cus_new',
        plan: 'free',
        status: 'active',
      });
    });
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session successfully', async () => {
      const mockSubscription = {
        id: '1',
        tenantId: 'tenant-1',
        plan: 'free' as const,
        status: 'active' as const,
        stripeCustomerId: 'cus_123',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(mockSubscription);
      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/session/cs_123',
      });

      const result = await service.createCheckoutSession(
        'tenant-1',
        'test@example.com',
        'price_pro_monthly',
        'https://app.com/success',
        'https://app.com/cancel'
      );

      expect(result).toBe('https://checkout.stripe.com/session/cs_123');
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
        customer: 'cus_123',
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: 'price_pro_monthly', quantity: 1 }],
        success_url: 'https://app.com/success',
        cancel_url: 'https://app.com/cancel',
        metadata: { tenantId: 'tenant-1' },
      });
    });

    it('should throw ValidationError if session URL is missing', async () => {
      const mockSubscription = {
        id: '1',
        tenantId: 'tenant-1',
        plan: 'free' as const,
        status: 'active' as const,
        stripeCustomerId: 'cus_123',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(mockSubscription);
      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_123',
        url: null,
      });

      await expect(
        service.createCheckoutSession(
          'tenant-1',
          'test@example.com',
          'price_pro_monthly',
          'https://app.com/success',
          'https://app.com/cancel'
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('createBillingPortalSession', () => {
    it('should create billing portal session successfully', async () => {
      const mockSubscription = {
        id: '1',
        tenantId: 'tenant-1',
        plan: 'pro' as const,
        status: 'active' as const,
        stripeCustomerId: 'cus_123',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(mockSubscription);
      mockBillingPortalSessionsCreate.mockResolvedValue({
        id: 'bps_123',
        url: 'https://billing.stripe.com/session/bps_123',
      });

      const result = await service.createBillingPortalSession('tenant-1', 'https://app.com/return');

      expect(result).toBe('https://billing.stripe.com/session/bps_123');
      expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'https://app.com/return',
      });
    });

    it('should throw NotFoundError if subscription not found', async () => {
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(null);

      await expect(
        service.createBillingPortalSession('tenant-1', 'https://app.com/return')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError if customer ID is missing', async () => {
      const mockSubscription = {
        id: '1',
        tenantId: 'tenant-1',
        plan: 'free' as const,
        status: 'active' as const,
        stripeCustomerId: null,
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(mockSubscription);

      await expect(
        service.createBillingPortalSession('tenant-1', 'https://app.com/return')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('handleWebhook', () => {
    it('should throw ValidationError on invalid signature', async () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        service.handleWebhook('payload', 'invalid_signature')
      ).rejects.toThrow(ValidationError);
    });

    it('should handle checkout.session.completed event', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            metadata: { tenantId: 'tenant-1' },
            subscription: 'sub_123',
          },
        },
      } as Stripe.Event;

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_123',
        items: {
          data: [{ price: { id: 'price_pro_monthly' } }],
        },
        billing_cycle_anchor: 1704067200,
        cancel_at: null,
        cancel_at_period_end: false,
      } as any);

      vi.mocked(subscriptionRepository.updateByTenantId).mockResolvedValue({
        id: '1',
        tenantId: 'tenant-1',
        plan: 'pro',
        status: 'active',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro_monthly',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.handleWebhook('payload', 'valid_signature');

      expect(subscriptionRepository.updateByTenantId).toHaveBeenCalledWith('tenant-1', {
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro_monthly',
        plan: 'pro',
        status: 'active',
        currentPeriodStart: expect.any(Date),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    });

    it('should handle customer.subscription.updated event', async () => {
      const mockEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            items: {
              data: [{ price: { id: 'price_pro_yearly' } }],
            },
            status: 'active',
            billing_cycle_anchor: 1704067200,
            cancel_at: null,
            cancel_at_period_end: false,
          },
        },
      } as Stripe.Event;

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);
      vi.mocked(subscriptionRepository.updateByStripeSubscriptionId).mockResolvedValue({
        id: '1',
        tenantId: 'tenant-1',
        plan: 'pro',
        status: 'active',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro_yearly',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.handleWebhook('payload', 'valid_signature');

      expect(subscriptionRepository.updateByStripeSubscriptionId).toHaveBeenCalledWith('sub_123', {
        stripePriceId: 'price_pro_yearly',
        plan: 'pro',
        status: 'active',
        currentPeriodStart: expect.any(Date),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    });

    it('should handle customer.subscription.deleted event', async () => {
      const mockEvent = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
          },
        },
      } as Stripe.Event;

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);
      vi.mocked(subscriptionRepository.updateByStripeSubscriptionId).mockResolvedValue({
        id: '1',
        tenantId: 'tenant-1',
        plan: 'free',
        status: 'canceled',
        stripeSubscriptionId: null,
        stripePriceId: null,
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.handleWebhook('payload', 'valid_signature');

      expect(subscriptionRepository.updateByStripeSubscriptionId).toHaveBeenCalledWith('sub_123', {
        plan: 'free',
        status: 'canceled',
        stripeSubscriptionId: null,
        stripePriceId: null,
        cancelAtPeriodEnd: false,
      });
    });

    it('should handle invoice.payment_failed event', async () => {
      const mockEvent = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_123',
            subscription: 'sub_123',
          },
        },
      } as Stripe.Event;

      mockWebhooksConstructEvent.mockReturnValue(mockEvent);
      vi.mocked(subscriptionRepository.updateByStripeSubscriptionId).mockResolvedValue({
        id: '1',
        tenantId: 'tenant-1',
        plan: 'pro',
        status: 'past_due',
        stripeSubscriptionId: 'sub_123',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.handleWebhook('payload', 'valid_signature');

      expect(subscriptionRepository.updateByStripeSubscriptionId).toHaveBeenCalledWith('sub_123', {
        status: 'past_due',
      });
    });
  });

  describe('退款与拒付', () => {
    const proSub = {
      id: '1',
      tenantId: 'tenant-1',
      plan: 'pro' as const,
      status: 'active' as const,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      stripePriceId: 'price_pro_monthly',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      revokedAt: null,
      revokedReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const refundEvent = (over: Record<string, unknown> = {}) =>
      ({
        id: 'evt_refund_1',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_123',
            customer: 'cus_123',
            amount: 2000,
            amount_refunded: 2000,
            refunded: true,
            currency: 'usd',
            ...over,
          },
        },
      }) as unknown as Stripe.Event;

    beforeEach(() => {
      vi.mocked(subscriptionRepository.findByStripeCustomerId).mockResolvedValue(proSub);
      vi.mocked(subscriptionRepository.update).mockResolvedValue(proSub);
    });

    it('全额退款吊销权限', async () => {
      mockWebhooksConstructEvent.mockReturnValue(refundEvent());

      await service.handleWebhook('payload', 'sig');

      expect(subscriptionRepository.update).toHaveBeenCalledWith('1', {
        revokedAt: expect.any(Date),
        revokedReason: 'refund',
      });
    });

    it('吊销时不动 plan/status —— 订阅在 Stripe 侧还是 active，改了会和下一次同步打架', async () => {
      mockWebhooksConstructEvent.mockReturnValue(refundEvent());

      await service.handleWebhook('payload', 'sig');

      const payload = vi.mocked(subscriptionRepository.update).mock.calls[0][1];
      expect(payload).not.toHaveProperty('plan');
      expect(payload).not.toHaveProperty('status');
    });

    it('部分退款不吊销 —— 按比例退一点钱不该直接断服务', async () => {
      mockWebhooksConstructEvent.mockReturnValue(
        refundEvent({ amount: 2000, amount_refunded: 500, refunded: false })
      );

      await service.handleWebhook('payload', 'sig');

      expect(subscriptionRepository.update).not.toHaveBeenCalled();
    });

    it('已经吊销过的不重复写，保留第一次的时间点', async () => {
      const already = { ...proSub, revokedAt: new Date('2026-01-01T00:00:00Z'), revokedReason: 'refund' };
      vi.mocked(subscriptionRepository.findByStripeCustomerId).mockResolvedValue(already);
      mockWebhooksConstructEvent.mockReturnValue(refundEvent());

      await service.handleWebhook('payload', 'sig');

      expect(subscriptionRepository.update).not.toHaveBeenCalled();
    });

    it('找不到对应订阅时安静跳过，不抛错让 Stripe 无限重投', async () => {
      vi.mocked(subscriptionRepository.findByStripeCustomerId).mockResolvedValue(null);
      mockWebhooksConstructEvent.mockReturnValue(refundEvent());

      await expect(service.handleWebhook('payload', 'sig')).resolves.toBeUndefined();
      expect(subscriptionRepository.update).not.toHaveBeenCalled();
    });

    it('charge 没有 customer 时跳过', async () => {
      mockWebhooksConstructEvent.mockReturnValue(refundEvent({ customer: null }));

      await service.handleWebhook('payload', 'sig');

      expect(subscriptionRepository.findByStripeCustomerId).not.toHaveBeenCalled();
      expect(subscriptionRepository.update).not.toHaveBeenCalled();
    });

    it('customer 被展开成对象时也能取到 id', async () => {
      mockWebhooksConstructEvent.mockReturnValue(
        refundEvent({ customer: { id: 'cus_123', object: 'customer' } })
      );

      await service.handleWebhook('payload', 'sig');

      expect(subscriptionRepository.findByStripeCustomerId).toHaveBeenCalledWith('cus_123');
      expect(subscriptionRepository.update).toHaveBeenCalled();
    });

    it('拒付（dispute）开出来就吊销，不等裁决结果', async () => {
      // 等裁决要几十天，这段时间里用户既拿着钱又用着服务。
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_dispute_1',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_123',
            charge: 'ch_123',
            amount: 2000,
            reason: 'fraudulent',
            status: 'needs_response',
          },
        },
      } as unknown as Stripe.Event);
      mockChargesRetrieve.mockResolvedValue({ id: 'ch_123', customer: 'cus_123' } as never);

      await service.handleWebhook('payload', 'sig');

      expect(mockChargesRetrieve).toHaveBeenCalledWith('ch_123');
      expect(subscriptionRepository.update).toHaveBeenCalledWith('1', {
        revokedAt: expect.any(Date),
        revokedReason: 'dispute',
      });
    });

    it('dispute 的 charge 已展开时不再多打一次 Stripe', async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_dispute_2',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_124',
            charge: { id: 'ch_124', customer: 'cus_123' },
            status: 'needs_response',
          },
        },
      } as unknown as Stripe.Event);

      await service.handleWebhook('payload', 'sig');

      expect(mockChargesRetrieve).not.toHaveBeenCalled();
      expect(subscriptionRepository.update).toHaveBeenCalled();
    });

    it('吊销要留审计记录，财务对账查得到', async () => {
      mockWebhooksConstructEvent.mockReturnValue(refundEvent());

      await service.handleWebhook('payload', 'sig');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          actorId: 'system',
          action: 'subscription_revoke',
        })
      );
    });

    it('拒付的审计记录里 reason 仍然是 dispute —— 别被 dispute.reason 覆盖成 fraudulent', async () => {
      // 覆盖了就分不出这笔是退款还是拒付，财务对账直接失真。
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_dispute_audit',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_123',
            charge: 'ch_123',
            amount: 2000,
            reason: 'fraudulent',
            status: 'needs_response',
          },
        },
      } as unknown as Stripe.Event);
      mockChargesRetrieve.mockResolvedValue({ id: 'ch_123', customer: 'cus_123' } as never);

      await service.handleWebhook('payload', 'sig');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'subscription_revoke',
          metadata: expect.objectContaining({
            reason: 'dispute',
            disputeReason: 'fraudulent',
          }),
        })
      );
    });

    it('拒付打赢后恢复权限（charge.dispute.closed，status=won）', async () => {
      const revoked = { ...proSub, revokedAt: new Date('2026-02-01T00:00:00Z'), revokedReason: 'dispute' };
      vi.mocked(subscriptionRepository.findByStripeCustomerId).mockResolvedValue(revoked);
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_dispute_won',
        type: 'charge.dispute.closed',
        data: {
          object: { id: 'dp_123', charge: { id: 'ch_123', customer: 'cus_123' }, status: 'won' },
        },
      } as unknown as Stripe.Event);

      await service.handleWebhook('payload', 'sig');

      expect(subscriptionRepository.update).toHaveBeenCalledWith('1', {
        revokedAt: null,
        revokedReason: null,
      });
    });

    it('拒付输了保持吊销', async () => {
      const revoked = { ...proSub, revokedAt: new Date('2026-02-01T00:00:00Z'), revokedReason: 'dispute' };
      vi.mocked(subscriptionRepository.findByStripeCustomerId).mockResolvedValue(revoked);
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_dispute_lost',
        type: 'charge.dispute.closed',
        data: {
          object: { id: 'dp_123', charge: { id: 'ch_123', customer: 'cus_123' }, status: 'lost' },
        },
      } as unknown as Stripe.Event);

      await service.handleWebhook('payload', 'sig');

      expect(subscriptionRepository.update).not.toHaveBeenCalled();
    });

    it('打赢了也不恢复因退款吊销的权限 —— 两件事互不相干', async () => {
      const refundRevoked = { ...proSub, revokedAt: new Date('2026-02-01T00:00:00Z'), revokedReason: 'refund' };
      vi.mocked(subscriptionRepository.findByStripeCustomerId).mockResolvedValue(refundRevoked);
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_dispute_won_2',
        type: 'charge.dispute.closed',
        data: {
          object: { id: 'dp_9', charge: { id: 'ch_9', customer: 'cus_123' }, status: 'won' },
        },
      } as unknown as Stripe.Event);

      await service.handleWebhook('payload', 'sig');

      expect(subscriptionRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('订阅状态同步不会抹掉吊销', () => {
    it('customer.subscription.updated 不写 revokedAt，退款用户不会被重新放行', async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        id: 'evt_upd',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_pro_monthly' } }] },
            billing_cycle_anchor: 1704067200,
            cancel_at: null,
            cancel_at_period_end: false,
          },
        },
      } as unknown as Stripe.Event);
      vi.mocked(subscriptionRepository.updateByStripeSubscriptionId).mockResolvedValue(null);

      await service.handleWebhook('payload', 'sig');

      const payload = vi.mocked(subscriptionRepository.updateByStripeSubscriptionId).mock.calls[0][1];
      expect(payload).not.toHaveProperty('revokedAt');
      expect(payload).not.toHaveProperty('revokedReason');
    });
  });
});
