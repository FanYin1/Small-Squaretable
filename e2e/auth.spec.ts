import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { testUsers, invalidCredentials } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle } from './utils/helpers';

/**
 * E2E Tests: Authentication Flow
 *
 * Tests user registration, login, and logout flows
 */

test.describe('Authentication Flow', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    await clearSession(page);
  });

  test.describe('User Registration', () => {
    test('should register a new user successfully', async ({ page }) => {
      await authPage.register(testUsers.free.email, testUsers.free.password);

      // Wait for redirect to home page
      await page.waitForURL('/');
      await waitForNetworkIdle(page);

      // Verify user is logged in
      const isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);

      // Verify token is stored
      const token = await authPage.getToken();
      expect(token).toBeTruthy();
    });

    test('should show error for invalid email format', async ({ page }) => {
      await authPage.goto('register');
      await authPage.fillCredentials(invalidCredentials.invalidEmail.email, invalidCredentials.invalidEmail.password);
      await authPage.submit();

      // Should stay on registration page
      expect(page.url()).toContain('/auth/register');

      // Should show error message
      const errorVisible = await authPage.errorMessage.isVisible();
      expect(errorVisible).toBe(true);
    });

    test('should show error for short password', async ({ page }) => {
      await authPage.goto('register');
      await authPage.fillCredentials(invalidCredentials.shortPassword.email, invalidCredentials.shortPassword.password);
      await authPage.submit();

      // Should stay on registration page
      expect(page.url()).toContain('/auth/register');

      // Should show error message
      const errorVisible = await authPage.errorMessage.isVisible();
      expect(errorVisible).toBe(true);
    });

    test('should prevent duplicate registration', async ({ page }) => {
      // First registration
      await authPage.register(testUsers.existing.email, testUsers.existing.password);
      await page.waitForURL('/');

      // Logout
      await authPage.logout();
      await clearSession(page);

      // Try to register again with same email
      await authPage.goto('register');
      await authPage.fillCredentials(testUsers.existing.email, testUsers.existing.password);
      await authPage.submit();

      // Should show error
      const errorVisible = await authPage.errorMessage.isVisible();
      expect(errorVisible).toBe(true);
    });
  });

  test.describe('User Login', () => {
    test.beforeAll(async ({ browser }) => {
      // Create a test user for login tests
      const context = await browser.newContext();
      const page = await context.newPage();
      const auth = new AuthPage(page);

      try {
        await auth.register(testUsers.pro.email, testUsers.pro.password);
      } catch (error) {
        // User might already exist, ignore error
      }

      await context.close();
    });

    test('should login with valid credentials', async ({ page }) => {
      await authPage.login(testUsers.pro.email, testUsers.pro.password);

      // Wait for redirect to home page
      await page.waitForURL('/');
      await waitForNetworkIdle(page);

      // Verify user is logged in
      const isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await authPage.goto('login');
      await authPage.fillCredentials(testUsers.pro.email, invalidCredentials.wrongPassword.password);
      await authPage.submit();

      // Should stay on login page
      expect(page.url()).toContain('/auth/login');

      // Should show error message
      const errorVisible = await authPage.errorMessage.isVisible();
      expect(errorVisible).toBe(true);
    });

    test('should show error for non-existent user', async ({ page }) => {
      await authPage.goto('login');
      await authPage.fillCredentials('nonexistent@example.com', 'password123');
      await authPage.submit();

      // Should show error message
      const errorVisible = await authPage.errorMessage.isVisible();
      expect(errorVisible).toBe(true);
    });

    test('should redirect to login when accessing protected route', async ({ page }) => {
      // Try to access protected route without authentication
      await page.goto('/chat');

      // Should redirect to login
      await page.waitForURL('/auth/login');
      expect(page.url()).toContain('/auth/login');
    });
  });

  test.describe('User Logout', () => {
    test('should logout successfully', async ({ page }) => {
      // Login first
      await authPage.login(testUsers.pro.email, testUsers.pro.password);
      await page.waitForURL('/');

      // Logout
      await authPage.logout();
      await waitForNetworkIdle(page);

      // Verify user is logged out
      const isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(false);

      // Token should be removed
      const token = await authPage.getToken();
      expect(token).toBeNull();
    });

    test('should redirect to login after logout when accessing protected route', async ({ page }) => {
      // Login first
      await authPage.login(testUsers.pro.email, testUsers.pro.password);
      await page.waitForURL('/');

      // Logout
      await authPage.logout();

      // Try to access protected route
      await page.goto('/chat');

      // Should redirect to login
      await page.waitForURL('/auth/login');
      expect(page.url()).toContain('/auth/login');
    });
  });

  test.describe('Session Persistence', () => {
    test('should persist session after page reload', async ({ page }) => {
      // Login
      await authPage.login(testUsers.pro.email, testUsers.pro.password);
      await page.waitForURL('/');

      // Reload page
      await page.reload();
      await waitForNetworkIdle(page);

      // Should still be logged in
      const isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);
    });

    test('should maintain session across navigation', async ({ page }) => {
      // Login
      await authPage.login(testUsers.pro.email, testUsers.pro.password);
      await page.waitForURL('/');

      // Navigate to different pages
      await page.goto('/market');
      await waitForNetworkIdle(page);

      await page.goto('/subscription');
      await waitForNetworkIdle(page);

      // Should still be logged in
      const isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);
    });
  });
});
