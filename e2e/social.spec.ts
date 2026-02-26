import { test, expect } from '@playwright/test';
import { setupAuth, mockApiResponse, waitForNetworkIdle, mockCommonEndpoints, gotoWithAuth } from './utils/helpers';

/**
 * E2E Tests: Social Features
 *
 * Tests user profile page, follow button, character detail favorite button,
 * and comment section visibility.
 * All API responses are mocked — no live backend required.
 */

const TARGET_USER_ID = 'user_2';
const TARGET_CHARACTER_ID = 'char_1';

test.describe('Social Features', () => {
  // 1. User profile page loads (public)
  test('user profile page loads', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);

    await mockApiResponse(page, `**/api/v1/social/users/${TARGET_USER_ID}/profile`, {
      success: true,
      data: { id: TARGET_USER_ID, displayName: 'Test User', avatarUrl: null, bio: 'Hello world' },
    });
    await mockApiResponse(page, `**/api/v1/social/follows/${TARGET_USER_ID}/status`, {
      success: true,
      data: { isFollowing: false, followerCount: 10, followingCount: 5 },
    });
    await mockApiResponse(page, '**/api/v1/characters/marketplace*', {
      success: true,
      data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } },
    });

    await gotoWithAuth(page, `/user/${TARGET_USER_ID}`);
    await waitForNetworkIdle(page);

    await expect(page.locator('.user-profile')).toBeVisible();
    await expect(page.locator('.profile-name')).toContainText('Test User');
  });

  // 2. Follow button visible on user profile
  test('follow button visible on user profile', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);

    await mockApiResponse(page, `**/api/v1/social/users/${TARGET_USER_ID}/profile`, {
      success: true,
      data: { id: TARGET_USER_ID, displayName: 'Test User', avatarUrl: null, bio: 'Hello world' },
    });
    await mockApiResponse(page, `**/api/v1/social/follows/${TARGET_USER_ID}/status`, {
      success: true,
      data: { isFollowing: false, followerCount: 10, followingCount: 5 },
    });
    await mockApiResponse(page, '**/api/v1/characters/marketplace*', {
      success: true,
      data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } },
    });

    await gotoWithAuth(page, `/user/${TARGET_USER_ID}`);
    await waitForNetworkIdle(page);

    const profileActions = page.locator('.profile-actions');
    await expect(profileActions).toBeVisible();

    // Follow/unfollow button should exist within profile-actions
    const followButton = profileActions.locator('button').first();
    await expect(followButton).toBeVisible();
  });

  // 3. Character detail has favorite button
  test('character detail has favorite button', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);

    await mockApiResponse(page, `**/api/v1/characters/${TARGET_CHARACTER_ID}`, {
      success: true,
      data: {
        id: TARGET_CHARACTER_ID,
        name: 'Test Character',
        description: 'A test character',
        greeting: 'Hello!',
        tags: ['fantasy'],
        creatorId: 'user_2',
        downloadCount: 42,
        viewCount: 100,
        createdAt: '2026-02-01T00:00:00Z',
      },
    });
    await mockApiResponse(page, `**/api/v1/characters/${TARGET_CHARACTER_ID}/ratings`, {
      success: true,
      data: { overall: '4.5', count: 10, userRating: null },
    });
    await mockApiResponse(page, `**/api/v1/social/favorites/${TARGET_CHARACTER_ID}/status`, {
      success: true,
      data: { isFavorited: false, favoriteCount: 7 },
    });
    await mockApiResponse(page, `**/api/v1/social/characters/${TARGET_CHARACTER_ID}/comments*`, {
      success: true,
      data: [],
    });

    await gotoWithAuth(page, `/characters/${TARGET_CHARACTER_ID}`);
    await waitForNetworkIdle(page);

    const actionButtons = page.locator('.action-buttons');
    await expect(actionButtons).toBeVisible();

    // FavoriteButton is the first child in action-buttons
    const favoriteButton = page.locator('.favorite-button');
    await expect(favoriteButton.first()).toBeVisible();
  });

  // 4. Comment section visible on character detail
  test('comment section visible on character detail', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);

    await mockApiResponse(page, `**/api/v1/characters/${TARGET_CHARACTER_ID}`, {
      success: true,
      data: {
        id: TARGET_CHARACTER_ID,
        name: 'Test Character',
        description: 'A test character',
        greeting: 'Hello!',
        tags: ['fantasy'],
        creatorId: 'user_2',
        downloadCount: 42,
        viewCount: 100,
        createdAt: '2026-02-01T00:00:00Z',
      },
    });
    await mockApiResponse(page, `**/api/v1/characters/${TARGET_CHARACTER_ID}/ratings`, {
      success: true,
      data: { overall: '4.0', count: 5, userRating: null },
    });
    await mockApiResponse(page, `**/api/v1/social/favorites/${TARGET_CHARACTER_ID}/status`, {
      success: true,
      data: { isFavorited: false, favoriteCount: 3 },
    });
    await mockApiResponse(page, `**/api/v1/social/characters/${TARGET_CHARACTER_ID}/comments*`, {
      success: true,
      data: [
        {
          id: 'comment_1',
          content: 'Great character!',
          author: { id: 'user_2', displayName: 'User 2', avatarUrl: null },
          createdAt: '2026-02-20T10:00:00Z',
          isDeleted: false,
          replyCount: 0,
        },
      ],
    });

    await gotoWithAuth(page, `/characters/${TARGET_CHARACTER_ID}`);
    await waitForNetworkIdle(page);

    const commentSection = page.locator('.comment-section');
    await expect(commentSection).toBeVisible();

    const commentHeader = page.locator('.comment-section-header');
    await expect(commentHeader).toBeVisible();
  });
});
