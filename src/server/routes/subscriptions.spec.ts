import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { subscriptionRoutes } from './subscriptions';
import { errorHandler } from '../middleware/error-handler';

// Mock the subscription service
vi.mock('../services/subscription.service', () => ({
  subscriptionService: {
    getSubscriptionStatus: vi.fn(),
    createCheckoutSession: vi.fn(),
    createBillingPortalSession: vi.fn(),
    handleWebhook: vi.fn(),
  },
}));

// Mock the auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('user', {
      id: 'user_123',
      tenantId: 'tenant_123',
      email: 'test@example.com',
    });
    await next();
  },
}));

describe('Subscription Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);
    app.route('/subscriptions', subscriptionRoutes);
    vi.clearAllMocks();
  });

  describe('GET /subscriptions/status', () => {
    it('should return subscription status for authenticated user', async () => {
      const { subscriptionService } = await import('../services/subscription.service');
      const mockSubscription = {
        id: 'sub_123',
        plan: 'pro',
        status: 'active',
        currentPeriodEnd: new Date('2024-02-01'),
      };

      vi.mocked(subscriptionService.getSubscriptionStatus).mockResolvedValue(mockSubscription as any);

      const res = await app.request('/subscriptions/status', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.subscription).toEqual(mockSubscription);
      expect(subscriptionService.getSubscriptionStatus).toHaveBeenCalledWith('tenant_123');
    });

    it('should return free plan when no subscription exists', async () => {
      const { subscriptionService } = await import('../services/subscription.service');
      vi.mocked(subscriptionService.getSubscriptionStatus).mockResolvedValue(null);

      const res = await app.request('/subscriptions/status', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.subscription).toEqual({
        plan: 'free',
        status: 'active',
      });
    });

    it('should reject unauthenticated requests', async () => {
      const res = await app.request('/subscriptions/status');

      expect(res.status).toBe(401);
    });

    it('should handle service errors', async () => {
      const { subscriptionService } = await import('../services/subscription.service');
      vi.mocked(subscriptionService.getSubscriptionStatus).mockRejectedValue(
        new Error('Database error')
      );

      const res = await app.request('/subscriptions/status', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /subscriptions/checkout', () => {
    it('should create checkout session with valid data', async () => {
      const { subscriptionService } = await import('../services/subscription.service');
      const checkoutUrl = 'https://checkout.stripe.com/session_123';

      vi.mocked(subscriptionService.createCheckoutSession).mockResolvedValue(checkoutUrl);

      const res = await app.request('/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: 'price_123',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.url).toBe(checkoutUrl);
      expect(subscriptionService.createCheckoutSession).toHaveBeenCalledWith(
        'tenant_123',
        'test@example.com',
        'price_123',
        'https://example.com/success',
        'https://example.com/cancel'
      );
    });

    it('should reject invalid priceId', async () => {
      const res = await app.request('/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: '',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid URLs', async () => {
      const res = await app.request('/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: 'price_123',
          successUrl: 'not-a-url',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await app.request('/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: 'price_123',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should handle service errors', async () => {
      const { subscriptionService } = await import('../services/subscription.service');
      vi.mocked(subscriptionService.createCheckoutSession).mockRejectedValue(
        new Error('Stripe error')
      );

      const res = await app.request('/subscriptions/checkout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: 'price_123',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /subscriptions/portal', () => {
    it('should create billing portal session with valid data', async () => {
      const { subscriptionService } = await import('../services/subscription.service');
      const portalUrl = 'https://billing.stripe.com/session_123';

      vi.mocked(subscriptionService.createBillingPortalSession).mockResolvedValue(portalUrl);

      const res = await app.request('/subscriptions/portal', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: 'https://example.com/subscription',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.url).toBe(portalUrl);
      expect(subscriptionService.createBillingPortalSession).toHaveBeenCalledWith(
        'tenant_123',
        'https://example.com/subscription'
      );
    });

    it('should reject invalid return URL', async () => {
      const res = await app.request('/subscriptions/portal', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: 'not-a-url',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await app.request('/subscriptions/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnUrl: 'https://example.com/subscription',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should handle service errors', async () => {
      const { subscriptionService } = await import('../services/subscription.service');
      vi.mocked(subscriptionService.createBillingPortalSession).mockRejectedValue(
        new Error('Stripe error')
      );

      const res = await app.request('/subscriptions/portal', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: 'https://example.com/subscription',
        }),
      });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /subscriptions/webhook', () => {
    it('should handle webhook with valid signature', async () => {
      const { subscriptionService } = await import('../services/subscription.service');
      vi.mocked(subscriptionService.handleWebhook).mockResolvedValue(undefined);

      const res = await app.request('/subscriptions/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'valid_signature',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'customer.subscription.updated',
          data: { object: {} },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(subscriptionService.handleWebhook).toHaveBeenCalled();
    });

    it('should reject webhook without signature', async () => {
      const res = await app.request('/subscriptions/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'customer.subscription.updated',
          data: { object: {} },
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Missing stripe-signature header');
    });

    it('should handle webhook processing errors', async () => {
      const { subscriptionService } = await import('../services/subscription.service');
      vi.mocked(subscriptionService.handleWebhook).mockRejectedValue(
        new Error('Invalid signature')
      );

      const res = await app.request('/subscriptions/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'invalid_signature',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'customer.subscription.updated',
          data: { object: {} },
        }),
      });

      expect(res.status).toBe(500);
    });
  });

  describe('GET /subscriptions/config', () => {
    it('should return Stripe configuration', async () => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_123';
      process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_monthly';
      process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_yearly';
      process.env.STRIPE_PRICE_TEAM_MONTHLY = 'price_team_monthly';

      const res = await app.request('/subscriptions/config');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.publishableKey).toBe('pk_test_123');
      expect(data.data.prices).toEqual({
        proMonthly: 'price_pro_monthly',
        proYearly: 'price_pro_yearly',
        teamMonthly: 'price_team_monthly',
      });
    });

    it('should not require authentication', async () => {
      const res = await app.request('/subscriptions/config');

      expect(res.status).toBe(200);
    });
  });
});
