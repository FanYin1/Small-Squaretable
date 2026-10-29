import { test, expect } from '@playwright/test';
import { setupAuth, mockApiResponse, mockCommonEndpoints, mockModules, gotoWithAuth } from './utils/helpers';

/**
 * E2E Tests: Module flags (P2-1)
 *
 * A closed module's route renders NotFound and keeps the URL; opening the
 * module through /config/modules brings the page back.
 */

const MARKETPLACE_EMPTY = {
  success: true,
  data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } },
};

test.describe('Module flags', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page, { plan: 'pro' });
    await mockCommonEndpoints(page);
    await mockApiResponse(page, '**/api/v1/plugins/marketplace*', MARKETPLACE_EMPTY);
    await mockApiResponse(page, '**/api/v1/plugins/installs', { success: true, data: [] });
  });

  test('closed module route renders 404 and keeps the URL', async ({ page }) => {
    await mockModules(page, []);
    await gotoWithAuth(page, '/plugins');

    await expect(page.locator('.not-found-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.plugin-marketplace')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/plugins');
  });

  test('failed flags request keeps modules closed', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/config/modules', { success: false }, 500);
    await gotoWithAuth(page, '/plugins');

    await expect(page.locator('.not-found-page')).toBeVisible({ timeout: 10000 });
  });

  test('open module route renders the page', async ({ page }) => {
    await mockModules(page, ['plugins']);
    await gotoWithAuth(page, '/plugins');

    await expect(page.locator('.plugin-marketplace')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.not-found-page')).toHaveCount(0);
  });
});
