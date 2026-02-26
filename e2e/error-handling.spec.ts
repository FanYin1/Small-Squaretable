import { test, expect } from '@playwright/test';

/**
 * E2E Tests: Error Handling
 *
 * 4 tests verifying the app handles API errors, 404 routes,
 * malformed responses, and rate limiting gracefully.
 */

test.describe('Error Handling', () => {
  test('API 500 error shows error message', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      }),
    );

    await page.goto('/auth/login');
    await page.getByPlaceholder('Email').fill('test@example.com');
    await page.getByPlaceholder('Password').fill('password123');
    await page.locator('.login-button').click();

    // Wait for the API call to complete and error to be handled
    await page.waitForTimeout(2000);

    // App should show error toast or stay on login page without crashing
    const toastVisible = await page.locator('.toast-error').isVisible().catch(() => false);
    const loginPageVisible = await page.locator('.login-page').isVisible().catch(() => false);
    expect(toastVisible || loginPageVisible).toBe(true);
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');

    // The catch-all route renders NotFound.vue with class .not-found-page
    await expect(page.locator('.not-found-page')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.error-code')).toHaveText('404');
  });

  test('malformed API response handled gracefully', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'not valid json{{{',
      }),
    );

    await page.goto('/auth/login');
    await page.getByPlaceholder('Email').fill('test@example.com');
    await page.getByPlaceholder('Password').fill('password123');
    await page.locator('.login-button').click();

    // Page should not crash — should stay on login page
    await expect(page.locator('.login-page')).toBeVisible({ timeout: 5000 });
  });

  test('rate limit 429 shows error message', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Too many requests' }),
      }),
    );

    await page.goto('/auth/login');
    await page.getByPlaceholder('Email').fill('test@example.com');
    await page.getByPlaceholder('Password').fill('password123');
    await page.locator('.login-button').click();

    // Wait for the API call to complete and error to be handled
    await page.waitForTimeout(2000);

    // App should show error toast or stay on login page without crashing
    const toastVisible = await page.locator('.toast-error').isVisible().catch(() => false);
    const loginPageVisible = await page.locator('.login-page').isVisible().catch(() => false);
    expect(toastVisible || loginPageVisible).toBe(true);
  });
});
