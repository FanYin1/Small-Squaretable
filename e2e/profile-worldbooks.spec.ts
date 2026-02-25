import { test, expect } from '@playwright/test';
import { setupAuth, clearSession, mockApiResponse, waitForNetworkIdle } from './utils/helpers';

/**
 * E2E Tests: Profile & WorldBooks
 *
 * Tests profile page loading, profile form fields,
 * worldbooks page loading, and worldbooks auth requirement.
 * All API responses are mocked — no live backend required.
 */

test.describe('Profile & WorldBooks', () => {
  // 1. Profile page loads
  test('profile page loads', async ({ page }) => {
    await setupAuth(page);

    await page.goto('/profile');
    await waitForNetworkIdle(page);

    await expect(page.locator('.profile-edit-page')).toBeVisible();
  });

  // 2. Profile form has display name and bio fields
  test('profile form has display name and bio fields', async ({ page }) => {
    await setupAuth(page);

    await page.goto('/profile');
    await waitForNetworkIdle(page);

    const profileForm = page.locator('.profile-form');
    await expect(profileForm).toBeVisible();

    // Display name input (el-input within the form)
    const displayNameInput = profileForm.locator('input').first();
    await expect(displayNameInput).toBeVisible();

    // Bio textarea
    const bioTextarea = profileForm.locator('textarea');
    await expect(bioTextarea).toBeVisible();
  });

  // 3. WorldBooks page loads
  test('worldbooks page loads', async ({ page }) => {
    await setupAuth(page);
    await mockApiResponse(page, '**/api/v1/worldbooks', {
      success: true,
      data: [
        { id: 'wb_1', name: 'Fantasy World', scope: 'global', isEnabled: true, description: 'Fantasy setting', entriesCount: 5, createdAt: '2026-01-15T00:00:00Z' },
      ],
    });

    await page.goto('/worldbooks');
    await waitForNetworkIdle(page);

    await expect(page.locator('.worldbooks-page')).toBeVisible();
  });

  // 4. WorldBooks requires auth — redirect to login without auth
  test('worldbooks requires auth', async ({ page }) => {
    await clearSession(page);

    await page.goto('/worldbooks');
    await page.waitForURL(/\/auth\/login/, { timeout: 10000 });

    expect(page.url()).toContain('/auth/login');
  });
});
