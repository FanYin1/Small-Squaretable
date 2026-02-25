import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { generateUniqueUser } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

/**
 * E2E Tests: Admin & Notification Features
 *
 * Smoke tests for admin panel enhancements (Iteration 48)
 * and notification preferences (Iteration 46).
 * API responses are mocked — no live backend required.
 */

const ADMIN_AUTH_MOCK = {
  success: true,
  data: {
    user: {
      id: 'admin_1',
      email: 'admin@example.com',
      displayName: 'Admin User',
      role: 'admin',
      tenantId: 'tenant_1',
      plan: 'team',
    },
  },
};

const SYSTEM_STATS_MOCK = {
  success: true,
  data: {
    totalUsers: 150,
    activeUsers: 42,
    totalCharacters: 300,
    totalChats: 1200,
    pendingReports: 3,
    subscriptionBreakdown: { free: 100, pro: 40, team: 10 },
    recentSignups: [],
  },
  meta: { timestamp: new Date().toISOString() },
};

const GDPR_REQUESTS_MOCK = {
  success: true,
  data: {
    requests: [
      {
        id: 'gdpr_1',
        userId: 'user_1',
        email: 'user1@example.com',
        status: 'pending',
        requestedAt: '2026-02-20T10:00:00Z',
        scheduledAt: '2026-03-22T10:00:00Z',
      },
    ],
    total: 1,
  },
  meta: { timestamp: new Date().toISOString() },
};

const USERS_MOCK = {
  success: true,
  data: {
    users: [
      {
        id: 'user_1',
        email: 'user1@example.com',
        displayName: 'User One',
        role: 'user',
        status: 'active',
        createdAt: '2026-01-15T08:00:00Z',
      },
      {
        id: 'user_2',
        email: 'user2@example.com',
        displayName: 'User Two',
        role: 'user',
        status: 'suspended',
        createdAt: '2026-02-01T12:00:00Z',
      },
    ],
    total: 2,
  },
  meta: { timestamp: new Date().toISOString() },
};

test.describe('Admin Features', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);

    // Mock admin auth
    await mockApiResponse(page, '**/api/v1/auth/me', ADMIN_AUTH_MOCK);
    await mockApiResponse(page, '**/api/v1/auth/refresh', ADMIN_AUTH_MOCK);
  });

  test('admin system dashboard loads with stats', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/admin/system/stats', SYSTEM_STATS_MOCK);
    await mockApiResponse(page, '**/api/v1/admin/jobs', { success: true, data: [] });

    await page.goto('/admin/system');
    await waitForNetworkIdle(page);

    // Verify the system dashboard loaded
    const isAdminPage = page.url().includes('/admin');
    expect(isAdminPage).toBe(true);

    // Verify stat cards or announcement section is visible
    await expect(page.locator('.stat-card, .el-statistic, .el-card').first()).toBeVisible();
  });

  test('admin can view announcement section', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/admin/system/stats', SYSTEM_STATS_MOCK);
    await mockApiResponse(page, '**/api/v1/admin/jobs', { success: true, data: [] });

    await page.goto('/admin/system');
    await waitForNetworkIdle(page);

    // Verify announcement textarea or section is visible
    await expect(
      page.locator('textarea, .announcement-section, [class*="announcement"]').first()
    ).toBeVisible();
  });

  test('admin user management shows user table', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/admin/users*', USERS_MOCK);

    await page.goto('/admin/users');
    await waitForNetworkIdle(page);

    expect(page.url()).toContain('/admin');

    // Verify user table is visible
    await expect(page.locator('.el-table, table').first()).toBeVisible();
  });

  test('admin GDPR page loads with requests', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/admin/gdpr/requests*', GDPR_REQUESTS_MOCK);

    await page.goto('/admin/gdpr');
    await waitForNetworkIdle(page);

    expect(page.url()).toContain('/admin');

    // Verify GDPR table or empty state is visible
    await expect(page.locator('.el-table, .el-empty').first()).toBeVisible();
  });
});

test.describe('Notification Features', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    await clearSession(page);

    const testUser = generateUniqueUser();
    await authPage.register(testUser.email, testUser.password, testUser.name);
    await page.waitForURL(/\/chat|\/dashboard/, { timeout: 15000 });
    await waitForNetworkIdle(page);
  });

  test('notifications page loads', async ({ page }) => {
    await page.goto('/notifications');
    await waitForNetworkIdle(page);

    // Verify the notifications page loaded
    const isNotifPage = page.url().includes('/notification');
    expect(isNotifPage).toBe(true);

    // Verify notification list or empty state is visible
    await expect(
      page.locator('.notification-list, .el-empty, .notifications-page').first()
    ).toBeVisible();
  });

  test('notification bell is visible in header', async ({ page }) => {
    await page.goto('/chat');
    await waitForNetworkIdle(page);

    // Verify notification bell icon is visible in header
    await expect(
      page.locator('.notification-bell, [class*="notification-bell"]').first()
    ).toBeVisible();
  });
});
