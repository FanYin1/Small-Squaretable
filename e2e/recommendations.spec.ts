import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

const MOCK_CHARACTERS = [
  { id: 'char_1', name: 'Popular Bot', description: 'Trending', tags: ['popular'], rating: 4.5, avatar: null, downloadCount: 500, viewCount: 2000, createdAt: '2026-02-01T00:00:00Z' },
  { id: 'char_2', name: 'New Bot', description: 'Fresh', tags: ['new'], rating: 4.0, avatar: null, downloadCount: 100, viewCount: 800, createdAt: '2026-02-10T00:00:00Z' },
];

test.describe('Recommendations', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('market page shows recommendation section when trending data exists', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/recommendations/trending*', {
      success: true,
      data: [
        { characterId: 'char_1', score: 0.95, source: 'trending' },
        { characterId: 'char_2', score: 0.85, source: 'trending' },
      ],
    });
    await mockApiResponse(page, '**/api/v1/characters/char_1', { success: true, data: MOCK_CHARACTERS[0] });
    await mockApiResponse(page, '**/api/v1/characters/char_2', { success: true, data: MOCK_CHARACTERS[1] });
    await mockApiResponse(page, '**/api/v1/characters/marketplace*', {
      success: true, data: { items: MOCK_CHARACTERS, pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false } },
    });
    await mockApiResponse(page, '**/api/v1/characters/search*', { success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } } });
    await page.goto('/market');
    await waitForNetworkIdle(page);
    // The recommendation section should be visible
    const section = page.locator('.recommendation-section');
    await expect(section.first()).toBeVisible();
  });

  test('recommendation section has title', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/recommendations/trending*', {
      success: true,
      data: [{ characterId: 'char_1', score: 0.95, source: 'trending' }],
    });
    await mockApiResponse(page, '**/api/v1/characters/char_1', { success: true, data: MOCK_CHARACTERS[0] });
    await mockApiResponse(page, '**/api/v1/characters/marketplace*', {
      success: true, data: { items: MOCK_CHARACTERS, pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false } },
    });
    await mockApiResponse(page, '**/api/v1/characters/search*', { success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } } });
    await page.goto('/market');
    await waitForNetworkIdle(page);
    const title = page.locator('.recommendation-title');
    await expect(title.first()).toBeVisible({ timeout: 10000 });
  });

  test('empty trending hides recommendation section', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/recommendations/trending*', {
      success: true, data: [],
    });
    await mockApiResponse(page, '**/api/v1/characters/marketplace*', {
      success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } },
    });
    await page.goto('/market');
    await waitForNetworkIdle(page);
    await page.waitForTimeout(1000);
    const section = page.locator('.recommendation-section');
    const visible = await section.isVisible().catch(() => false);
    expect(visible).toBe(false);
  });

  test('character detail page loads without similar characters', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/characters/char_1', { success: true, data: MOCK_CHARACTERS[0] });
    await mockApiResponse(page, '**/api/v1/characters/char_1/ratings', {
      success: true, data: { overall: '4.5', count: 10, userRating: null },
    });
    await mockApiResponse(page, '**/api/v1/social/favorites/char_1/status', {
      success: true, data: { isFavorited: false, favoriteCount: 5 },
    });
    await mockApiResponse(page, '**/api/v1/social/characters/char_1/comments*', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/recommendations/similar/char_1*', { success: true, data: [] });
    await page.goto('/characters/char_1');
    await waitForNetworkIdle(page);
    await expect(page.locator('.character-detail-page')).toBeVisible();
    expect(page.url()).toContain('/characters/char_1');
  });
});
