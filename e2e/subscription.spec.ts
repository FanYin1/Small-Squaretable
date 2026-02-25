import { test, expect } from '@playwright/test';
import { setupAuth, clearSession, mockApiResponse, waitForNetworkIdle } from './utils/helpers';

/**
 * E2E Tests: Subscription
 *
 * Tests subscription page loading, plan cards visibility,
 * current plan highlighting, and auth requirement.
 * All API responses are mocked — no live backend required.
 */

async function mockSubscriptionEndpoints(page: import('@playwright/test').Page) {
  await mockApiResponse(page, '**/api/v1/subscriptions/current', {
    success: true,
    data: { plan: 'free', status: 'active' },
  });
  await mockApiResponse(page, '**/api/v1/subscriptions/plans', {
    success: true,
    data: [
      { id: 'free', name: 'Free', price: 0, features: ['Basic chat', '100 messages/day'] },
      { id: 'pro', name: 'Pro', price: 9.99, popular: true, features: ['Unlimited chat', 'Priority support'] },
      { id: 'team', name: 'Team', price: 29.99, features: ['Everything in Pro', 'Team features'] },
    ],
  });
  await mockApiResponse(page, '**/api/v1/subscriptions/status', {
    success: true,
    data: { subscription: { id: 'sub_1', plan: 'free', status: 'active' } },
  });
  await mockApiResponse(page, '**/api/v1/usage/current', {
    success: true,
    data: { messagesUsed: 10, messagesLimit: 100, charactersUsed: 2, charactersLimit: 10, resetDate: '2026-03-01T00:00:00Z' },
  });
}

test.describe('Subscription', () => {
  // 1. Subscription page loads
  test('subscription page loads', async ({ page }) => {
    await setupAuth(page);
    await mockSubscriptionEndpoints(page);

    await page.goto('/subscription');
    await waitForNetworkIdle(page);

    await expect(page.locator('.content-wrapper')).toBeVisible();
  });

  // 2. Plan cards visible (3 plans)
  test('plan cards visible', async ({ page }) => {
    await setupAuth(page);
    await mockSubscriptionEndpoints(page);

    await page.goto('/subscription');
    await waitForNetworkIdle(page);

    const planCards = page.locator('.plan-card');
    const count = await planCards.count();
    expect(count).toBe(3);
  });

  // 3. Current plan highlighted
  test('current plan highlighted', async ({ page }) => {
    await setupAuth(page);
    await mockSubscriptionEndpoints(page);

    await page.goto('/subscription');
    await waitForNetworkIdle(page);

    const currentPlanCard = page.locator('.plan-card.current');
    await expect(currentPlanCard).toBeVisible();
  });

  // 4. Requires auth — redirect to login without auth
  test('requires auth', async ({ page }) => {
    await clearSession(page);

    await page.goto('/subscription');
    await page.waitForURL(/\/auth\/login/, { timeout: 10000 });

    expect(page.url()).toContain('/auth/login');
  });
});
