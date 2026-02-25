import { test, expect } from '@playwright/test';
import { setupAuth, clearSession, mockApiResponse, waitForNetworkIdle } from './utils/helpers';

/**
 * E2E Tests: Plugin Marketplace
 *
 * Tests plugin marketplace loading, plugin card rendering, and auth gating.
 * All API responses are mocked — no live backend required.
 */

const MARKETPLACE_MOCK = {
  success: true,
  data: {
    items: [
      {
        id: 'plugin_1',
        name: 'Auto Translator',
        description: 'Translates messages automatically between languages',
        version: '1.0.0',
        authorName: 'dev_user',
        installCount: 150,
        isPublished: true,
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  },
};

test.describe('Plugin Marketplace', () => {
  // 1. Plugin marketplace loads
  test('plugin marketplace loads', async ({ page }) => {
    await setupAuth(page, { plan: 'pro' });
    await mockApiResponse(page, '**/api/v1/plugins/marketplace*', MARKETPLACE_MOCK);
    await mockApiResponse(page, '**/api/v1/plugins/installs', { success: true, data: [] });

    await page.goto('/plugins');
    await waitForNetworkIdle(page);

    await expect(page.locator('.plugin-marketplace')).toBeVisible();
  });

  // 2. Plugin list renders
  test('plugin list renders with plugin cards', async ({ page }) => {
    await setupAuth(page, { plan: 'pro' });
    await mockApiResponse(page, '**/api/v1/plugins/marketplace*', MARKETPLACE_MOCK);
    await mockApiResponse(page, '**/api/v1/plugins/installs', { success: true, data: [] });

    await page.goto('/plugins');
    await waitForNetworkIdle(page);

    const pluginCards = page.locator('.plugin-card');
    await expect(pluginCards.first()).toBeVisible();

    // Verify plugin name
    await expect(page.locator('.plugin-name').first()).toContainText('Auto Translator');

    // Verify plugin author
    await expect(page.locator('.plugin-author').first()).toBeVisible();

    // Verify plugin description
    await expect(page.locator('.plugin-description').first()).toBeVisible();
  });

  // 3. Requires auth — redirect to login
  test('requires auth — redirects unauthenticated user to login', async ({ page }) => {
    await clearSession(page);

    await page.goto('/plugins');
    await page.waitForURL(/\/auth\/login/, { timeout: 10000 });

    expect(page.url()).toContain('/auth/login');
  });
});
