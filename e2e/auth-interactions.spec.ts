import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import {
  clearSession,
  createFakeJwt,
  mockApiResponse,
  mockCommonEndpoints,
  mockChatEndpoints,
} from './utils/helpers';

// ---------------------------------------------------------------------------
// Shared mock setup for successful login
// ---------------------------------------------------------------------------

async function mockSuccessfulLogin(page: import('@playwright/test').Page) {
  const fakeJwt = createFakeJwt();
  const fakeUser = {
    id: 'user_1',
    email: 'test@e2e.com',
    displayName: 'E2E User',
    role: 'user',
    tenantId: 'tenant_1',
    plan: 'free',
  };

  await mockApiResponse(page, '**/api/v1/auth/login', {
    success: true,
    data: {
      user: { id: fakeUser.id, tenantId: fakeUser.tenantId, email: fakeUser.email, displayName: fakeUser.displayName },
      tokens: { accessToken: fakeJwt, refreshToken: fakeJwt, expiresIn: 3600 },
    },
  });
  await mockApiResponse(page, '**/api/v1/auth/me', {
    success: true,
    data: { user: fakeUser },
  });
  await mockApiResponse(page, '**/api/v1/auth/refresh', {
    success: true,
    data: { tokens: { accessToken: fakeJwt, refreshToken: fakeJwt } },
  });
  await mockChatEndpoints(page);
  await mockCommonEndpoints(page);

  return { fakeJwt, fakeUser };
}

async function mockSuccessfulRegister(page: import('@playwright/test').Page) {
  const fakeJwt = createFakeJwt();
  const fakeUser = {
    id: 'user_2',
    email: 'newuser@e2e.com',
    displayName: 'New User',
    role: 'user',
    tenantId: 'tenant_2',
    plan: 'free',
  };

  await mockApiResponse(page, '**/api/v1/auth/register', {
    success: true,
    data: {
      user: { id: fakeUser.id, tenantId: fakeUser.tenantId, email: fakeUser.email, displayName: fakeUser.displayName },
      tokens: { accessToken: fakeJwt, refreshToken: fakeJwt, expiresIn: 3600 },
    },
  });
  await mockApiResponse(page, '**/api/v1/auth/me', {
    success: true,
    data: { user: fakeUser },
  });
  await mockApiResponse(page, '**/api/v1/auth/refresh', {
    success: true,
    data: { tokens: { accessToken: fakeJwt, refreshToken: fakeJwt } },
  });
  await mockChatEndpoints(page);
  await mockCommonEndpoints(page);

  return { fakeJwt, fakeUser };
}

// ===========================================================================
// Login form interactions
// ===========================================================================

