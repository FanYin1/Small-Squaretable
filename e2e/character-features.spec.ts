import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle, mockApiResponse, setupAuth, mockCommonEndpoints, gotoWithAuth } from './utils/helpers';

test.describe('Character Features', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('character creation page loads', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);
    await gotoWithAuth(page, '/characters/new');
    await waitForNetworkIdle(page);
    // Should be on character creation page, not redirected
    expect(page.url()).toContain('/characters/new');
    await expect(page.locator('.dashboard-layout')).toBeVisible();
  });

  test('my characters page loads', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);
    await mockApiResponse(page, '**/api/v1/characters', {
      success: true,
      data: [],
    });
    await gotoWithAuth(page, '/my-characters');
    await waitForNetworkIdle(page);
    expect(page.url()).toContain('/my-characters');
    await expect(page.locator('.dashboard-layout')).toBeVisible();
  });

  test('character detail has action buttons', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/characters/char_1', {
      success: true,
      data: {
        id: 'char_1', name: 'Test Bot', description: 'A test character',
        tags: ['test'], rating: 4.5, avatar: null, downloadCount: 100,
        viewCount: 500, createdAt: '2026-02-01T00:00:00Z',
      },
    });
    await mockApiResponse(page, '**/api/v1/characters/char_1/ratings', {
      success: true, data: { overall: '4.5', count: 10, userRating: null },
    });
    await mockApiResponse(page, '**/api/v1/social/favorites/char_1/status', {
      success: true, data: { isFavorited: false, favoriteCount: 5 },
    });
    await mockApiResponse(page, '**/api/v1/social/characters/char_1/comments*', {
      success: true, data: [],
    });
    await mockApiResponse(page, '**/api/v1/recommendations/similar/char_1*', {
      success: true, data: [],
    });
    await page.goto('/characters/char_1');
    await waitForNetworkIdle(page);
    await expect(page.locator('.action-buttons')).toBeVisible();
  });

  test('character edit page loads for owner', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);
    await mockApiResponse(page, '**/api/v1/characters/char_1', {
      success: true,
      data: {
        id: 'char_1', name: 'Test Bot', description: 'A test character',
        tags: ['test'], rating: 4.5, avatar: null, downloadCount: 100,
        viewCount: 500, createdAt: '2026-02-01T00:00:00Z',
        userId: 'user_1', tenantId: 'tenant_1',
      },
    });
    await gotoWithAuth(page, '/characters/char_1/edit');
    await waitForNetworkIdle(page);
    expect(page.url()).toContain('/characters/char_1/edit');
    await expect(page.locator('.dashboard-layout')).toBeVisible();
  });
});
