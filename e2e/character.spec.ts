import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle, mockApiResponse, setupAuth } from './utils/helpers';

const MOCK_CHARACTER = {
  id: 'char_1',
  name: 'Test Bot',
  description: 'A test character for E2E',
  tags: ['test', 'bot'],
  rating: 4.5,
  avatar: null,
  downloadCount: 100,
  viewCount: 500,
  createdAt: '2026-02-01T00:00:00Z',
};

test.describe('Characters', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('market page shows character grid', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/characters/marketplace*', {
      success: true,
      data: { items: [MOCK_CHARACTER], total: 1 },
    });
    await mockApiResponse(page, '**/api/v1/recommendations/trending*', {
      success: true,
      data: [],
    });
    await page.goto('/market');
    await waitForNetworkIdle(page);
    await expect(page.locator('.dashboard-layout')).toBeVisible();
    expect(page.url()).toContain('/market');
  });

  test('character detail page loads', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/characters/char_1', {
      success: true,
      data: MOCK_CHARACTER,
    });
    await mockApiResponse(page, '**/api/v1/characters/char_1/ratings', {
      success: true,
      data: { overall: '4.5', count: 10, userRating: null },
    });
    await mockApiResponse(page, '**/api/v1/social/favorites/char_1/status', {
      success: true,
      data: { isFavorited: false, favoriteCount: 5 },
    });
    await mockApiResponse(page, '**/api/v1/social/characters/char_1/comments*', {
      success: true,
      data: [],
    });
    await mockApiResponse(page, '**/api/v1/recommendations/similar/char_1*', {
      success: true,
      data: [],
    });
    await page.goto('/characters/char_1');
    await waitForNetworkIdle(page);
    await expect(page.locator('.character-detail-page')).toBeVisible();
  });

  test('character detail shows name and description', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/characters/char_1', {
      success: true,
      data: MOCK_CHARACTER,
    });
    await mockApiResponse(page, '**/api/v1/characters/char_1/ratings', {
      success: true,
      data: { overall: '4.5', count: 10, userRating: null },
    });
    await mockApiResponse(page, '**/api/v1/social/favorites/char_1/status', {
      success: true,
      data: { isFavorited: false, favoriteCount: 5 },
    });
    await mockApiResponse(page, '**/api/v1/social/characters/char_1/comments*', {
      success: true,
      data: [],
    });
    await mockApiResponse(page, '**/api/v1/recommendations/similar/char_1*', {
      success: true,
      data: [],
    });
    await page.goto('/characters/char_1');
    await waitForNetworkIdle(page);
    await expect(page.locator('.detail-header')).toBeVisible();
    // Character name should be in an h2
    const nameEl = page.locator('.character-detail-page h2');
    await expect(nameEl).toContainText('Test Bot');
  });

  test('my characters requires auth', async ({ page }) => {
    await page.goto('/my-characters');
    await page.waitForURL(/\/auth\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/auth/login');
  });
});
