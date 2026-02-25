import { test, expect } from '@playwright/test';
import { setupAuth, setupAdminAuth, mockApiResponse, waitForNetworkIdle } from './utils/helpers';

/**
 * E2E Tests: Admin Features
 *
 * Tests admin panel pages (system dashboard, user management, GDPR)
 * and verifies non-admin users are redirected away.
 * All API responses are mocked — no live backend required.
 */

test.describe('Admin Features', () => {
  test('admin system dashboard loads', async ({ page }) => {
    await setupAdminAuth(page);

    await mockApiResponse(page, '**/api/v1/admin/system/stats', {
      success: true,
      data: {
        totalUsers: 150, activeUsers: 42, totalCharacters: 300, totalChats: 1200,
        pendingReports: 3,
        subscriptionBreakdown: { free: 100, pro: 40, team: 10 },
        recentSignups: [],
      },
      meta: { timestamp: new Date().toISOString() },
    });
    await mockApiResponse(page, '**/api/v1/admin/jobs', { success: true, data: [] });

    await page.goto('/admin/system');
    await waitForNetworkIdle(page);

    await expect(page.locator('.system-dashboard')).toBeVisible();
    await expect(page.locator('.stat-card').first()).toBeVisible();
  });

  test('stats cards show values', async ({ page }) => {
    await setupAdminAuth(page);

    await mockApiResponse(page, '**/api/v1/admin/system/stats', {
      success: true,
      data: {
        totalUsers: 150, activeUsers: 42, totalCharacters: 300, totalChats: 1200,
        pendingReports: 3,
        subscriptionBreakdown: { free: 100, pro: 40, team: 10 },
        recentSignups: [],
      },
      meta: { timestamp: new Date().toISOString() },
    });
    await mockApiResponse(page, '**/api/v1/admin/jobs', { success: true, data: [] });

    await page.goto('/admin/system');
    await waitForNetworkIdle(page);

    const statValues = page.locator('.stat-value');
    const count = await statValues.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const text = await statValues.nth(i).textContent();
      expect(text?.trim()).not.toBe('');
    }
  });

  test('announcements card visible', async ({ page }) => {
    await setupAdminAuth(page);

    await mockApiResponse(page, '**/api/v1/admin/system/stats', {
      success: true,
      data: {
        totalUsers: 150, activeUsers: 42, totalCharacters: 300, totalChats: 1200,
        pendingReports: 3,
        subscriptionBreakdown: { free: 100, pro: 40, team: 10 },
        recentSignups: [],
      },
      meta: { timestamp: new Date().toISOString() },
    });
    await mockApiResponse(page, '**/api/v1/admin/jobs', { success: true, data: [] });

    await page.goto('/admin/system');
    await waitForNetworkIdle(page);

    await expect(page.locator('.announcements-card')).toBeVisible();
  });

  test('user management loads', async ({ page }) => {
    await setupAdminAuth(page);

    await mockApiResponse(page, '**/api/v1/admin/users*', {
      success: true,
      data: {
        users: [
          { id: 'user_1', email: 'user1@example.com', displayName: 'User One', role: 'user', status: 'active', createdAt: '2026-01-15T08:00:00Z' },
        ],
        total: 1,
      },
      meta: { timestamp: new Date().toISOString() },
    });

    await page.goto('/admin/users');
    await waitForNetworkIdle(page);

    await expect(page.locator('.user-management')).toBeVisible();
    await expect(page.locator('.users-table')).toBeVisible();
  });

  test('GDPR page loads', async ({ page }) => {
    await setupAdminAuth(page);

    await mockApiResponse(page, '**/api/v1/admin/gdpr/requests*', {
      success: true,
      data: {
        requests: [
          { id: 'gdpr_1', userId: 'user_1', email: 'user1@example.com', status: 'pending', requestedAt: '2026-02-20T10:00:00Z', scheduledAt: '2026-03-22T10:00:00Z' },
        ],
        total: 1,
      },
      meta: { timestamp: new Date().toISOString() },
    });

    await page.goto('/admin/gdpr');
    await waitForNetworkIdle(page);

    await expect(page.locator('.gdpr-management')).toBeVisible();
  });

  test('non-admin redirected to /chat', async ({ page }) => {
    await setupAuth(page, { role: 'user', plan: 'free' });

    await page.goto('/admin/system');
    await page.waitForURL(/\/chat/, { timeout: 10000 });

    expect(page.url()).toContain('/chat');
  });
});
