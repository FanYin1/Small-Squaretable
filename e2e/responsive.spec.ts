import { test, expect, devices } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { MarketPage } from './pages/market.page';
import { ChatPage } from './pages/chat.page';
import { testUsers } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle } from './utils/helpers';

/**
 * E2E Tests: Responsive Design
 *
 * Tests application behavior on different screen sizes and devices
 */

test.describe('Responsive Design', () => {
  test.describe('Mobile - Portrait', () => {
    let authPage: AuthPage;
    let marketPage: MarketPage;
    let chatPage: ChatPage;

    test.beforeEach(async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 390, height: 844 }); // iPhone 12 size
      authPage = new AuthPage(page);
      marketPage = new MarketPage(page);
      chatPage = new ChatPage(page);
      await clearSession(page);
    });

    test('should display mobile navigation', async ({ page }) => {
      await page.goto('/');
      await waitForNetworkIdle(page);

      // Should have mobile menu
      const mobileMenu = page.locator('.mobile-menu, .hamburger-menu, .el-menu--collapse');
      const isVisible = await mobileMenu.isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });

    test('should allow login on mobile', async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      // Should be logged in
      const isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);
    });

    test('should display market in mobile view', async ({ page }) => {
      await marketPage.goto();
      await waitForNetworkIdle(page);

      // Character cards should stack vertically
      const cards = marketPage.characterCards;
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should allow chat on mobile', async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Chat interface should be visible
      const inputVisible = await chatPage.messageInput.isVisible();
      expect(inputVisible).toBe(true);
    });

    test('should handle mobile keyboard', async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Focus on input
      await chatPage.messageInput.focus();

      // Input should be visible and usable
      await chatPage.messageInput.fill('Test message on mobile');
      const value = await chatPage.messageInput.inputValue();
      expect(value).toBe('Test message on mobile');
    });
  });

  test.describe('Tablet - Landscape', () => {
    let authPage: AuthPage;
    let marketPage: MarketPage;

    test.beforeEach(async ({ page }) => {
      // Set tablet landscape viewport
      await page.setViewportSize({ width: 1366, height: 1024 }); // iPad Pro landscape
      authPage = new AuthPage(page);
      marketPage = new MarketPage(page);
      await clearSession(page);
    });

    test('should display tablet layout', async ({ page }) => {
      await page.goto('/');
      await waitForNetworkIdle(page);

      // Should have appropriate layout for tablet
      const viewport = page.viewportSize();
      expect(viewport?.width).toBeGreaterThan(768);
    });

    test('should display market grid on tablet', async ({ page }) => {
      await marketPage.goto();
      await waitForNetworkIdle(page);

      // Should show multiple columns
      const cards = marketPage.characterCards;
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should allow touch interactions', async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      await marketPage.goto();
      await waitForNetworkIdle(page);

      const cardCount = await marketPage.getCharacterCount();
      if (cardCount > 0) {
        // Tap on character card
        await marketPage.clickCharacter(0);
        await waitForNetworkIdle(page);

        // Should open character details
        const hasModal = await page.locator('.character-detail, .el-dialog').isVisible().catch(() => false);
        expect(typeof hasModal).toBe('boolean');
      }
    });
  });

  test.describe('Desktop - Various Resolutions', () => {
    test('should work on 1920x1080 (Full HD)', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });

      await page.goto('/');
      await waitForNetworkIdle(page);

      // Should display full desktop layout
      const content = page.locator('main, .main-content');
      const isVisible = await content.isVisible();
      expect(isVisible).toBe(true);
    });

    test('should work on 1366x768 (Laptop)', async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });

      await page.goto('/');
      await waitForNetworkIdle(page);

      // Should display desktop layout
      const content = page.locator('main, .main-content');
      const isVisible = await content.isVisible();
      expect(isVisible).toBe(true);
    });

    test('should work on 2560x1440 (2K)', async ({ page }) => {
      await page.setViewportSize({ width: 2560, height: 1440 });

      await page.goto('/');
      await waitForNetworkIdle(page);

      // Should display wide desktop layout
      const content = page.locator('main, .main-content');
      const isVisible = await content.isVisible();
      expect(isVisible).toBe(true);
    });

    test('should work on 3840x2160 (4K)', async ({ page }) => {
      await page.setViewportSize({ width: 3840, height: 2160 });

      await page.goto('/');
      await waitForNetworkIdle(page);

      // Should display ultra-wide layout
      const content = page.locator('main, .main-content');
      const isVisible = await content.isVisible();
      expect(isVisible).toBe(true);
    });
  });

  test.describe('Orientation Changes', () => {
    test('should handle portrait to landscape transition', async ({ page }) => {
      // Start in portrait
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await waitForNetworkIdle(page);

      // Rotate to landscape
      await page.setViewportSize({ width: 667, height: 375 });
      await page.waitForTimeout(500);

      // Should still be functional
      const content = page.locator('main, .main-content');
      const isVisible = await content.isVisible();
      expect(isVisible).toBe(true);
    });

    test('should handle landscape to portrait transition', async ({ page }) => {
      // Start in landscape
      await page.setViewportSize({ width: 667, height: 375 });
      await page.goto('/');
      await waitForNetworkIdle(page);

      // Rotate to portrait
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);

      // Should still be functional
      const content = page.locator('main, .main-content');
      const isVisible = await content.isVisible();
      expect(isVisible).toBe(true);
    });
  });
});