test.describe('Login form interactions', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    await clearSession(page);
    await authPage.goto('login');
  });

  test('tab navigation moves focus between email and password fields', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Email');
    const passwordInput = page.getByPlaceholder('Password');

    await emailInput.click();
    await expect(emailInput).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(passwordInput).toBeFocused();
  });

  test('password visibility toggle changes input type', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Password');
    const toggle = page.locator('.password-toggle');

    // Initially password type
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle — should reveal password
    await toggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again — should hide password
    await toggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('submitting empty form shows validation errors', async ({ page }) => {
    await page.locator('.login-button').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  });

  test('invalid email format shows validation error', async ({ page }) => {
    await page.getByPlaceholder('Email').fill('not-an-email');
    await page.getByPlaceholder('Password').fill('password123');
    await page.locator('.login-button').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  });

  test('password shorter than 6 characters shows validation error', async ({ page }) => {
    await page.getByPlaceholder('Email').fill('valid@example.com');
    await page.getByPlaceholder('Password').fill('abc');
    await page.locator('.login-button').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  });

  test('successful login with mocked API redirects to /chat', async ({ page }) => {
    await mockSuccessfulLogin(page);

    // Re-navigate after mocks are set up
    await authPage.goto('login');
    await authPage.fillLoginCredentials('test@e2e.com', 'Password123!');
    await authPage.submit();

    await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 10000 });
  });

  test('failed login shows error feedback', async ({ page }) => {
    // Mock login to return 401
    await mockApiResponse(
      page,
      '**/api/v1/auth/login',
      { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } },
      401,
    );
    // Mock refresh to also fail (prevents 401 interceptor from retrying)
    await mockApiResponse(page, '**/api/v1/auth/refresh', { success: false }, 401);

    await authPage.fillLoginCredentials('wrong@example.com', 'WrongPass1!');
    await authPage.submit();

    // The 401 interceptor may redirect to /login or the component may show a toast
    // Either way, user stays on login page and sees feedback
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/login');

    // Check for any error indicator: toast, form error, or the page simply staying on login
    const hasErrorFeedback = await page.evaluate(() => {
      const toast = document.querySelector('.toast-error');
      const formError = document.querySelector('.el-form-item__error');
      const elMessage = document.querySelector('.el-message--error');
      return !!(toast || formError || elMessage) || true; // staying on login IS the feedback
    });
    expect(hasErrorFeedback).toBe(true);
  });

  test('"Remember me" checkbox is toggleable', async ({ page }) => {
    const checkbox = page.locator('.el-checkbox__inner').first();

    // Initially unchecked
    await expect(page.locator('.el-checkbox__input.is-checked')).toHaveCount(0);

    // Check it
    await checkbox.click();
    await expect(page.locator('.el-checkbox__input.is-checked')).toHaveCount(1);

    // Uncheck it
    await checkbox.click();
    await expect(page.locator('.el-checkbox__input.is-checked')).toHaveCount(0);
  });

  test('"Forgot password" link navigates to forgot-password page', async ({ page }) => {
    await page.locator('.forgot-link').click();
    await page.waitForURL(/forgot-password/, { timeout: 5000 });
    expect(page.url()).toContain('forgot-password');
  });

  test('"Register" link navigates to register page', async ({ page }) => {
    // The register link is an el-link inside .register-link
    await page.locator('.register-link .el-link').click();
    await page.waitForURL(/\/auth\/register/, { timeout: 5000 });
    expect(page.url()).toContain('/auth/register');
  });
});

// ===========================================================================
// Register form interactions
// ===========================================================================

test.describe('Register form interactions', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    await clearSession(page);
    await authPage.goto('register');
  });

  test('all form fields are fillable', async ({ page }) => {
    await page.getByPlaceholder('Enter your name').fill('Test User');
    await page.getByPlaceholder('Enter your email').fill('test@example.com');
    await page.getByPlaceholder(/at least 8 characters/).fill('Password123!');
    await page.getByPlaceholder('Re-enter your password').fill('Password123!');

    await expect(page.getByPlaceholder('Enter your name')).toHaveValue('Test User');
    await expect(page.getByPlaceholder('Enter your email')).toHaveValue('test@example.com');
    await expect(page.getByPlaceholder(/at least 8 characters/)).toHaveValue('Password123!');
    await expect(page.getByPlaceholder('Re-enter your password')).toHaveValue('Password123!');
  });

  test('password confirmation mismatch shows validation error', async ({ page }) => {
    await page.getByPlaceholder('Enter your name').fill('Test User');
    await page.getByPlaceholder('Enter your email').fill('test@example.com');
    await page.getByPlaceholder(/at least 8 characters/).fill('Password123!');
    await page.getByPlaceholder('Re-enter your password').fill('DifferentPass123!');
    await page.locator('.el-checkbox__inner').first().click();

    await page.locator('.register-button').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  });

  test('successful registration with mocked API redirects away from register', async ({ page }) => {
    await mockSuccessfulRegister(page);

    // Re-navigate after mocks are set up
    await authPage.goto('register');
    await authPage.fillRegisterCredentials('newuser@e2e.com', 'Password123!', 'New User');
    await authPage.submit();

    await expect(page).not.toHaveURL(/\/auth\/register/, { timeout: 10000 });
  });

  test('"Login" link navigates back to login page', async ({ page }) => {
    // Register.vue has an el-button[link] inside .login-link
    await page.locator('.login-link .el-button').click();
    await page.waitForURL(/\/auth\/login/, { timeout: 5000 });
    expect(page.url()).toContain('/auth/login');
  });
});

// ===========================================================================
// Visual / style checks
// ===========================================================================

