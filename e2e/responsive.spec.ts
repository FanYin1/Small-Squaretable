import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle } from './utils/helpers';

test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('mobile viewport renders market page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/market');
    await waitForNetworkIdle(page);
    await expect(page.locator('.dashboard-layout')).toBeVisible();
  });

  test('tablet viewport renders market page', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 1024 });
    await page.goto('/market');
    await waitForNetworkIdle(page);
    await expect(page.locator('.dashboard-layout')).toBeVisible();
  });

  test('desktop viewport renders market page', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/market');
    await waitForNetworkIdle(page);
    await expect(page.locator('.dashboard-layout')).toBeVisible();
  });

  test('orientation change keeps page functional', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/market');
    await waitForNetworkIdle(page);
    // Rotate to landscape
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(500);
    await expect(page.locator('.dashboard-layout')).toBeVisible();
  });
});
