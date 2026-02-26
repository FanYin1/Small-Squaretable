import { test, expect } from '@playwright/test';
import { setupAuth, setupAdminAuth, mockApiResponse, waitForNetworkIdle, mockCommonEndpoints, mockChatEndpoints } from './utils/helpers';

/**
 * E2E Tests: Admin Features
 *
 * Tests admin panel pages (system dashboard, user management, GDPR)
 * and verifies non-admin users are redirected away.
 * All API responses are mocked — no live backend required.
 *
 * NOTE: Admin tests first navigate to /chat to let userStore.initialize()
 * complete (populating user.role), then navigate to the admin page.
 * This avoids a race condition where the router guard checks user.role
 * before the async /auth/me response arrives.
 */

async function mockAdminSystemEndpoints(page: import('@playwright/test').Page) {
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
}

/** Navigate to /chat first to let userStore initialize, then use client-side
 *  navigation to the admin page. A second page.goto() would trigger a full
 *  reload, re-introducing the race between userStore.initialize() and the
 *  router guard. Client-side router.push() avoids that. */
async function gotoAdminPage(page: import('@playwright/test').Page, adminPath: string) {
  // Set up response waiter BEFORE navigation so we don't miss fast responses
  const authMePromise = page.waitForResponse(
    resp => resp.url().includes('/auth/me'),
    { timeout: 15000 },
  ).catch(() => null);

  await page.goto('/chat');
  await authMePromise; // Ensure userStore.user is populated
  await waitForNetworkIdle(page);

  // Client-side navigation — no full page reload
  await page.evaluate((path) => {
    const appEl = document.getElementById('app');
    if (appEl && (appEl as any).__vue_app__) {
      const router = (appEl as any).__vue_app__.config.globalProperties.$router;
      if (router) router.push(path);
    }
  }, adminPath);

  // Wait for the URL to actually change to the admin path
  try {
    await page.waitForURL(`**${adminPath}*`, { timeout: 10000 });
  } catch { /* fallback: continue and let assertions fail with clear context */ }
  await waitForNetworkIdle(page);
}

test.describe('Admin Features', () => {
  test('admin system dashboard loads', async ({ page }) => {
    await setupAdminAuth(page);
    await mockCommonEndpoints(page);
    await mockChatEndpoints(page);
    await mockAdminSystemEndpoints(page);

    await gotoAdminPage(page, '/admin/system');

    await expect(page.locator('.system-dashboard')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.stat-card').first()).toBeVisible();
  });

  test('stats cards show values', async ({ page }) => {
    await setupAdminAuth(page);
    await mockCommonEndpoints(page);
    await mockChatEndpoints(page);
    await mockAdminSystemEndpoints(page);

    await gotoAdminPage(page, '/admin/system');

    await expect(page.locator('.system-dashboard')).toBeVisible({ timeout: 10000 });
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
    await mockCommonEndpoints(page);
    await mockChatEndpoints(page);
    await mockAdminSystemEndpoints(page);

    await gotoAdminPage(page, '/admin/system');

    await expect(page.locator('.announcements-card')).toBeVisible();
  });

  test('user management loads', async ({ page }) => {
    await setupAdminAuth(page);
    await mockCommonEndpoints(page);
    await mockChatEndpoints(page);

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

    await gotoAdminPage(page, '/admin/users');

    await expect(page.locator('.user-management')).toBeVisible();
    await expect(page.locator('.users-table')).toBeVisible();
  });

  test('GDPR page loads', async ({ page }) => {
    await setupAdminAuth(page);
    await mockCommonEndpoints(page);
    await mockChatEndpoints(page);

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

    await gotoAdminPage(page, '/admin/gdpr');

    await expect(page.locator('.gdpr-management')).toBeVisible();
  });

  test('non-admin redirected to /chat', async ({ page }) => {
    await setupAuth(page, { role: 'user', plan: 'free' });
    await mockCommonEndpoints(page);
    await mockChatEndpoints(page);

    await page.goto('/admin/system');
    await page.waitForURL(/\/chat/, { timeout: 10000 });

    expect(page.url()).toContain('/chat');
  });
});