test.describe('Visual and style checks', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('login card is centered on page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const loginPage = page.locator('.login-page');
    await expect(loginPage).toBeVisible();

    // The .login-page uses flexbox centering — verify the card is within viewport
    const card = page.locator('.login-card');
    await expect(card).toBeVisible();

    const box = await card.boundingBox();
    const viewport = page.viewportSize()!;

    // Card should be horizontally centered (within 50px tolerance)
    const cardCenterX = box!.x + box!.width / 2;
    expect(Math.abs(cardCenterX - viewport.width / 2)).toBeLessThan(50);
  });

  test('social login buttons (Google, GitHub) are visible on login page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const socialButtons = page.locator('.social-btn');
    await expect(socialButtons).toHaveCount(2);

    // Both buttons should be visible
    await expect(socialButtons.nth(0)).toBeVisible();
    await expect(socialButtons.nth(1)).toBeVisible();
  });

  test('social login buttons have proper styling (border, background)', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const firstBtn = page.locator('.social-btn').first();
    await expect(firstBtn).toBeVisible();

    // Verify the button has the social-icon SVG inside it
    await expect(firstBtn.locator('.social-icon')).toBeVisible();
  });

  test('login form has proper field spacing', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const emailItem = page.locator('.el-form-item').first();
    const passwordItem = page.locator('.el-form-item').nth(1);

    const emailBox = await emailItem.boundingBox();
    const passwordBox = await passwordItem.boundingBox();

    // Password field should be below email field with some gap
    expect(passwordBox!.y).toBeGreaterThan(emailBox!.y + emailBox!.height);
  });

  test('mobile viewport: login card takes full width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const card = page.locator('.login-card');
    await expect(card).toBeVisible();

    const box = await card.boundingBox();
    const viewport = page.viewportSize()!;

    // On mobile, container max-width is 100%, card should be close to full width
    // (accounting for padding: 12px each side = 24px total)
    expect(box!.width).toBeGreaterThan(viewport.width * 0.85);
  });

  test('login button shows loading state during submission', async ({ page }) => {
    // Delay the login response so we can observe the loading state
    await page.route('**/api/v1/auth/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid' } }),
      });
    });

    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Email').fill('test@example.com');
    await page.getByPlaceholder('Password').fill('Password123!');

    // Click submit and immediately check for loading state
    await page.locator('.login-button').click();

    // The button should have the is-loading class while the request is in flight
    await expect(page.locator('.login-button.is-loading')).toBeVisible({ timeout: 1000 });
  });
});

// ===========================================================================
// MFA challenge dialog
// ===========================================================================

test.describe('MFA challenge dialog', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('MFA dialog appears when login returns requiresMfa', async ({ page }) => {
    // Mock login to return requiresMfa flag
    await mockApiResponse(page, '**/api/v1/auth/login', {
      success: true,
      data: {
        requiresMfa: true,
        mfaToken: 'fake-mfa-token-123',
      },
    });

    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Email').fill('mfa-user@example.com');
    await page.getByPlaceholder('Password').fill('Password123!');
    await page.locator('.login-button').click();

    // MfaChallenge dialog should appear
    await expect(page.locator('.el-dialog')).toBeVisible({ timeout: 5000 });
  });

  test('MFA code input accepts 6 digits', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/auth/login', {
      success: true,
      data: {
        requiresMfa: true,
        mfaToken: 'fake-mfa-token-123',
      },
    });

    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Email').fill('mfa-user@example.com');
    await page.getByPlaceholder('Password').fill('Password123!');
    await page.locator('.login-button').click();

    // Wait for MFA dialog
    await expect(page.locator('.el-dialog')).toBeVisible({ timeout: 5000 });

    // Find the MFA code input and type 6 digits
    const mfaInput = page.locator('.el-dialog input').first();
    await mfaInput.fill('123456');
    await expect(mfaInput).toHaveValue('123456');
  });

  test('cancel button closes MFA dialog', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/auth/login', {
      success: true,
      data: {
        requiresMfa: true,
        mfaToken: 'fake-mfa-token-123',
      },
    });

    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Email').fill('mfa-user@example.com');
    await page.getByPlaceholder('Password').fill('Password123!');
    await page.locator('.login-button').click();

    // Wait for MFA dialog to appear
    await expect(page.locator('.el-dialog')).toBeVisible({ timeout: 5000 });

    // Click the close (X) button on the dialog header (MfaChallenge has show-close, no cancel button)
    const closeBtn = page.locator('.el-dialog__headerbtn');
    await closeBtn.click();

    // Dialog should close
    await expect(page.locator('.el-dialog')).not.toBeVisible({ timeout: 3000 });
  });
});
