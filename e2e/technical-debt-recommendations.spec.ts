import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle } from './utils/helpers';

test.describe('Public Pages', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('terms page loads', async ({ page }) => {
    await page.goto('/terms');
    await waitForNetworkIdle(page);
    expect(page.url()).toContain('/terms');
    await expect(page.locator('.legal-page')).toBeVisible();
    await expect(page.locator('.legal-content')).toBeVisible();
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await waitForNetworkIdle(page);
    expect(page.url()).toContain('/privacy');
    await expect(page.locator('.legal-page')).toBeVisible();
    await expect(page.locator('.legal-content')).toBeVisible();
  });

  test('about page loads', async ({ page }) => {
    await page.goto('/about');
    await waitForNetworkIdle(page);
    expect(page.url()).toContain('/about');
    await expect(page.locator('.legal-page')).toBeVisible();
    await expect(page.locator('.legal-content')).toBeVisible();
  });

  test('market page loads', async ({ page }) => {
    await page.goto('/market');
    await waitForNetworkIdle(page);
    expect(page.url()).toContain('/market');
    // Market uses DashboardLayout
    await expect(page.locator('.dashboard-layout')).toBeVisible();
  });
});
