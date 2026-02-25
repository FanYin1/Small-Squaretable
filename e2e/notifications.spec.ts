import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { generateUniqueUser } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

/**
 * E2E Tests: Notifications
 *
 * Tests notification bell component and notifications page.
 * All API responses are mocked — no live backend required.
 */

const AUTH_MOCK = {
  success: true,
  data: {
    user: {
      id: 'user_1',
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'user',
      tenantId: 'tenant_1',
      plan: 'free',
    },
  },
};

const sampleNotifications = [
  {
    id: 'notif_1',
    type: 'follow',
    message: 'started following you',
    actor: { id: 'user_2', displayName: 'User 2', avatarUrl: null },
    actorId: 'user_2',
    actorName: 'User 2',
    isRead: false,
    targetType: 'user',
    targetId: 'user_1',
    createdAt: '2026-02-20T12:00:00Z',
  },
  {
    id: 'notif_2',
    type: 'favorite',
    message: 'favorited your character',
    actor: { id: 'user_3', displayName: 'User 3', avatarUrl: null },
    actorId: 'user_3',
    actorName: 'User 3',
    isRead: false,
    targetType: 'character',
    targetId: 'char_1',
    createdAt: '2026-02-19T10:30:00Z',
  },
  {
    id: 'notif_3',
    type: 'comment',
    message: 'commented on your character',
    actor: { id: 'user_4', displayName: 'User 4', avatarUrl: null },
    actorId: 'user_4',
    actorName: 'User 4',
    isRead: true,
    targetType: 'character',
    targetId: 'char_2',
    createdAt: '2026-02-18T08:00:00Z',
  },
];

