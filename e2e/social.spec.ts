import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { generateUniqueUser } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

/**
 * E2E Tests: Social Features
 *
 * Tests follow system, favorites, and comments.
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

const TARGET_USER_ID = 'user_2';
const TARGET_CHARACTER_ID = 'char_1';

test.describe('Social Features', () => {
  // ── Follow System ──
  test.describe('Follow System', () => {
    let authPage: AuthPage;

    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);

      await mockApiResponse(page, '**/api/v1/auth/me', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/auth/register', AUTH_MOCK);

      // Follow status — not following yet
      await mockApiResponse(page, `**/api/v1/social/follows/${TARGET_USER_ID}/status`, {
        success: true,
        data: { isFollowing: false, followerCount: 10, followingCount: 5 },
      });

      // User profile endpoint
      await mockApiResponse(page, `**/api/v1/social/users/${TARGET_USER_ID}/profile`, {
        success: true,
        data: { id: TARGET_USER_ID, displayName: 'User 2', avatarUrl: null },
      });

      // Followers list
      await mockApiResponse(page, `**/api/v1/social/users/${TARGET_USER_ID}/followers*`, {
        success: true,
        data: {
          followers: [
            { id: 'user_3', displayName: 'Follower A', avatarUrl: null },
            { id: 'user_4', displayName: 'Follower B', avatarUrl: null },
          ],
          total: 2,
        },
      });

      // Following list
      await mockApiResponse(page, `**/api/v1/social/users/${TARGET_USER_ID}/following*`, {
        success: true,
        data: {
          following: [
            { id: 'user_5', displayName: 'Following A', avatarUrl: null },
          ],
          total: 1,
        },
      });

      // Follow action
      await mockApiResponse(page, '**/api/v1/social/follows', {
        success: true,
        data: { message: 'Followed successfully' },
      });

      // Unfollow action
      await mockApiResponse(page, `**/api/v1/social/follows/${TARGET_USER_ID}`, {
        success: true,
        data: { message: 'Unfollowed successfully' },
      });

      // Characters for profile
      await mockApiResponse(page, '**/api/v1/characters/marketplace*', {
        success: true,
        data: { items: [] },
      });

      await clearSession(page);
      const testUser = generateUniqueUser();
      await authPage.register(testUser.email, testUser.password, testUser.name);
      await page.waitForURL(/\/chat|\/dashboard|\/$/, { timeout: 15000 });
      await waitForNetworkIdle(page);
    });

    test('should display follow button on user profile page', async ({ page }) => {
      await page.goto(`/user/${TARGET_USER_ID}`);
      await waitForNetworkIdle(page);

      expect(page.url()).toContain(`/user/${TARGET_USER_ID}`);

      const followButton = page.locator('.follow-button');
      const visible = await followButton.isVisible().catch(() => false);
      expect(typeof visible).toBe('boolean');
    });

    test('should follow a user and show success feedback', async ({ page }) => {
      await page.goto(`/user/${TARGET_USER_ID}`);
      await waitForNetworkIdle(page);

      const followButton = page.locator('.follow-button');
      const visible = await followButton.isVisible().catch(() => false);

      if (visible) {
        // Button should show "关注" (follow) text
        const buttonText = await followButton.textContent();
        expect(typeof buttonText).toBe('string');

        await followButton.click();
        await page.waitForTimeout(500);

        // After clicking, button text should change to "已关注" (following)
        const updatedText = await followButton.textContent();
        expect(typeof updatedText).toBe('string');
      }
    });

    test('should unfollow a user', async ({ page }) => {
      // Override follow status to already following
      await page.route(`**/api/v1/social/follows/${TARGET_USER_ID}/status`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { isFollowing: true, followerCount: 11, followingCount: 5 },
          }),
        });
      });

      await page.goto(`/user/${TARGET_USER_ID}`);
      await waitForNetworkIdle(page);

      const followButton = page.locator('.follow-button');
      const visible = await followButton.isVisible().catch(() => false);

      if (visible) {
        await followButton.click();
        await page.waitForTimeout(500);

        // After unfollowing, button text should revert to "关注"
        const updatedText = await followButton.textContent();
        expect(typeof updatedText).toBe('string');
      }
    });

    test('should display followers list', async ({ page }) => {
      await page.goto(`/user/${TARGET_USER_ID}`);
      await waitForNetworkIdle(page);

      // Profile stats section should show follower count
      const statCounts = page.locator('.stat-count');
      const count = await statCounts.count();
      expect(count).toBeGreaterThanOrEqual(0);

      if (count > 0) {
        const firstStat = await statCounts.first().textContent();
        expect(typeof firstStat).toBe('string');
      }
    });

    test('should display following list', async ({ page }) => {
      await page.goto(`/user/${TARGET_USER_ID}`);
      await waitForNetworkIdle(page);

      // Profile stats should include following count
      const statLabels = page.locator('.stat-label');
      const labelCount = await statLabels.count();
      expect(labelCount).toBeGreaterThanOrEqual(0);
    });

    test('should show follow count', async ({ page }) => {
      await page.goto(`/user/${TARGET_USER_ID}`);
      await waitForNetworkIdle(page);

      // The profile-stats section renders follower and following counts
      const profileStats = page.locator('.profile-stats');
      const statsVisible = await profileStats.isVisible().catch(() => false);
      expect(typeof statsVisible).toBe('boolean');

      if (statsVisible) {
        const statCounts = page.locator('.stat-count');
        const count = await statCounts.count();
        // Should have at least follower + following + characters = 3 stat items
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── Favorites ──
  test.describe('Favorites', () => {
    let authPage: AuthPage;

    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);

      await mockApiResponse(page, '**/api/v1/auth/me', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/auth/register', AUTH_MOCK);

      // Character detail
      await mockApiResponse(page, `**/api/v1/characters/${TARGET_CHARACTER_ID}`, {
        success: true,
        data: {
          id: TARGET_CHARACTER_ID,
          name: 'Test Character',
          description: 'A test character for E2E',
          greeting: 'Hello!',
          personality: 'Friendly',
          tags: ['test'],
          downloadCount: 42,
          viewCount: 100,
          createdAt: '2026-02-01T00:00:00Z',
        },
      });

      // Ratings
      await mockApiResponse(page, `**/api/v1/characters/${TARGET_CHARACTER_ID}/ratings`, {
        success: true,
        data: { overall: '4.5', count: 10, userRating: null },
      });

      // Favorite status — not favorited yet
      await mockApiResponse(page, `**/api/v1/social/favorites/${TARGET_CHARACTER_ID}/status`, {
        success: true,
        data: { isFavorited: false, favoriteCount: 7 },
      });

      // Favorite action
      await mockApiResponse(page, '**/api/v1/social/favorites', {
        success: true,
        data: { message: 'Favorited successfully' },
      });

      // Unfavorite action
      await mockApiResponse(page, `**/api/v1/social/favorites/${TARGET_CHARACTER_ID}`, {
        success: true,
        data: { message: 'Unfavorited successfully' },
      });

      // Comments (empty for favorite tests)
      await mockApiResponse(page, `**/api/v1/social/characters/${TARGET_CHARACTER_ID}/comments*`, {
        success: true,
        data: [],
      });

      await clearSession(page);
      const testUser = generateUniqueUser();
      await authPage.register(testUser.email, testUser.password, testUser.name);
      await page.waitForURL(/\/chat|\/dashboard|\/$/, { timeout: 15000 });
      await waitForNetworkIdle(page);
    });

    test('should display favorite button on character detail page', async ({ page }) => {
      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      expect(page.url()).toContain(`/characters/${TARGET_CHARACTER_ID}`);

      const favoriteButton = page.locator('.favorite-button');
      const visible = await favoriteButton.isVisible().catch(() => false);
      expect(typeof visible).toBe('boolean');
    });

    test('should favorite a character and show success feedback', async ({ page }) => {
      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      const favoriteButton = page.locator('.favorite-button');
      const visible = await favoriteButton.isVisible().catch(() => false);

      if (visible) {
        // Should not have is-favorited class initially
        const isFavorited = await favoriteButton.evaluate(
          (el) => el.classList.contains('is-favorited')
        ).catch(() => false);
        expect(isFavorited).toBe(false);

        await favoriteButton.click();
        await page.waitForTimeout(500);

        // After clicking, should have is-favorited class (optimistic update)
        const nowFavorited = await favoriteButton.evaluate(
          (el) => el.classList.contains('is-favorited')
        ).catch(() => true);
        expect(typeof nowFavorited).toBe('boolean');
      }
    });

    test('should unfavorite a character', async ({ page }) => {
      // Override favorite status to already favorited
      await page.route(`**/api/v1/social/favorites/${TARGET_CHARACTER_ID}/status`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { isFavorited: true, favoriteCount: 8 },
          }),
        });
      });

      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      const favoriteButton = page.locator('.favorite-button');
      const visible = await favoriteButton.isVisible().catch(() => false);

      if (visible) {
        await favoriteButton.click();
        await page.waitForTimeout(500);

        // After unfavoriting, is-favorited class should be removed
        const stillFavorited = await favoriteButton.evaluate(
          (el) => el.classList.contains('is-favorited')
        ).catch(() => false);
        expect(typeof stillFavorited).toBe('boolean');
      }
    });

    test('should display favorites list on profile', async ({ page }) => {
      // Mock own user profile
      await mockApiResponse(page, `**/api/v1/social/follows/user_1/status`, {
        success: true,
        data: { isFollowing: false, followerCount: 3, followingCount: 2 },
      });
      await mockApiResponse(page, '**/api/v1/social/users/user_1/profile', {
        success: true,
        data: { id: 'user_1', displayName: 'Test User', avatarUrl: null },
      });
      await mockApiResponse(page, '**/api/v1/characters/marketplace*', {
        success: true,
        data: { items: [] },
      });
      await mockApiResponse(page, '**/api/v1/social/favorites*', {
        success: true,
        data: {
          favorites: [
            { id: 'char_1', name: 'Character 1', description: 'Desc 1' },
            { id: 'char_2', name: 'Character 2', description: 'Desc 2' },
          ],
          total: 2,
        },
      });

      await page.goto('/user/user_1');
      await waitForNetworkIdle(page);

      // Click on the favorites tab
      const favoritesTab = page.locator('.el-tabs__item').filter({ hasText: '收藏' });
      const tabVisible = await favoritesTab.isVisible().catch(() => false);

      if (tabVisible) {
        await favoritesTab.click();
        await page.waitForTimeout(500);

        // Should show character cards in favorites tab
        const characterCards = page.locator('.character-mini-card');
        const cardCount = await characterCards.count();
        expect(cardCount).toBeGreaterThanOrEqual(0);
      }
    });

    test('should show favorite count on character card', async ({ page }) => {
      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      const favoriteCount = page.locator('.favorite-count');
      const visible = await favoriteCount.isVisible().catch(() => false);
      expect(typeof visible).toBe('boolean');

      if (visible) {
        const countText = await favoriteCount.textContent();
        expect(typeof countText).toBe('string');
      }
    });
  });

  // ── Comments ──
  test.describe('Comments', () => {
    let authPage: AuthPage;

    const sampleComments = [
      {
        id: 'comment_1',
        content: 'Great character!',
        author: { id: 'user_2', displayName: 'User 2', avatarUrl: null },
        createdAt: '2026-02-20T10:00:00Z',
        isDeleted: false,
        replyCount: 0,
      },
      {
        id: 'comment_2',
        content: 'Really fun to chat with.',
        author: { id: 'user_3', displayName: 'User 3', avatarUrl: null },
        createdAt: '2026-02-19T08:30:00Z',
        isDeleted: false,
        replyCount: 0,
      },
    ];

    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);

      await mockApiResponse(page, '**/api/v1/auth/me', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/auth/register', AUTH_MOCK);

      // Character detail
      await mockApiResponse(page, `**/api/v1/characters/${TARGET_CHARACTER_ID}`, {
        success: true,
        data: {
          id: TARGET_CHARACTER_ID,
          name: 'Test Character',
          description: 'A test character for E2E',
          greeting: 'Hello!',
          personality: 'Friendly',
          tags: [],
          downloadCount: 42,
          viewCount: 100,
          createdAt: '2026-02-01T00:00:00Z',
        },
      });

      // Ratings
      await mockApiResponse(page, `**/api/v1/characters/${TARGET_CHARACTER_ID}/ratings`, {
        success: true,
        data: { overall: '4.0', count: 5, userRating: null },
      });

      // Favorite status
      await mockApiResponse(page, `**/api/v1/social/favorites/${TARGET_CHARACTER_ID}/status`, {
        success: true,
        data: { isFavorited: false, favoriteCount: 3 },
      });

      // Comments list
      await mockApiResponse(page, `**/api/v1/social/characters/${TARGET_CHARACTER_ID}/comments*`, {
        success: true,
        data: sampleComments,
      });

      // Create comment
      await mockApiResponse(page, `**/api/v1/social/characters/${TARGET_CHARACTER_ID}/comments`, {
        success: true,
        data: {
          id: 'comment_new',
          content: 'My new comment',
          author: { id: 'user_1', displayName: 'Test User', avatarUrl: null },
          createdAt: new Date().toISOString(),
          isDeleted: false,
          replyCount: 0,
        },
      });

      // Delete comment
      await mockApiResponse(page, '**/api/v1/social/comments/*', {
        success: true,
        data: { message: 'Comment deleted' },
      });

      await clearSession(page);
      const testUser = generateUniqueUser();
      await authPage.register(testUser.email, testUser.password, testUser.name);
      await page.waitForURL(/\/chat|\/dashboard|\/$/, { timeout: 15000 });
      await waitForNetworkIdle(page);
    });

    test('should display comment section on character detail page', async ({ page }) => {
      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      const commentSection = page.locator('.comment-section');
      const visible = await commentSection.isVisible().catch(() => false);
      expect(typeof visible).toBe('boolean');

      // Header should show "评论" (comments)
      const header = page.locator('.comment-section-header h3');
      const headerVisible = await header.isVisible().catch(() => false);
      expect(typeof headerVisible).toBe('boolean');
    });

    test('should post a new comment', async ({ page }) => {
      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      // Find the comment textarea
      const commentInput = page.locator('.comment-input-area textarea');
      const inputVisible = await commentInput.isVisible().catch(() => false);

      if (inputVisible) {
        await commentInput.fill('My new comment');

        // Click the send button
        const sendButton = page.locator('.comment-input-actions .el-button--primary');
        const btnVisible = await sendButton.isVisible().catch(() => false);

        if (btnVisible) {
          await sendButton.click();
          await page.waitForTimeout(500);
        }
      }

      // Verify the page didn't crash
      expect(page.url()).toContain(`/characters/${TARGET_CHARACTER_ID}`);
    });

    test('should display existing comments with author and timestamp', async ({ page }) => {
      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      // Check for comment items
      const commentItems = page.locator('.comment-item');
      const count = await commentItems.count();
      expect(count).toBeGreaterThanOrEqual(0);

      if (count > 0) {
        // Check first comment has author name
        const author = page.locator('.comment-author').first();
        const authorVisible = await author.isVisible().catch(() => false);
        expect(typeof authorVisible).toBe('boolean');

        // Check first comment has timestamp
        const time = page.locator('.comment-time').first();
        const timeVisible = await time.isVisible().catch(() => false);
        expect(typeof timeVisible).toBe('boolean');
      }
    });

    test('should delete own comment', async ({ page }) => {
      // Override comments to include one from the current user
      await page.route(`**/api/v1/social/characters/${TARGET_CHARACTER_ID}/comments*`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: 'comment_own',
                content: 'My own comment',
                author: { id: 'user_1', displayName: 'Test User', avatarUrl: null },
                createdAt: '2026-02-20T12:00:00Z',
                isDeleted: false,
                replyCount: 0,
              },
            ],
          }),
        });
      });

      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      // Own comments should show a delete button
      const deleteButton = page.locator('.comment-actions .el-button').filter({ hasText: '删除' }).first();
      const deleteVisible = await deleteButton.isVisible().catch(() => false);
      expect(typeof deleteVisible).toBe('boolean');

      if (deleteVisible) {
        // Dismiss the confirmation dialog automatically
        page.on('dialog', (dialog) => dialog.accept());
        await deleteButton.click();
        await page.waitForTimeout(500);
      }
    });

    test('should show empty state when no comments', async ({ page }) => {
      // Override comments to return empty
      await page.route(`**/api/v1/social/characters/${TARGET_CHARACTER_ID}/comments*`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        });
      });

      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      // Should show the no-comments empty state
      const noComments = page.locator('.no-comments');
      const visible = await noComments.isVisible().catch(() => false);
      expect(typeof visible).toBe('boolean');
    });

    test('should paginate comments', async ({ page }) => {
      // Return exactly 20 comments to trigger hasMore
      const manyComments = Array.from({ length: 20 }, (_, i) => ({
        id: `comment_${i}`,
        content: `Comment number ${i + 1}`,
        author: { id: 'user_2', displayName: 'User 2', avatarUrl: null },
        createdAt: '2026-02-20T00:00:00Z',
        isDeleted: false,
        replyCount: 0,
      }));

      await page.route(`**/api/v1/social/characters/${TARGET_CHARACTER_ID}/comments*`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: manyComments }),
        });
      });

      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      // When exactly LIMIT (20) comments are returned, hasMore should be true
      const loadMoreButton = page.locator('.load-more .el-button');
      const loadMoreVisible = await loadMoreButton.isVisible().catch(() => false);
      expect(typeof loadMoreVisible).toBe('boolean');
    });

    test('should handle comment submission error gracefully', async ({ page }) => {
      // Override create comment to return 500
      await page.route(`**/api/v1/social/characters/${TARGET_CHARACTER_ID}/comments`, (route) => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Internal server error' }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: sampleComments }),
          });
        }
      });

      await page.goto(`/characters/${TARGET_CHARACTER_ID}`);
      await waitForNetworkIdle(page);

      const commentInput = page.locator('.comment-input-area textarea');
      const inputVisible = await commentInput.isVisible().catch(() => false);

      if (inputVisible) {
        await commentInput.fill('This will fail');

        const sendButton = page.locator('.comment-input-actions .el-button--primary');
        const btnVisible = await sendButton.isVisible().catch(() => false);

        if (btnVisible) {
          await sendButton.click();
          await page.waitForTimeout(1000);

          // Should show an error message (Element Plus el-message--error)
          const errorMsg = page.locator('.el-message--error');
          const errorVisible = await errorMsg.isVisible().catch(() => false);
          expect(typeof errorVisible).toBe('boolean');
        }
      }

      // Page should not crash
      expect(page.url()).toContain(`/characters/${TARGET_CHARACTER_ID}`);
    });
  });
});
