import { test, expect } from '@playwright/test';
import { setupAuth, clearSession, mockApiResponse, waitForNetworkIdle, mockCommonEndpoints } from './utils/helpers';

/**
 * E2E Tests: Analytics Dashboard
 *
 * Tests analytics dashboard access for team users, tab navigation,
 * unauthenticated redirect, and free-user feature gating.
 * All API responses are mocked — no live backend required.
 */

async function mockAllAnalyticsEndpoints(page: import('@playwright/test').Page, status = 200) {
  const errorBody = { error: 'Upgrade required' };

  const endpoints: Array<{ url: string; body: Record<string, unknown> }> = [
    {
      url: '**/api/v1/analytics/overview*',
      body: {
        success: true,
        data: { metrics: [{ week: '2026-02-03', weekly_active_users: 1200, weekly_messages: 45000 }] },
        meta: { timestamp: new Date().toISOString() },
      },
    },
    {
      url: '**/api/v1/analytics/retention*',
      body: {
        success: true,
        data: { matrix: [{ cohort_week: '2026-01-06', week_number: 0, retained_users: 100, cohort_size: 100, retention_rate: 100 }] },
        meta: { timestamp: new Date().toISOString() },
      },
    },
    {
      url: '**/api/v1/analytics/funnel*',
      body: {
        success: true,
        data: { steps: [{ step: 'visit', users: 5000, rate: 100 }, { step: 'signup', users: 2000, rate: 40 }] },
        meta: { timestamp: new Date().toISOString() },
      },
    },
    {
      url: '**/api/v1/analytics/realtime*',
      body: {
        success: true,
        data: { activeUsers: 42, eventsPerMin: 120, messagesPerMin: 35 },
        meta: { timestamp: new Date().toISOString() },
      },
    },
    {
      url: '**/api/v1/analytics/characters/top*',
      body: {
        success: true,
        data: { characters: [{ character_id: '1', character_name: 'Alice', total_chats: 500, total_messages: 12000 }] },
        meta: { timestamp: new Date().toISOString() },
      },
    },
    {
      url: '**/api/v1/analytics/segments*',
      body: {
        success: true,
        data: { segments: [{ segment: 'power_users', user_count: 150 }, { segment: 'casual', user_count: 800 }] },
        meta: { timestamp: new Date().toISOString() },
      },
    },
  ];

  for (const ep of endpoints) {
    await mockApiResponse(page, ep.url, status === 200 ? ep.body : errorBody, status);
  }
}

test.describe('Analytics Dashboard', () => {
  test('analytics dashboard loads for team user', async ({ page }) => {
    await setupAuth(page, { plan: 'team' });
    await mockCommonEndpoints(page);
    await mockAllAnalyticsEndpoints(page);

    await page.goto('/analytics');
    await waitForNetworkIdle(page);

    await expect(page.locator('.analytics-dashboard')).toBeVisible();
  });

  test('executive tab renders', async ({ page }) => {
    await setupAuth(page, { plan: 'team' });
    await mockCommonEndpoints(page);
    await mockAllAnalyticsEndpoints(page);

    await page.goto('/analytics');
    await waitForNetworkIdle(page);

    await expect(page.locator('.analytics-tabs')).toBeVisible();
  });

  test('product tab switchable', async ({ page }) => {
    await setupAuth(page, { plan: 'team' });
    await mockCommonEndpoints(page);
    await mockAllAnalyticsEndpoints(page);

    await page.goto('/analytics');
    await waitForNetworkIdle(page);

    // Click the Product Metrics tab
    const productTab = page.locator('.el-tabs__item:has-text("Product")');
    await productTab.click();
    await page.waitForTimeout(500);

    // Verify product metrics content appeared
    await expect(page.locator('.product-metrics')).toBeVisible();
  });

  test('unauthenticated user redirected to login', async ({ page }) => {
    await clearSession(page);

    await page.goto('/analytics');
    await page.waitForURL(/\/auth\/login/, { timeout: 10000 });

    expect(page.url()).toContain('/auth/login');
  });

  test('free user sees error or upgrade prompt', async ({ page }) => {
    await setupAuth(page, { plan: 'free' });
    await mockCommonEndpoints(page);
    await mockAllAnalyticsEndpoints(page, 403);

    await page.goto('/analytics');
    await waitForNetworkIdle(page);
    await page.waitForTimeout(1000);

    // Should show an error banner or upgrade prompt
    const errorBanner = page.locator('.error-banner, .el-alert--error');
    const upgradePrompt = page.locator('.upgrade-prompt, .feature-gate-prompt, :text("Upgrade"), :text("upgrade")');

    const errorVisible = await errorBanner.isVisible().catch(() => false);
    const upgradeVisible = await upgradePrompt.isVisible().catch(() => false);

    expect(errorVisible || upgradeVisible).toBe(true);
  });
});