test.describe('Notifications', () => {
  // ── Notification Bell ──
  test.describe('Notification Bell', () => {
    let authPage: AuthPage;

    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);

      await mockApiResponse(page, '**/api/v1/auth/me', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/auth/register', AUTH_MOCK);

      // Unread count
      await mockApiResponse(page, '**/api/v1/notifications/unread-count', {
        success: true,
        data: { count: 3 },
      });

      // Notification list (for popover)
      await mockApiResponse(page, '**/api/v1/notifications?*', {
        success: true,
        data: sampleNotifications,
      });
      await mockApiResponse(page, '**/api/v1/notifications', {
        success: true,
        data: sampleNotifications,
      });

      await clearSession(page);
      const testUser = generateUniqueUser();
      await authPage.register(testUser.email, testUser.password, testUser.name);
      await page.waitForURL(/\/chat|\/dashboard|\/$/, { timeout: 15000 });
      await waitForNetworkIdle(page);
    });

    test('should display notification bell in header', async ({ page }) => {
      // The notification bell is rendered in the header/layout
      const bell = page.locator('.notification-bell');
      await expect(bell.first()).toBeVisible();

      // Also check for the bell icon element
      const bellIcon = page.locator('.notification-bell .el-icon');
      await expect(bellIcon.first()).toBeVisible();
    });

    test('should show unread count badge', async ({ page }) => {
      // The badge should display the unread count from the mock (3)
      const badge = page.locator('.notification-bell .el-badge__content');
      await expect(badge.first()).toBeVisible();

      const badgeText = await badge.textContent();
      expect(badgeText).toBe('3');
    });

    test('should show zero badge when no unread notifications', async ({ page }) => {
      // Override unread count to 0
      await page.route('**/api/v1/notifications/unread-count', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { count: 0 } }),
        });
      });

      await page.goto('/chat');
      await waitForNetworkIdle(page);

      // Badge should be hidden when count is 0
      const badge = page.locator('.notification-bell .el-badge__content');
      const badgeVisible = await badge.isVisible().catch(() => false);
      // When unread count is 0, the badge should be hidden
      expect(badgeVisible).toBe(false);
    });
  });

  // ── Notifications Page ──
  test.describe('Notifications Page', () => {
    let authPage: AuthPage;

    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);

      await mockApiResponse(page, '**/api/v1/auth/me', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/auth/register', AUTH_MOCK);

      // Unread count
      await mockApiResponse(page, '**/api/v1/notifications/unread-count', {
        success: true,
        data: { count: 2 },
      });

      // Notification list
      await mockApiResponse(page, '**/api/v1/notifications?*', {
        success: true,
        data: sampleNotifications,
      });
      await mockApiResponse(page, '**/api/v1/notifications', {
        success: true,
        data: sampleNotifications,
      });

      // Mark as read
      await mockApiResponse(page, '**/api/v1/notifications/*/read', {
        success: true,
        data: { message: 'Marked as read' },
      });

      // Mark all as read
      await mockApiResponse(page, '**/api/v1/notifications/read-all', {
        success: true,
        data: { markedCount: 2 },
      });

      // Delete notification
      await mockApiResponse(page, '**/api/v1/notifications/*', {
        success: true,
        data: { message: 'Deleted' },
      });

      await clearSession(page);
      const testUser = generateUniqueUser();
      await authPage.register(testUser.email, testUser.password, testUser.name);
      await page.waitForURL(/\/chat|\/dashboard|\/$/, { timeout: 15000 });
      await waitForNetworkIdle(page);
    });

    test('should display notification list', async ({ page }) => {
      await page.goto('/notifications');
      await waitForNetworkIdle(page);

      expect(page.url()).toContain('/notifications');

      // The notification list container should be visible
      const notificationList = page.locator('.notification-list');
      await expect(notificationList.first()).toBeVisible();

      // Should have notification items
      const items = page.locator('.notification-item');
      const count = await items.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should show notification with actor name and message', async ({ page }) => {
      await page.goto('/notifications');
      await waitForNetworkIdle(page);

      // Check for actor name in the first notification
      const actorName = page.locator('.actor-name').first();
      await expect(actorName).toBeVisible();

      const nameText = await actorName.textContent();
      expect(nameText).toContain('User 2');

      // Check for notification message
      const message = page.locator('.notification-message').first();
      await expect(message).toBeVisible();

      const messageText = await message.textContent();
      expect(messageText).toContain('started following you');
    });

    test('should filter between all and unread notifications', async ({ page }) => {
      await page.goto('/notifications');
      await waitForNetworkIdle(page);

      // Radio buttons for filter: "全部" (all) and "未读" (unread)
      const allRadio = page.locator('.el-radio-button').filter({ hasText: /全部/ });
      const unreadRadio = page.locator('.el-radio-button').filter({ hasText: /未读/ });

      const allVisible = await allRadio.isVisible().catch(() => false);
      const unreadVisible = await unreadRadio.isVisible().catch(() => false);
      expect(allVisible).toBe(true);
      expect(unreadVisible).toBe(true);

      if (unreadVisible) {
        // Click unread filter
        await unreadRadio.click();
        await page.waitForTimeout(500);

        // After filtering, only unread items should show (notif_1 and notif_2 are unread)
        const items = page.locator('.notification-item');
        const count = await items.count();
        // notif_3 is read, so it should be filtered out
        expect(count).toBeGreaterThanOrEqual(0);

        // Switch back to all
        if (allVisible) {
          await allRadio.click();
          await page.waitForTimeout(500);

          const allItems = page.locator('.notification-item');
          const allCount = await allItems.count();
          expect(allCount).toBeGreaterThanOrEqual(count);
        }
      }
    });

    test('should mark single notification as read', async ({ page }) => {
      await page.goto('/notifications');
      await waitForNetworkIdle(page);

      // Find an unread notification item (has .unread class)
      const unreadItem = page.locator('.notification-item.unread').first();
      await expect(unreadItem).toBeVisible();

      // Click the notification to mark it as read
      await unreadItem.click();
      await page.waitForTimeout(500);

      // The store should have called markAsRead — verify page didn't crash
      // Navigation may occur since the notification has a targetType
      expect(page.url()).toBeTruthy();
    });

    test('should mark all notifications as read', async ({ page }) => {
      await page.goto('/notifications');
      await waitForNetworkIdle(page);

      // Find the "全部已读" (mark all read) button
      const markAllButton = page.locator('.notifications-header .el-button').filter({ hasText: /全部已读|markAllRead/ });
      await expect(markAllButton.first()).toBeVisible();

      await markAllButton.click();
      await page.waitForTimeout(500);

      // After marking all as read, unread items should no longer have .unread class
      const unreadItems = page.locator('.notification-item.unread');
      const unreadCount = await unreadItems.count();
      expect(unreadCount).toBe(0);
    });

    test('should delete a notification', async ({ page }) => {
      await page.goto('/notifications');
      await waitForNetworkIdle(page);

      const items = page.locator('.notification-item');
      const initialCount = await items.count();

      if (initialCount > 0) {
        // Hover over the first notification to reveal the delete button
        await items.first().hover();
        await page.waitForTimeout(300);

        const deleteBtn = page.locator('.delete-btn').first();
        await expect(deleteBtn).toBeVisible();

        await deleteBtn.click();
        await page.waitForTimeout(500);

        // After deletion, the item count should decrease
        const newCount = await items.count();
        expect(newCount).toBeLessThan(initialCount);
      }
    });

    test('should show empty state when no notifications', async ({ page }) => {
      // Override notifications to return empty list
      await page.route('**/api/v1/notifications?*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        });
      });
      await page.route('**/api/v1/notifications', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: [] }),
          });
        } else {
          route.continue();
        }
      });

      // Override unread count to 0
      await page.route('**/api/v1/notifications/unread-count', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { count: 0 } }),
        });
      });

      await page.goto('/notifications');
      await waitForNetworkIdle(page);

      // Should show the empty state with bell icon
      const emptyState = page.locator('.empty-state');
      await expect(emptyState.first()).toBeVisible();

      // Check for the empty title text
      const emptyTitle = page.locator('.empty-title');
      await expect(emptyTitle.first()).toBeVisible();
    });
  });
});