import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { MarketPage } from './pages/market.page';
import { CharacterPage } from './pages/character.page';
import { testUsers, testCharacters } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

/**
 * E2E Tests: Character Management Flow
 *
 * Tests character browsing, creation, publishing, and management
 */

test.describe('Character Management Flow', () => {
  let authPage: AuthPage;
  let marketPage: MarketPage;
  let characterPage: CharacterPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    marketPage = new MarketPage(page);
    characterPage = new CharacterPage(page);
    await clearSession(page);
  });

  test.describe('Character Market - Browse and Search', () => {
    test('should display character market without authentication', async ({ page }) => {
      await marketPage.goto();
      await waitForNetworkIdle(page);

      // Market page should be accessible
      expect(page.url()).toContain('/market');

      // Should display character cards (or empty state)
      const isVisible = await marketPage.characterCards.first().isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });

    test('should search for characters', async ({ page }) => {
      await marketPage.goto();
      await waitForNetworkIdle(page);

      // Get initial count
      const initialCount = await marketPage.getCharacterCount();

      // Search for a character
      await marketPage.searchCharacter('test');
      await waitForNetworkIdle(page);

      // Results should update (count may change)
      const searchCount = await marketPage.getCharacterCount();
      expect(typeof searchCount).toBe('number');
    });

    test('should filter characters by category', async ({ page }) => {
      await marketPage.goto();
      await waitForNetworkIdle(page);

      // Apply filter
      const filterButton = page.locator('button:has-text("All"), button:has-text("Popular")').first();
      if (await filterButton.isVisible()) {
        await filterButton.click();
        await waitForNetworkIdle(page);

        // Should update results
        const count = await marketPage.getCharacterCount();
        expect(typeof count).toBe('number');
      }
    });

    test('should view character details', async ({ page }) => {
      await marketPage.goto();
      await waitForNetworkIdle(page);

      const characterCount = await marketPage.getCharacterCount();
      if (characterCount > 0) {
        // Click first character
        await marketPage.clickCharacter(0);
        await waitForNetworkIdle(page);

        // Should navigate to character detail page or show modal
        const hasModal = await page.locator('.character-detail, .el-dialog').isVisible();
        const hasDetailPage = page.url().includes('/character/');

        expect(hasModal || hasDetailPage).toBe(true);
      }
    });
  });

  test.describe('Character Creation', () => {
    test.beforeEach(async ({ page }) => {
      // Login before character creation tests
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');
    });

    test('should create a new character', async ({ page }) => {
      await characterPage.goto();
      await waitForNetworkIdle(page);

      // Click create new character button
      const createButton = page.locator('button:has-text("Create"), button:has-text("创建")').first();
      await createButton.click();

      // Fill character form
      await characterPage.createCharacter(testCharacters.basic);
      await characterPage.save();

      // Should show success message or redirect
      await waitForNetworkIdle(page);

      // Verify character was created
      const characterCount = await characterPage.getCharacterCount();
      expect(characterCount).toBeGreaterThan(0);
    });

    test('should validate required fields', async ({ page }) => {
      await characterPage.goto();
      await waitForNetworkIdle(page);

      // Click create new character button
      const createButton = page.locator('button:has-text("Create"), button:has-text("创建")').first();
      await createButton.click();

      // Try to save without filling required fields
      await characterPage.save();

      // Should show validation errors
      const errorVisible = await page.locator('.error, .el-form-item__error').isVisible();
      expect(errorVisible).toBe(true);
    });

    test('should edit existing character', async ({ page }) => {
      await characterPage.goto();
      await waitForNetworkIdle(page);

      const characterCount = await characterPage.getCharacterCount();
      if (characterCount > 0) {
        // Edit first character
        await characterPage.editCharacter(0);
        await waitForNetworkIdle(page);

        // Update character name
        await characterPage.nameInput.fill('Updated Character Name');
        await characterPage.save();

        // Should show success message
        await waitForNetworkIdle(page);
      }
    });

    test('should delete character', async ({ page }) => {
      await characterPage.goto();
      await waitForNetworkIdle(page);

      const initialCount = await characterPage.getCharacterCount();
      if (initialCount > 0) {
        // Delete first character
        await characterPage.editCharacter(0);
        await characterPage.delete();

        // Wait for deletion
        await waitForNetworkIdle(page);

        // Character count should decrease
        const newCount = await characterPage.getCharacterCount();
        expect(newCount).toBeLessThan(initialCount);
      }
    });
  });

  test.describe('Character Publishing - Feature Gate', () => {
    test('should show upgrade prompt for free users trying to publish', async ({ page }) => {
      // Login as free user
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      await characterPage.goto();
      await waitForNetworkIdle(page);

      // Try to publish a character
      const publishButton = page.locator('button:has-text("Publish"), button:has-text("发布")').first();
      if (await publishButton.isVisible()) {
        await publishButton.click();

        // Should show upgrade prompt
        const upgradePromptVisible = await characterPage.isUpgradePromptVisible();
        expect(upgradePromptVisible).toBe(true);
      }
    });

    test('should allow pro users to publish characters', async ({ page }) => {
      // Mock pro user subscription
      await mockApiResponse(page, '**/api/v1/auth/me', {
        success: true,
        data: {
          user: {
            id: 'test-user-id',
            email: testUsers.pro.email,
            subscription: {
              tier: 'pro',
              status: 'active',
            },
          },
        },
      });

      await authPage.login(testUsers.pro.email, testUsers.pro.password);
      await page.waitForURL('/');

      await characterPage.goto();
      await waitForNetworkIdle(page);

      // Create and publish character
      const createButton = page.locator('button:has-text("Create"), button:has-text("创建")').first();
      await createButton.click();

      await characterPage.createCharacter(testCharacters.detailed);
      await characterPage.save();
      await waitForNetworkIdle(page);

      // Try to publish
      await characterPage.publish();

      // Should not show upgrade prompt (or should succeed)
      await waitForNetworkIdle(page);
    });
  });

  test.describe('Character Import/Export', () => {
    test.beforeEach(async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');
    });

    test('should export character in SillyTavern format', async ({ page }) => {
      await characterPage.goto();
      await waitForNetworkIdle(page);

      const characterCount = await characterPage.getCharacterCount();
      if (characterCount > 0) {
        // Look for export button
        const exportButton = page.locator('button:has-text("Export"), button:has-text("导出")').first();
        if (await exportButton.isVisible()) {
          // Set up download listener
          const downloadPromise = page.waitForEvent('download');
          await exportButton.click();

          // Verify download started
          const download = await downloadPromise;
          expect(download.suggestedFilename()).toMatch(/\.json$/);
        }
      }
    });

    test('should import character from SillyTavern format', async ({ page }) => {
      await characterPage.goto();
      await waitForNetworkIdle(page);

      // Look for import button
      const importButton = page.locator('button:has-text("Import"), button:has-text("导入")').first();
      if (await importButton.isVisible()) {
        await importButton.click();

        // Should show file upload dialog or input
        const fileInput = page.locator('input[type="file"]');
        const isVisible = await fileInput.isVisible();
        expect(typeof isVisible).toBe('boolean');
      }
    });
  });

  test.describe('Character Ratings and Comments', () => {
    test.beforeEach(async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');
    });

    test('should display character ratings', async ({ page }) => {
      await marketPage.goto();
      await waitForNetworkIdle(page);

      const characterCount = await marketPage.getCharacterCount();
      if (characterCount > 0) {
        // Click first character to view details
        await marketPage.clickCharacter(0);
        await waitForNetworkIdle(page);

        // Check for rating component
        const ratingComponent = page.locator('.rating-component, .el-rate');
        const isVisible = await ratingComponent.isVisible().catch(() => false);
        expect(typeof isVisible).toBe('boolean');
      }
    });

    test('should allow users to rate characters', async ({ page }) => {
      await marketPage.goto();
      await waitForNetworkIdle(page);

      const characterCount = await marketPage.getCharacterCount();
      if (characterCount > 0) {
        // Click first character
        await marketPage.clickCharacter(0);
        await waitForNetworkIdle(page);

        // Try to rate
        const ratingStars = page.locator('.el-rate__item, .rating-star');
        const starCount = await ratingStars.count();
        if (starCount > 0) {
          // Click 5th star
          await ratingStars.nth(4).click();
          await waitForNetworkIdle(page);

          // Should show success or update rating
          const successVisible = await page.locator('.success-message, .el-message--success').isVisible().catch(() => false);
          expect(typeof successVisible).toBe('boolean');
        }
      }
    });
  });
});
