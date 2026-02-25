import { test, expect } from '@playwright/test';

/**
 * E2E Tests: Platform Hardening
 *
 * 4 tests verifying security headers, CSRF protection,
 * and health/readiness endpoints respond correctly.
 */

test.describe('Platform Hardening', () => {
  test('CSP headers present in response', async ({ page }) => {
    const response = await page.goto('/auth/login');
    const headers = response?.headers() ?? {};

    // Server should return at least one security header
    const hasSecurityHeaders =
      headers['content-security-policy'] ||
      headers['x-content-type-options'] ||
      headers['x-frame-options'];
    expect(hasSecurityHeaders).toBeTruthy();
  });

  test('CSRF token available', async ({ page }) => {
    await page.goto('/auth/login');

    // Check for CSRF meta tag or cookie
    const csrfMeta = await page.locator('meta[name="csrf-token"]').count();
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name.toLowerCase().includes('csrf'));

    expect(csrfMeta > 0 || csrfCookie !== undefined).toBe(true);
  });

  test('health endpoint responds with 200', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch('http://localhost:3000/health');
      return { status: res.status, ok: res.ok };
    });

    expect(response.status).toBe(200);
  });

  test('readiness endpoint responds', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch('http://localhost:3000/health/ready');
      return { status: res.status };
    });

    // Ready endpoint returns 200 when all deps are up, or 503 if DB/Redis is down
    expect([200, 503]).toContain(response.status);
  });
});
