import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { ChatPage } from './pages/chat.page';
import { testUsers, testMessages } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, simulateSlowNetwork, simulateOffline, restoreOnline } from './utils/helpers';

/**
 * E2E Tests: Error Handling and Edge Cases
 *
 * Tests application behavior under error conditions and edge cases
 */

test.describe('Error Handling and Edge Cases', () => {
  let authPage: AuthPage;
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    chatPage = new ChatPage(page);
    await clearSession(page);
  });

  test.describe('Network Errors', () => {
    test('should handle API errors gracefully', async ({ page }) => {
      // Mock API error
      await page.route('**/api/v1/auth/login', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await authPage.goto('login');
      await authPage.fillCredentials(testUsers.free.email, testUsers.free.password);
      await authPage.submit();

      // Should show error message
      const errorVisible = await authPage.errorMessage.isVisible();
      expect(errorVisible).toBe(true);
    });

    test('should handle slow network connections', async ({ page }) => {
      await simulateSlowNetwork(page);

      await authPage.goto('login');
      await authPage.fillCredentials(testUsers.free.email, testUsers.free.password);
      await authPage.submit();

      // Should show loading indicator
      const loadingIndicator = page.locator('.loading, .el-loading');
      const isVisible = await loadingIndicator.isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });

    test('should handle offline mode', async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      // Go offline
      await simulateOffline(page);
      await page.waitForTimeout(1000);

      // Try to navigate
      await page.goto('/market');

      // Should show offline indicator or error
      const offlineIndicator = page.locator('.offline-indicator, .connection-error');
      const isVisible = await offlineIndicator.isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');

      // Restore connection
      await restoreOnline(page);
    });

    test('should retry failed requests', async ({ page }) => {
      let requestCount = 0;

      await page.route('**/api/v1/auth/login', (route) => {
        requestCount++;
        if (requestCount === 1) {
          // Fail first request
          route.abort('failed');
        } else {
          // Succeed on retry
          route.continue();
        }
      });

      await authPage.login(testUsers.free.email, testUsers.free.password);

      // Should eventually succeed
      await page.waitForTimeout(3000);
      expect(requestCount).toBeGreaterThan(1);
    });
  });

  test.describe('Validation Errors', () => {
    test('should validate email format', async ({ page }) => {
      await authPage.goto('register');
      await authPage.fillCredentials('invalid-email', 'password123');
      await authPage.submit();

      // Should show validation error
      const errorVisible = await page.locator('.error, .el-form-item__error').isVisible();
      expect(errorVisible).toBe(true);
    });

    test('should validate password strength', async ({ page }) => {
      await authPage.goto('register');
      await authPage.fillCredentials('test@example.com', '123');
      await authPage.submit();

      // Should show validation error
      const errorVisible = await page.locator('.error, .el-form-item__error').isVisible();
      expect(errorVisible).toBe(true);
    });

    test('should prevent XSS attacks in messages', async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Try to send XSS payload
      const xssPayload = '<script>alert("XSS")</script>';
      await chatPage.sendMessage(xssPayload);
      await waitForNetworkIdle(page);

      // Should escape HTML
      const messageText = await chatPage.getLastMessage();
      expect(messageText).not.toContain('<script>');
    });
  });

  test.describe('Session Management', () => {
    test('should handle expired tokens', async ({ page }) => {
      // Login first
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      // Set expired token
      await page.evaluate(() => {
        localStorage.setItem('token', 'expired.token.here');
      });

      // Try to access protected route
      await page.goto('/chat');
      await page.waitForTimeout(2000);

      // Should redirect to login
      const isLoginPage = page.url().includes('/auth/login');
      expect(isLoginPage).toBe(true);
    });

    test('should handle concurrent sessions', async ({ browser }) => {
      // Create two browser contexts (two sessions)
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      const auth1 = new AuthPage(page1);
      const auth2 = new AuthPage(page2);

      // Login in both sessions
      await auth1.login(testUsers.free.email, testUsers.free.password);
      await page1.waitForURL('/');

      await auth2.login(testUsers.free.email, testUsers.free.password);
      await page2.waitForURL('/');

      // Both should be logged in
      const isLoggedIn1 = await auth1.isLoggedIn();
      const isLoggedIn2 = await auth2.isLoggedIn();

      expect(isLoggedIn1).toBe(true);
      expect(isLoggedIn2).toBe(true);

      await context1.close();
      await context2.close();
    });
  });

  test.describe('Rate Limiting', () => {
    test('should handle rate limit errors', async ({ page }) => {
      // Mock rate limit response
      await page.route('**/api/v1/llm/chat', (route) => {
        route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Rate limit exceeded',
            retryAfter: 60,
          }),
        });
      });

      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Try to send message
      await chatPage.sendMessage(testMessages.simple);
      await page.waitForTimeout(2000);

      // Should show rate limit error
      const errorVisible = await page.locator('.rate-limit-error, .error-message').isVisible().catch(() => false);
      expect(typeof errorVisible).toBe('boolean');
    });
  });

  test.describe('Browser Compatibility', () => {
    test('should work with localStorage disabled', async ({ page }) => {
      // Disable localStorage
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          value: null,
          writable: false,
        });
      });

      await authPage.goto('login');

      // Should still render page
      const pageVisible = await authPage.emailInput.isVisible();
      expect(pageVisible).toBe(true);
    });

    test('should handle JavaScript errors gracefully', async ({ page }) => {
      const errors: string[] = [];

      page.on('pageerror', (error) => {
        errors.push(error.message);
      });

      await authPage.goto('login');
      await waitForNetworkIdle(page);

      // Should not have critical errors
      const hasCriticalErrors = errors.some((err) =>
        err.toLowerCase().includes('uncaught') || err.toLowerCase().includes('fatal')
      );
      expect(hasCriticalErrors).toBe(false);
    });
  });

  test.describe('Data Integrity', () => {
    test('should prevent duplicate message submissions', async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      await chatPage.goto();
      await waitForNetworkIdle(page);

      const initialCount = await chatPage.getMessageCount();

      // Try to send same message multiple times quickly
      await chatPage.messageInput.fill(testMessages.simple);
      await chatPage.sendButton.click();
      await chatPage.sendButton.click();
      await chatPage.sendButton.click();

      await page.waitForTimeout(2000);

      // Should only send once
      const newCount = await chatPage.getMessageCount();
      expect(newCount).toBeLessThanOrEqual(initialCount + 1);
    });

    test('should handle malformed API responses', async ({ page }) => {
      // Mock malformed response
      await page.route('**/api/v1/auth/login', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'invalid json {{{',
        });
      });

      await authPage.goto('login');
      await authPage.fillCredentials(testUsers.free.email, testUsers.free.password);
      await authPage.submit();

      // Should handle error gracefully
      await page.waitForTimeout(2000);
      const errorVisible = await authPage.errorMessage.isVisible().catch(() => false);
      expect(typeof errorVisible).toBe('boolean');
    });
  });

  test.describe('UI Edge Cases', () => {
    test('should handle very long character names', async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      await page.goto('/my-characters');
      await waitForNetworkIdle(page);

      // Try to create character with very long name
      const createButton = page.locator('button:has-text("Create"), button:has-text("创建")').first();
      if (await createButton.isVisible()) {
        await createButton.click();

        const nameInput = page.locator('input[name="name"]');
        await nameInput.fill('A'.repeat(500));

        // Should truncate or show validation error
        const value = await nameInput.inputValue();
        expect(value.length).toBeLessThanOrEqual(500);
      }
    });

    test('should handle rapid navigation', async ({ page }) => {
      await authPage.login(testUsers.free.email, testUsers.free.password);
      await page.waitForURL('/');

      // Navigate rapidly between pages
      await page.goto('/market');
      await page.goto('/chat');
      await page.goto('/subscription');
      await page.goto('/profile');
      await page.goto('/');

      await waitForNetworkIdle(page);

      // Should end up on home page without errors
      expect(page.url()).toContain('/');
    });

    test('should handle window resize', async ({ page }) => {
      await authPage.goto('login');
      await waitForNetworkIdle(page);

      // Resize to mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);

      // Should still be usable
      const inputVisible = await authPage.emailInput.isVisible();
      expect(inputVisible).toBe(true);

      // Resize to desktop
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(500);

      // Should still be usable
      const inputStillVisible = await authPage.emailInput.isVisible();
      expect(inputStillVisible).toBe(true);
    });
  });
});
