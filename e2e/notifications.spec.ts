import { test, expect } from '@playwright/test';
import { setupAuth, clearSession, mockApiResponse, waitForNetworkIdle, mockCommonEndpoints } from './utils/helpers';

/**
 * E2E Tests: Notifications
 *
 * Tests notifications page loading, notification list rendering,
 * empty state, and mark-all-read button.
 * All API responses are mocked — no live backend required.
 */

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
    isRead: true,
    targetType: 'character',
    targetId: 'char_1',
    createdAt: '2026-02-19T10:30:00Z',
  },
];

test.describe('Notifications', () => {
  // 1. Notifications page loads
  test('notifications page loads', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);
    await mockApiResponse(page, '**/api/v1/notifications', { success: true, data: sampleNotifications });
    await mockApiResponse(page, '**/api/v1/notifications?*', { success: true, data: sampleNotifications });
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', { success: true, data: { count: 1 } });

    await page.goto('/notifications');
    await waitForNetworkIdle(page);

    await expect(page.locator('.notifications-page')).toBeVisible();
  });

  // 2. Notification list renders
  test('notification list renders with items', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);
    await mockApiResponse(page, '**/api/v1/notifications', { success: true, data: sampleNotifications });
    await mockApiResponse(page, '**/api/v1/notifications?*', { success: true, data: sampleNotifications });
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', { success: true, data: { count: 1 } });

    await page.goto('/notifications');
    await waitForNetworkIdle(page);

    const items = page.locator('.notification-item');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify notification message text is rendered
    await expect(page.locator('.notification-message').first()).toBeVisible();
  });

  // 3. Empty state shown when no notifications
  test('empty state shown when no notifications', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);
    await mockApiResponse(page, '**/api/v1/notifications', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/notifications?*', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', { success: true, data: { count: 0 } });

    await page.goto('/notifications');
    await waitForNetworkIdle(page);

    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-title')).toBeVisible();
  });

  // 4. Mark all read button exists
  test('mark all read button exists', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);
    await mockApiResponse(page, '**/api/v1/notifications', { success: true, data: sampleNotifications });
    await mockApiResponse(page, '**/api/v1/notifications?*', { success: true, data: sampleNotifications });
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', { success: true, data: { count: 1 } });

    await page.goto('/notifications');
    await waitForNetworkIdle(page);

    // The "Mark all as read" button is in the notifications-header
    const markAllButton = page.locator('.notifications-header button').filter({ hasText: /Mark all|全部已读/i });
    await expect(markAllButton.first()).toBeVisible({ timeout: 10000 });
  });
});
