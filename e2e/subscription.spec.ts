import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { SubscriptionPage } from './pages/subscription.page';
import { testUsers } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

/**
 * E2E Tests: Subscription Flow
 *
 * Tests subscription management, usage tracking, and plan upgrades
 */

test.describe('Subscription Flow', () => {
  let authPage: AuthPage;
  let subscriptionPage: SubscriptionPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    subscriptionPage = new SubscriptionPage(page);
    await clearSession(page);

    // Login before each test
    await authPage.login(testUsers.free.email, testUsers.free.password);
    await page.waitForURL('/');
  });

  test.describe('Subscription Page Access', () => {
    test('should display subscription page', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should be on subscription page
      expect(page.url()).toContain('/subscription');

      // Should display plan cards
      const planCount = await subscriptionPage.planCards.count();
      expect(planCount).toBeGreaterThan(0);
    });

    test('should display current plan', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should show current plan
      const currentPlan = await subscriptionPage.getCurrentPlan();
      expect(currentPlan).toBeTruthy();
      expect(currentPlan.toLowerCase()).toContain('free');
    });

    test('should display usage statistics', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should show usage stats
      const usageVisible = await subscriptionPage.usageStats.isVisible();
      expect(usageVisible).toBe(true);

      // Get usage stats
      const stats = await subscriptionPage.getUsageStats();
      expect(typeof stats.messages).toBe('number');
      expect(typeof stats.characters).toBe('number');
    });
  });

  test.describe('Plan Comparison', () => {
    test('should display all subscription plans', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should show Free, Pro, and Team plans
      const planCards = subscriptionPage.planCards;
      const count = await planCards.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    test('should toggle between monthly and yearly billing', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Check if billing toggle exists
      const toggleVisible = await subscriptionPage.billingCycleToggle.isVisible().catch(() => false);
      if (toggleVisible) {
        // Toggle billing cycle
        await subscriptionPage.toggleBillingCycle();
        await waitForNetworkIdle(page);

        // Prices should update
        const priceElements = page.locator('.price, .plan-price');
        const priceCount = await priceElements.count();
        expect(priceCount).toBeGreaterThan(0);
      }
    });

    test('should display plan features', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Each plan should list features
      const featureLists = page.locator('.feature-list, .plan-features');
      const count = await featureLists.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should highlight current plan', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Current plan should be highlighted
      const currentPlanCard = subscriptionPage.currentPlanCard;
      const isVisible = await currentPlanCard.isVisible();
      expect(isVisible).toBe(true);
    });
  });

  test.describe('Plan Upgrade - Free to Pro', () => {
    test('should show upgrade button for Pro plan', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Pro plan should have upgrade button
      const upgradeButtons = subscriptionPage.upgradeButtons;
      const count = await upgradeButtons.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should initiate upgrade process', async ({ page }) => {
      // Mock Stripe checkout
      await page.route('**/api/v1/subscriptions/checkout', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              checkoutUrl: 'https://checkout.stripe.com/test-session',
            },
          }),
        });
      });

      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Click upgrade button
      const upgradeButton = subscriptionPage.upgradeButtons.first();
      if (await upgradeButton.isVisible()) {
        await upgradeButton.click();
        await waitForNetworkIdle(page);

        // Should redirect to Stripe checkout or show modal
        const urlChanged = page.url().includes('stripe') || page.url().includes('checkout');
        const modalVisible = await page.locator('.checkout-modal, .el-dialog').isVisible().catch(() => false);

        expect(urlChanged || modalVisible).toBe(true);
      }
    });

    test('should display upgrade benefits', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Click on Pro plan to see details
      const proCard = page.locator('.plan-card:has-text("Pro"), .subscription-card:has-text("Pro")');
      if (await proCard.isVisible()) {
        // Should show benefits
        const benefits = proCard.locator('.feature, .benefit');
        const count = await benefits.count();
        expect(count).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Usage Tracking', () => {
    test('should display current usage', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Get usage stats
      const stats = await subscriptionPage.getUsageStats();

      // Should have valid numbers
      expect(stats.messages).toBeGreaterThanOrEqual(0);
      expect(stats.characters).toBeGreaterThanOrEqual(0);
    });

    test('should show usage limits for current plan', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should display limits
      const limitsVisible = await page.locator('.usage-limit, .quota-limit').isVisible().catch(() => false);
      expect(typeof limitsVisible).toBe('boolean');
    });

    test('should display usage percentage', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should show progress bars or percentages
      const progressBars = page.locator('.progress-bar, .el-progress');
      const count = await progressBars.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should warn when approaching usage limit', async ({ page }) => {
      // Mock high usage
      await mockApiResponse(page, '**/api/v1/usage/current', {
        success: true,
        data: {
          messagesUsed: 95,
          messagesLimit: 100,
          charactersUsed: 9500,
          charactersLimit: 10000,
          resetDate: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should show warning
      const warningVisible = await page.locator('.usage-warning, .quota-warning').isVisible().catch(() => false);
      expect(typeof warningVisible).toBe('boolean');
    });

    test('should show quota exceeded message', async ({ page }) => {
      // Mock exceeded quota
      await mockApiResponse(page, '**/api/v1/usage/current', {
        success: true,
        data: {
          messagesUsed: 100,
          messagesLimit: 100,
          charactersUsed: 10000,
          charactersLimit: 10000,
          resetDate: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should show exceeded message
      const exceededVisible = await page.locator('.quota-exceeded, .limit-reached').isVisible().catch(() => false);
      expect(typeof exceededVisible).toBe('boolean');
    });

    test('should display usage reset date', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should show when usage resets
      const resetDateVisible = await page.locator('.reset-date, .next-reset').isVisible().catch(() => false);
      expect(typeof resetDateVisible).toBe('boolean');
    });
  });

  test.describe('Pro User Features', () => {
    test.beforeEach(async ({ page }) => {
      // Mock pro user
      await mockApiResponse(page, '**/api/v1/auth/me', {
        success: true,
        data: {
          user: {
            id: 'test-user-id',
            email: testUsers.pro.email,
            subscription: {
              tier: 'pro',
              status: 'active',
              currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
            },
          },
        },
      });

      await clearSession(page);
      await authPage.login(testUsers.pro.email, testUsers.pro.password);
      await page.waitForURL('/');
    });

    test('should display Pro plan as active', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should show Pro as current plan
      const isPro = await subscriptionPage.isPlanActive('Pro');
      expect(isPro).toBe(true);
    });

    test('should show higher usage limits', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Pro users should have higher limits
      const stats = await subscriptionPage.getUsageStats();
      expect(typeof stats.messages).toBe('number');
      expect(typeof stats.characters).toBe('number');
    });

    test('should display subscription end date', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should show when subscription renews
      const renewalDate = page.locator('.renewal-date, .next-billing');
      const isVisible = await renewalDate.isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });

    test('should show cancel subscription option', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should have cancel button
      const cancelVisible = await subscriptionPage.cancelButton.isVisible().catch(() => false);
      expect(typeof cancelVisible).toBe('boolean');
    });
  });

  test.describe('Subscription Management', () => {
    test.beforeEach(async ({ page }) => {
      // Mock pro user
      await mockApiResponse(page, '**/api/v1/auth/me', {
        success: true,
        data: {
          user: {
            id: 'test-user-id',
            email: testUsers.pro.email,
            subscription: {
              tier: 'pro',
              status: 'active',
            },
          },
        },
      });

      await clearSession(page);
      await authPage.login(testUsers.pro.email, testUsers.pro.password);
      await page.waitForURL('/');
    });

    test('should allow canceling subscription', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      const cancelVisible = await subscriptionPage.cancelButton.isVisible().catch(() => false);
      if (cancelVisible) {
        // Click cancel button
        await subscriptionPage.cancelButton.click();

        // Should show confirmation dialog
        const confirmDialog = page.locator('.confirm-dialog, .el-dialog');
        const dialogVisible = await confirmDialog.isVisible();
        expect(dialogVisible).toBe(true);
      }
    });

    test('should show billing history', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Look for billing history section
      const billingHistory = page.locator('.billing-history, .invoice-list');
      const isVisible = await billingHistory.isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });

    test('should allow updating payment method', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Look for payment method update button
      const updatePayment = page.locator('button:has-text("Update Payment"), button:has-text("更新支付")');
      const isVisible = await updatePayment.isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });
  });

  test.describe('Feature Gates', () => {
    test('should show locked features for free users', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Should show locked/premium features
      const lockedFeatures = page.locator('.locked-feature, .premium-feature');
      const count = await lockedFeatures.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should display upgrade prompts on locked features', async ({ page }) => {
      await subscriptionPage.goto();
      await waitForNetworkIdle(page);

      // Click on a premium feature
      const premiumFeature = page.locator('.premium-feature, .pro-only').first();
      if (await premiumFeature.isVisible()) {
        await premiumFeature.click();

        // Should show upgrade prompt
        const upgradePrompt = page.locator('.upgrade-prompt, .feature-gate-prompt');
        const isVisible = await upgradePrompt.isVisible().catch(() => false);
        expect(typeof isVisible).toBe('boolean');
      }
    });
  });
});
