import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import {
  clearSession,
  setupAuth,
  createFakeJwt,
  mockApiResponse,
} from './utils/helpers';

test.describe('Authentication', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    await clearSession(page);
  });

  // 1. Login page renders
  test('login page renders correctly', async ({ page }) => {
    await authPage.goto('login');

    await expect(page.locator('.login-page')).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.locator('.login-button')).toBeVisible();
  });

  // 2. Register page renders
  test('register page renders correctly', async ({ page }) => {
    await authPage.goto('register');

    await expect(page.locator('.register-page')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your name')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
    await expect(page.getByPlaceholder(/at least 8 characters/)).toBeVisible();
    await expect(page.getByPlaceholder('Re-enter your password')).toBeVisible();
    await expect(page.locator('.register-button')).toBeVisible();
  });

  // 3. Login with mocked API succeeds
  test('login with mocked API redirects away from login', async ({ page }) => {
    const fakeJwt = createFakeJwt();
    const fakeUser = {
      id: 'user_1',
      email: 'test@e2e.com',
      displayName: 'E2E User',
      role: 'user',
      tenantId: 'tenant_1',
      plan: 'free',
    };

    // Mock POST /auth/login
    await mockApiResponse(page, '**/api/v1/auth/login', {
      success: true,
      data: { token: fakeJwt, refreshToken: fakeJwt, user: fakeUser },
    });

    // Mock GET /auth/me so the app can initialize user state after login
    await mockApiResponse(page, '**/api/v1/auth/me', {
      success: true,
      data: { user: fakeUser },
    });

    // Mock /auth/refresh
    await mockApiResponse(page, '**/api/v1/auth/refresh', {
      success: true,
      data: { token: fakeJwt, refreshToken: fakeJwt },
    });

    await authPage.goto('login');
    await authPage.fillLoginCredentials('test@e2e.com', 'Password123!');
    await authPage.submit();

    // Should redirect away from login page
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });

  // 4. Register with mocked API succeeds
  test('register with mocked API redirects away from register', async ({ page }) => {
    const fakeJwt = createFakeJwt();
    const fakeUser = {
      id: 'user_2',
      email: 'newuser@e2e.com',
      displayName: 'New User',
      role: 'user',
      tenantId: 'tenant_2',
      plan: 'free',
    };

    // Mock POST /auth/register
    await mockApiResponse(page, '**/api/v1/auth/register', {
      success: true,
      data: { token: fakeJwt, refreshToken: fakeJwt, user: fakeUser },
    });

    // Mock GET /auth/me
    await mockApiResponse(page, '**/api/v1/auth/me', {
      success: true,
      data: { user: fakeUser },
    });

    // Mock /auth/refresh
    await mockApiResponse(page, '**/api/v1/auth/refresh', {
      success: true,
      data: { token: fakeJwt, refreshToken: fakeJwt },
    });

    await authPage.goto('register');
    await authPage.fillRegisterCredentials('newuser@e2e.com', 'Password123!', 'New User');
    await authPage.submit();

    // Should redirect away from register page
    await expect(page).not.toHaveURL(/\/auth\/register/);
  });

  // 5. Invalid email shows validation error
  test('invalid email shows validation error on register', async ({ page }) => {
    await authPage.goto('register');

    // Fill with invalid email, valid other fields
    await page.getByPlaceholder('Enter your name').fill('Test User');
    await page.getByPlaceholder('Enter your email').fill('not-an-email');
    await page.getByPlaceholder(/at least 8 characters/).fill('Password123!');
    await page.getByPlaceholder('Re-enter your password').fill('Password123!');
    await page.locator('.el-checkbox__inner').first().click();

    await page.locator('.register-button').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  });

  // 6. Short password shows validation error
  test('short password shows validation error on register', async ({ page }) => {
    await authPage.goto('register');

    await page.getByPlaceholder('Enter your name').fill('Test User');
    await page.getByPlaceholder('Enter your email').fill('valid@example.com');
    await page.getByPlaceholder(/at least 8 characters/).fill('123');
    await page.getByPlaceholder('Re-enter your password').fill('123');
    await page.locator('.el-checkbox__inner').first().click();

    await page.locator('.register-button').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  });

  // 7. Unauthenticated user is redirected to login
  test('unauthenticated user accessing /chat is redirected to login', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForURL(/\/auth\/login/, { timeout: 10000 });

    expect(page.url()).toContain('/auth/login');
  });

  // 8. Logout clears session
  test('logout clears token from localStorage', async ({ page }) => {
    // Set up authenticated state
    await setupAuth(page);

    // Mock endpoints the chat page needs
    await mockApiResponse(page, '**/api/v1/chats', { success: true, data: { chats: [] } });
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', {
      success: true,
      data: { count: 0 },
    });

    // Navigate to chat page as authenticated user
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Perform logout
    await authPage.logout();

    // Verify token is cleared
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });
});
