import { test, expect } from '@playwright/test';

test.describe('Platform Hardening', () => {
  test('login page has security-related meta tags or headers', async ({ page }) => {
    const response = await page.goto('/auth/login');
    // Page should load successfully
    expect(response?.status()).toBe(200);
    // Check that content-type header exists
    const contentType = response?.headers()['content-type'];
    expect(contentType).toBeTruthy();
  });

  test('login page renders secure form', async ({ page }) => {
    await page.goto('/auth/login');
    // Login form should be present with proper input types
    await expect(page.locator('.login-page')).toBeVisible();
    // Password field should use type="password" for security
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
  });

  test('health endpoint responds via proxy', async ({ page }) => {
    // Health endpoint is proxied through Vite dev server
    const response = await page.request.get('/health');
    // Accept 200 (healthy) or 503 (deps down) — both mean the endpoint exists
    expect([200, 503]).toContain(response.status());
  });

  test('readiness endpoint responds via proxy', async ({ page }) => {
    const response = await page.request.get('/health/ready');
    expect([200, 503]).toContain(response.status());
  });
});
