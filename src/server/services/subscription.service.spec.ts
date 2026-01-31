/**
 * Subscription Service Tests
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { NotFoundError, ValidationError } from '../../core/errors';
import type Stripe from 'stripe';

// Mock repositories
vi.mock('../../db/repositories/subscription.repository');
vi.mock('../../db/repositories/user.repository');

// Create mock functions that will be used in tests
let mockStripeInstance: any;

// Mock Stripe
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => mockStripeInstance),
  };
});

// Import after mocks
const { SubscriptionService } = await import('./subscription.service');

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeAll(() => {
    // Initialize mock Stripe instance
    mockStripeInstance = {
      customers: {
        create: vi.fn(),
      },
      checkout: {
        sessions: {
          create: vi.fn(),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn(),
        },
      },
      subscriptions: {
        retrieve: vi.fn(),
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
    };
  });

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
      expect(mockStripeInstance.customers.create).not.toHaveBeenCalled();
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
      mockStripeInstance.customers.create.mockResolvedValue({ id: 'cus_new' });
      vi.mocked(subscriptionRepository.update).mockResolvedValue({
        ...mockSubscription,
        stripeCustomerId: 'cus_new',
      });

      const result = await service.createOrGetCustomer('tenant-1', 'test@example.com');

      expect(result).toBe('cus_new');
      expect(mockStripeInstance.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        metadata: { tenantId: 'tenant-1' },
      });
      expect(subscriptionRepository.update).toHaveBeenCalledWith('1', {
        stripeCustomerId: 'cus_new',
      });
    });

    it('should create new customer and subscription if none exists', async () => {
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(null);
      mockStripeInstance.customers.create.mockResolvedValue({ id: 'cus_new' });
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
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
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
      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith({
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
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
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
      mockStripeInstance.billingPortal.sessions.create.mockResolvedValue({
        id: 'bps_123',
        url: 'https://billing.stripe.com/session/bps_123',
      });

      const result = await service.createBillingPortalSession('tenant-1', 'https://app.com/return');

      expect(result).toBe('https://billing.stripe.com/session/bps_123');
      expect(mockStripeInstance.billingPortal.sessions.create).toHaveBeenCalledWith({
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
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
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

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockStripeInstance.subscriptions.retrieve.mockResolvedValue({
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

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);
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

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);
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

      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);
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
});
