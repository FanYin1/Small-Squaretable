import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSubscriptionStore } from './subscription';
import { subscriptionApi } from '@client/services/subscription.api';
import '../test-setup';

vi.mock('@client/services/subscription.api', () => ({
  subscriptionApi: {
    getStatus: vi.fn(),
    getConfig: vi.fn(),
    createCheckout: vi.fn(),
    createPortal: vi.fn(),
  },
}));

describe('Subscription Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // Mock window.location
    delete (window as any).location;
    (window as any).location = { href: '', origin: 'https://example.com' };
  });

  describe('fetchStatus', () => {
    it('should fetch subscription status successfully', async () => {
      const mockSubscription = {
        id: 'sub_123',
        plan: 'pro',
        status: 'active',
        currentPeriodEnd: new Date('2024-02-01'),
      };

      vi.mocked(subscriptionApi.getStatus).mockResolvedValue({
        subscription: mockSubscription,
      } as any);

      const store = useSubscriptionStore();
      await store.fetchStatus();

      expect(store.subscription).toEqual(mockSubscription);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should handle fetch error', async () => {
      const error = new Error('Failed to fetch subscription');
      vi.mocked(subscriptionApi.getStatus).mockRejectedValue(error);

      const store = useSubscriptionStore();
      await expect(store.fetchStatus()).rejects.toThrow('Failed to fetch subscription');

      expect(store.error).toBe('Failed to fetch subscription');
      expect(store.loading).toBe(false);
      expect(store.subscription).toBeNull();
    });

    it('should set loading state during fetch', async () => {
      let loadingDuringFetch = false;

      vi.mocked(subscriptionApi.getStatus).mockImplementation(async () => {
        const store = useSubscriptionStore();
        loadingDuringFetch = store.loading;
        return { subscription: null } as any;
      });

      const store = useSubscriptionStore();
      await store.fetchStatus();

      expect(loadingDuringFetch).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(subscriptionApi.getStatus).mockRejectedValue('String error');

      const store = useSubscriptionStore();
      await expect(store.fetchStatus()).rejects.toBe('String error');

      expect(store.error).toBe('Failed to fetch subscription');
    });
  });

  describe('fetchConfig', () => {
    it('should fetch subscription config successfully', async () => {
      const mockConfig = {
        publishableKey: 'pk_test_123',
        prices: {
          proMonthly: 'price_pro_monthly',
          proYearly: 'price_pro_yearly',
          teamMonthly: 'price_team_monthly',
        },
      };

      vi.mocked(subscriptionApi.getConfig).mockResolvedValue(mockConfig as any);

      const store = useSubscriptionStore();
      await store.fetchConfig();

      expect(store.config).toEqual(mockConfig);
    });

    it('should handle fetch error silently', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(subscriptionApi.getConfig).mockRejectedValue(new Error('Config error'));

      const store = useSubscriptionStore();
      await store.fetchConfig();

      expect(store.config).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch subscription config:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should not throw on error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(subscriptionApi.getConfig).mockRejectedValue(new Error('Config error'));

      const store = useSubscriptionStore();
      await expect(store.fetchConfig()).resolves.not.toThrow();
    });
  });

  describe('startCheckout', () => {
    it('should create checkout session and redirect', async () => {
      const checkoutUrl = 'https://checkout.stripe.com/session_123';
      vi.mocked(subscriptionApi.createCheckout).mockResolvedValue({ url: checkoutUrl } as any);

      const store = useSubscriptionStore();
      await store.startCheckout('price_123');

      expect(subscriptionApi.createCheckout).toHaveBeenCalledWith({
        priceId: 'price_123',
        successUrl: 'https://example.com/subscription?success=true',
        cancelUrl: 'https://example.com/subscription?canceled=true',
      });
      expect(window.location.href).toBe(checkoutUrl);
      expect(store.loading).toBe(false);
    });

    it('should handle checkout error', async () => {
      const error = new Error('Checkout failed');
      vi.mocked(subscriptionApi.createCheckout).mockRejectedValue(error);

      const store = useSubscriptionStore();
      await expect(store.startCheckout('price_123')).rejects.toThrow('Checkout failed');

      expect(store.error).toBe('Checkout failed');
      expect(store.loading).toBe(false);
      expect(window.location.href).toBe('');
    });

    it('should set loading state during checkout', async () => {
      let loadingDuringCheckout = false;

      vi.mocked(subscriptionApi.createCheckout).mockImplementation(async () => {
        const store = useSubscriptionStore();
        loadingDuringCheckout = store.loading;
        return { url: 'https://checkout.stripe.com/session_123' } as any;
      });

      const store = useSubscriptionStore();
      await store.startCheckout('price_123');

      expect(loadingDuringCheckout).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(subscriptionApi.createCheckout).mockRejectedValue('String error');

      const store = useSubscriptionStore();
      await expect(store.startCheckout('price_123')).rejects.toBe('String error');

      expect(store.error).toBe('Failed to start checkout');
    });
  });

  describe('openPortal', () => {
    it('should create portal session and redirect', async () => {
      const portalUrl = 'https://billing.stripe.com/session_123';
      vi.mocked(subscriptionApi.createPortal).mockResolvedValue({ url: portalUrl } as any);

      const store = useSubscriptionStore();
      await store.openPortal();

      expect(subscriptionApi.createPortal).toHaveBeenCalledWith({
        returnUrl: 'https://example.com/subscription',
      });
      expect(window.location.href).toBe(portalUrl);
      expect(store.loading).toBe(false);
    });

    it('should handle portal error', async () => {
      const error = new Error('Portal failed');
      vi.mocked(subscriptionApi.createPortal).mockRejectedValue(error);

      const store = useSubscriptionStore();
      await expect(store.openPortal()).rejects.toThrow('Portal failed');

      expect(store.error).toBe('Portal failed');
      expect(store.loading).toBe(false);
      expect(window.location.href).toBe('');
    });

    it('should set loading state during portal creation', async () => {
      let loadingDuringPortal = false;

      vi.mocked(subscriptionApi.createPortal).mockImplementation(async () => {
        const store = useSubscriptionStore();
        loadingDuringPortal = store.loading;
        return { url: 'https://billing.stripe.com/session_123' } as any;
      });

      const store = useSubscriptionStore();
      await store.openPortal();

      expect(loadingDuringPortal).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(subscriptionApi.createPortal).mockRejectedValue('String error');

      const store = useSubscriptionStore();
      await expect(store.openPortal()).rejects.toBe('String error');

      expect(store.error).toBe('Failed to open billing portal');
    });
  });

  describe('Computed Properties', () => {
    describe('currentPlan', () => {
      it('should return subscription plan when available', async () => {
        vi.mocked(subscriptionApi.getStatus).mockResolvedValue({
          subscription: { plan: 'pro', status: 'active' },
        } as any);

        const store = useSubscriptionStore();
        await store.fetchStatus();

        expect(store.currentPlan).toBe('pro');
      });

      it('should return "free" when no subscription', () => {
        const store = useSubscriptionStore();
        expect(store.currentPlan).toBe('free');
      });

      it('should handle team plan', async () => {
        vi.mocked(subscriptionApi.getStatus).mockResolvedValue({
          subscription: { plan: 'team', status: 'active' },
        } as any);

        const store = useSubscriptionStore();
        await store.fetchStatus();

        expect(store.currentPlan).toBe('team');
      });
    });

    describe('isActive', () => {
      it('should return true when subscription is active', async () => {
        vi.mocked(subscriptionApi.getStatus).mockResolvedValue({
          subscription: { plan: 'pro', status: 'active' },
        } as any);

        const store = useSubscriptionStore();
        await store.fetchStatus();

        expect(store.isActive).toBe(true);
      });

      it('should return false when subscription is not active', async () => {
        vi.mocked(subscriptionApi.getStatus).mockResolvedValue({
          subscription: { plan: 'pro', status: 'canceled' },
        } as any);

        const store = useSubscriptionStore();
        await store.fetchStatus();

        expect(store.isActive).toBe(false);
      });

      it('should return false when no subscription', () => {
        const store = useSubscriptionStore();
        expect(store.isActive).toBe(false);
      });

      it('should handle past_due status', async () => {
        vi.mocked(subscriptionApi.getStatus).mockResolvedValue({
          subscription: { plan: 'pro', status: 'past_due' },
        } as any);

        const store = useSubscriptionStore();
        await store.fetchStatus();

        expect(store.isActive).toBe(false);
      });
    });

    describe('isPro', () => {
      it('should return true for pro plan', async () => {
        vi.mocked(subscriptionApi.getStatus).mockResolvedValue({
          subscription: { plan: 'pro', status: 'active' },
        } as any);

        const store = useSubscriptionStore();
        await store.fetchStatus();

        expect(store.isPro).toBe(true);
      });

      it('should return true for team plan', async () => {
        vi.mocked(subscriptionApi.getStatus).mockResolvedValue({
          subscription: { plan: 'team', status: 'active' },
        } as any);

        const store = useSubscriptionStore();
        await store.fetchStatus();

        expect(store.isPro).toBe(true);
      });

      it('should return false for free plan', () => {
        const store = useSubscriptionStore();
        expect(store.isPro).toBe(false);
      });

      it('should return false when no subscription', () => {
        const store = useSubscriptionStore();
        expect(store.isPro).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should clear previous errors on successful fetch', async () => {
      vi.mocked(subscriptionApi.getStatus)
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce({ subscription: null } as any);

      const store = useSubscriptionStore();
      await expect(store.fetchStatus()).rejects.toThrow();
      expect(store.error).toBe('First error');

      await store.fetchStatus();
      expect(store.error).toBeNull();
    });

    it('should handle multiple concurrent requests', async () => {
      vi.mocked(subscriptionApi.getStatus).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ subscription: null } as any), 10))
      );

      const store = useSubscriptionStore();
      const promises = [
        store.fetchStatus(),
        store.fetchStatus(),
        store.fetchStatus(),
      ];

      await Promise.all(promises);

      expect(subscriptionApi.getStatus).toHaveBeenCalledTimes(3);
      expect(store.loading).toBe(false);
    });
  });

  describe('Integration', () => {
    it('should handle complete subscription flow', async () => {
      const store = useSubscriptionStore();

      // Initial state - free plan
      expect(store.currentPlan).toBe('free');
      expect(store.isPro).toBe(false);

      // Fetch config
      vi.mocked(subscriptionApi.getConfig).mockResolvedValue({
        publishableKey: 'pk_test_123',
        prices: { proMonthly: 'price_123' },
      } as any);
      await store.fetchConfig();
      expect(store.config?.publishableKey).toBe('pk_test_123');

      // Start checkout
      vi.mocked(subscriptionApi.createCheckout).mockResolvedValue({
        url: 'https://checkout.stripe.com/session_123',
      } as any);
      await store.startCheckout('price_123');
      expect(window.location.href).toBe('https://checkout.stripe.com/session_123');

      // After successful payment, fetch status
      vi.mocked(subscriptionApi.getStatus).mockResolvedValue({
        subscription: { plan: 'pro', status: 'active' },
      } as any);
      await store.fetchStatus();
      expect(store.currentPlan).toBe('pro');
      expect(store.isPro).toBe(true);
      expect(store.isActive).toBe(true);
    });
  });
});
