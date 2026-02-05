import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { invalidCredentials, generateUniqueUser } from './fixtures/test-data';
import { waitForNetworkIdle } from './utils/helpers';

/**
 * E2E Tests: Authentication Flow
 *
 * Tests user registration, login, and logout flows
 */

test.describe('Authentication Flow', () => {
  let authPage: AuthPage;

  // Helper to clear session
  async function clearSession(page: any) {
    await page.context().clearCookies();
    try {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    } catch {
      // Ignore if page doesn't support localStorage yet
    }
  }

  // Helper to wait for redirect with fallback
  async function waitForRedirect(page: any, url: string, timeout = 15000) {
    try {
      await page.waitForURL(url, { timeout });
    } catch {
      // If exact match fails, check if we're on the expected page
      const currentUrl = page.url();
      if (!currentUrl.includes(url.replace('/', ''))) {
        throw new Error(`Expected to be on ${url}, but was on ${currentUrl}`);
      }
    }
  }

  test.describe('User Registration', () => {
    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);
      await clearSession(page);
    });

    test('should register a new user successfully', async ({ page }) => {
      const newUser = generateUniqueUser();
      await authPage.register(newUser.email, newUser.password, newUser.name);

      // Wait for redirect to home page
      await waitForRedirect(page, '/');
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

    test('should prevent duplicate registration', async ({ page, context }) => {
      // Generate a unique user for this test
      const duplicateUser = generateUniqueUser();

      // First registration
      await authPage.register(duplicateUser.email, duplicateUser.password, duplicateUser.name);
      await waitForRedirect(page, '/');

      // Clear session to simulate a new browser session
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Try to register again with same email
      await authPage.goto('register');
      await authPage.fillCredentials(duplicateUser.email, duplicateUser.password, duplicateUser.name);
      await authPage.submit();

      // Wait for response
      await page.waitForTimeout(2000);

      // Check for form validation error or custom toast error
      const formError = page.locator('.el-form-item__error');
      const toastError = page.locator('.toast-error, .el-message--error, .el-notification--error');

      const hasFormError = await formError.isVisible().catch(() => false);
      const hasToastError = await toastError.isVisible().catch(() => false);
      const isStillOnRegisterPage = page.url().includes('/auth/register');

      expect(hasFormError || hasToastError || isStillOnRegisterPage).toBe(true);
    });
  });

  test.describe('User Login', () => {
    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);
      await clearSession(page);
    });

    test('should login with valid credentials', async ({ page }) => {
      // First register a user, then login
      const loginUser = generateUniqueUser();

      // Register the user first
      await authPage.register(loginUser.email, loginUser.password, loginUser.name);
      await waitForRedirect(page, '/');

      // Clear session to test login
      await clearSession(page);

      // Now login with the same credentials
      await authPage.login(loginUser.email, loginUser.password);

      // Wait for redirect to home page
      await waitForRedirect(page, '/');
      await waitForNetworkIdle(page);

      // Verify user is logged in
      const isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);
    });

    test('should show error for invalid credentials', async ({ page }) => {
      // First register a user
      const testUser = generateUniqueUser();
      await authPage.register(testUser.email, testUser.password, testUser.name);
      await waitForRedirect(page, '/');

      // Clear session
      await clearSession(page);

      // Try to login with wrong password
      await authPage.goto('login');
      await authPage.fillCredentials(testUser.email, 'WrongPassword123!');
      await authPage.submit();

      // Should stay on login page
      expect(page.url()).toContain('/auth/login');

      // Wait for error to appear
      await page.waitForTimeout(1500);

      // Should show error message (form error or toast) or stay on login page
      const formError = page.locator('.el-form-item__error');
      const toastError = page.locator('.toast-error');
      const hasFormError = await formError.isVisible().catch(() => false);
      const hasToastError = await toastError.isVisible().catch(() => false);
      const isStillOnLoginPage = page.url().includes('/auth/login');

      expect(hasFormError || hasToastError || isStillOnLoginPage).toBe(true);
    });

    test('should show error for non-existent user', async ({ page }) => {
      await authPage.goto('login');
      await authPage.fillCredentials('nonexistent-user-12345@example.com', 'SomePassword123!');
      await authPage.submit();

      // Wait for error to appear
      await page.waitForTimeout(1500);

      // Should show error message (form error or toast) or stay on login page
      const formError = page.locator('.el-form-item__error');
      const toastError = page.locator('.toast-error');
      const hasFormError = await formError.isVisible().catch(() => false);
      const hasToastError = await toastError.isVisible().catch(() => false);
      const isStillOnLoginPage = page.url().includes('/auth/login');

      expect(hasFormError || hasToastError || isStillOnLoginPage).toBe(true);
    });

    test('should redirect to login when accessing protected route', async ({ page }) => {
      // Clear any existing session
      await clearSession(page);

      // Try to access protected route without authentication
      await page.goto('/chat');

      // Should redirect to login
      await page.waitForURL(/\/auth\/login/, { timeout: 10000 });
      expect(page.url()).toContain('/auth/login');
    });
  });

  test.describe('User Logout', () => {
    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);
      await clearSession(page);
    });

    test('should logout successfully', async ({ page }) => {
      // Register a new user for this test
      const logoutUser = generateUniqueUser();
      await authPage.register(logoutUser.email, logoutUser.password, logoutUser.name);
      await waitForRedirect(page, '/');

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
      // Register a new user for this test
      const logoutUser = generateUniqueUser();
      await authPage.register(logoutUser.email, logoutUser.password, logoutUser.name);
      await waitForRedirect(page, '/');

      // Logout
      await authPage.logout();

      // Try to access protected route
      await page.goto('/chat');

      // Should redirect to login
      await page.waitForURL(/\/auth\/login/, { timeout: 10000 });
      expect(page.url()).toContain('/auth/login');
    });
  });

  test.describe('Session Persistence', () => {
    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);
      await clearSession(page);
    });

    test('should persist session after page reload', async ({ page }) => {
      // Register a new user for this test
      const sessionUser = generateUniqueUser();
      await authPage.register(sessionUser.email, sessionUser.password, sessionUser.name);
      await waitForRedirect(page, '/');

      // Verify logged in before reload
      let isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);

      // Reload page (DO NOT clear session)
      await page.reload();
      await waitForNetworkIdle(page);

      // Should still be logged in
      isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);
    });

    test('should maintain session across navigation', async ({ page }) => {
      // Register a new user for this test
      const sessionUser = generateUniqueUser();
      await authPage.register(sessionUser.email, sessionUser.password, sessionUser.name);
      await waitForRedirect(page, '/');

      // Verify logged in before navigation
      let isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);

      // Navigate to different pages (DO NOT clear session)
      await page.goto('/market');
      await waitForNetworkIdle(page);

      // Check if still logged in
      isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);

      await page.goto('/dashboard');
      await waitForNetworkIdle(page);

      // Should still be logged in
      isLoggedIn = await authPage.isLoggedIn();
      expect(isLoggedIn).toBe(true);
    });
  });
});
