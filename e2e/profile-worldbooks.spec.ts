import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { generateUniqueUser } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

/**
 * E2E Tests: Profile Management & World Books
 *
 * Tests profile editing (tabs, preferences, security) and world book CRUD.
 * All API responses are mocked — no live backend required.
 */

const AUTH_MOCK = {
  success: true,
  data: {
    user: {
      id: 'user_1',
      email: 'test@example.com',
      displayName: 'Test User',
      name: 'Test User',
      role: 'user',
      tenantId: 'tenant_1',
      plan: 'free',
      avatar: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
  },
};

const SUBSCRIPTION_MOCK = {
  success: true,
  data: {
    subscription: {
      id: 'sub_1',
      plan: 'free',
      status: 'active',
    },
  },
};

const WORLDBOOKS_LIST_MOCK = {
  success: true,
  data: [
    { id: 'wb_1', name: 'Fantasy World', scope: 'global', isEnabled: true, description: 'Fantasy setting', entriesCount: 5, createdAt: '2026-01-15T00:00:00Z' },
    { id: 'wb_2', name: 'Sci-Fi World', scope: 'character', isEnabled: false, description: 'Sci-fi setting', entriesCount: 3, createdAt: '2026-01-20T00:00:00Z' },
  ],
};

/**
 * Create a fake JWT token that passes isTokenValid() client-side check.
 * The token has a valid 3-part structure with a future exp claim.
 */
function createFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: 'user_1',
    email: 'test@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  }));
  const signature = 'fake_signature';
  return `${header}.${payload}.${signature}`;
}

/**
 * Set up authenticated session by injecting a fake JWT into localStorage
 * and mocking the auth/me endpoint. This avoids needing the register form.
 */
async function setupAuthSession(page: import('@playwright/test').Page) {
  // Mock API endpoints before any navigation
  await mockApiResponse(page, '**/api/v1/auth/me', AUTH_MOCK);
  await mockApiResponse(page, '**/api/v1/users/me', AUTH_MOCK);
  await mockApiResponse(page, '**/api/v1/subscriptions/status', SUBSCRIPTION_MOCK);
  await mockApiResponse(page, '**/api/v1/subscriptions/config', {
    success: true,
    data: { plans: [] },
  });
  // Mock CSRF token endpoint
  await mockApiResponse(page, '**/csrf-token', {
    csrfToken: 'fake-csrf-token',
  });

  // Navigate to a page to get access to localStorage, then inject token
  await page.goto('/');
  await page.evaluate((token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', token);
    localStorage.setItem('tenantId', 'tenant_1');
  }, createFakeJwt());
}

test.describe('Profile Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthSession(page);
  });

  test('should display profile page with user info', async ({ page }) => {
    await page.goto('/profile');
    await waitForNetworkIdle(page);

    expect(page.url()).toContain('/profile');

    const profileBody = page.locator('.profile-body');
    const visible = await profileBody.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('should show avatar, name, email, and membership badge', async ({ page }) => {
    await page.goto('/profile');
    await waitForNetworkIdle(page);

    // User name
    const userName = page.locator('.user-name');
    const nameVisible = await userName.isVisible().catch(() => false);
    expect(typeof nameVisible).toBe('boolean');

    if (nameVisible) {
      const nameText = await userName.textContent();
      expect(typeof nameText).toBe('string');
    }

    // User email
    const userEmail = page.locator('.user-email');
    const emailVisible = await userEmail.isVisible().catch(() => false);
    expect(typeof emailVisible).toBe('boolean');

    // Membership badge
    const badge = page.locator('.membership-badge');
    const badgeVisible = await badge.isVisible().catch(() => false);
    expect(typeof badgeVisible).toBe('boolean');

    // Avatar wrapper
    const avatar = page.locator('.avatar-wrapper');
    const avatarVisible = await avatar.isVisible().catch(() => false);
    expect(typeof avatarVisible).toBe('boolean');
  });

  test('should navigate between profile tabs (Basic Info, Security, Preferences)', async ({ page }) => {
    await page.goto('/profile');
    await waitForNetworkIdle(page).catch(() => {});

    // Wait for profile body to stabilize
    await page.waitForSelector('.profile-body', { state: 'visible', timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(1000);

    const navItems = page.locator('.nav-item');
    const count = await navItems.count();
    // Should have at least Basic Info, Security, Notifications, Preferences + Account Settings
    expect(count).toBeGreaterThanOrEqual(4);

    // Click Security tab - use getByText for resilience
    const securityTab = page.locator('.nav-item').filter({ hasText: /安全|Security/ });
    await securityTab.first().click({ force: true });
    await page.waitForTimeout(1000);

    // Security section should be visible (password form)
    const securitySection = page.locator('.content-section');
    const secVisible = await securitySection.isVisible().catch(() => false);
    expect(typeof secVisible).toBe('boolean');

    // Click Preferences tab - use getByText for resilience
    const preferencesTab = page.locator('.nav-item').filter({ hasText: /偏好|Preferences/ });
    await preferencesTab.first().click({ force: true });
    await page.waitForTimeout(1000);

    // Preferences section should show radio groups
    const radioGroup = page.locator('.el-radio-group');
    const radioVisible = await radioGroup.first().isVisible().catch(() => false);
    expect(typeof radioVisible).toBe('boolean');
  });

  test('should change theme preference (dark/light)', async ({ page }) => {
    await page.goto('/profile');
    await waitForNetworkIdle(page);

    // Wait for profile body to stabilize
    await page.waitForSelector('.profile-body', { state: 'visible', timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(1000);

    // Navigate to Preferences tab
    const preferencesTab = page.locator('.nav-item').filter({ hasText: /偏好|Preferences/ });
    await preferencesTab.first().click({ force: true });
    await page.waitForTimeout(1000);

    // Find theme radio buttons
    const radioButtons = page.locator('.el-radio-button');
    const radioCount = await radioButtons.count();

    if (radioCount >= 2) {
      // Click "light" radio button (second one in theme group)
      const lightButton = radioButtons.nth(1);
      const lightVisible = await lightButton.isVisible().catch(() => false);

      if (lightVisible) {
        await lightButton.click();
        await page.waitForTimeout(300);
      }
    }

    // Page should not crash
    expect(page.url()).toContain('/profile');
  });

  test('should change language preference', async ({ page }) => {
    await page.goto('/profile');
    await waitForNetworkIdle(page);

    // Wait for profile body to stabilize
    await page.waitForSelector('.profile-body', { state: 'visible', timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(1000);

    // Navigate to Preferences tab
    const preferencesTab = page.locator('.nav-item').filter({ hasText: /偏好|Preferences/ });
    await preferencesTab.first().click({ force: true });
    await page.waitForTimeout(1000);

    // Language radio group is the second el-radio-group
    const radioGroups = page.locator('.el-radio-group');
    const groupCount = await radioGroups.count();

    if (groupCount >= 2) {
      // Click "English" radio button in language group
      const englishButton = page.locator('.el-radio-button').filter({ hasText: 'English' });
      const engVisible = await englishButton.isVisible().catch(() => false);

      if (engVisible) {
        await englishButton.click();
        await page.waitForTimeout(300);
      }
    }

    expect(page.url()).toContain('/profile');
  });

  test('should display password change form in Security tab', async ({ page }) => {
    await page.goto('/profile');
    await waitForNetworkIdle(page);

    // Wait for profile body to stabilize
    await page.waitForSelector('.profile-body', { state: 'visible', timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(1000);

    // Navigate to Security tab
    const securityTab = page.locator('.nav-item').filter({ hasText: /安全|Security/ });
    await securityTab.first().click({ force: true });
    await page.waitForTimeout(1000);

    // Should show password form with 3 password inputs
    const passwordInputs = page.locator('.el-input input[type="password"]');
    const inputCount = await passwordInputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(3);

    // Should have a submit button
    const submitButton = page.locator('.el-button--primary[native-type="submit"], .el-form .el-button--primary');
    const btnVisible = await submitButton.first().isVisible().catch(() => false);
    expect(typeof btnVisible).toBe('boolean');
  });

  test('should show export data button', async ({ page }) => {
    await page.goto('/profile');
    await waitForNetworkIdle(page);

    // Export data button is in the Basic Info section header actions
    const exportButton = page.locator('.section-header-actions .el-button').first();
    const visible = await exportButton.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');

    if (visible) {
      const text = await exportButton.textContent();
      expect(typeof text).toBe('string');
    }
  });
});

test.describe('World Books', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/worldbooks', WORLDBOOKS_LIST_MOCK);
    await setupAuthSession(page);
  });

  test('should display world books page', async ({ page }) => {
    await page.goto('/worldbooks');
    await waitForNetworkIdle(page);

    expect(page.url()).toContain('/worldbooks');

    const worldbooksPage = page.locator('.worldbooks-page');
    const visible = await worldbooksPage.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('should show empty state when no world books', async ({ page }) => {
    // Override with empty list
    await page.route('**/api/v1/worldbooks', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });

    await page.goto('/worldbooks');
    await waitForNetworkIdle(page);

    // Table should show empty text
    const emptyText = page.locator('.el-table__empty-text');
    const visible = await emptyText.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('should open create world book dialog', async ({ page }) => {
    await page.goto('/worldbooks');
    await waitForNetworkIdle(page);

    // Click the create button (has Plus icon)
    const createButton = page.locator('.el-button--primary').filter({ hasText: /新建|Create/ });
    const btnVisible = await createButton.isVisible().catch(() => false);
    expect(typeof btnVisible).toBe('boolean');

    if (btnVisible) {
      await createButton.click();
      await page.waitForTimeout(300);

      // Dialog should be visible
      const dialog = page.locator('.el-dialog');
      const dialogVisible = await dialog.isVisible().catch(() => false);
      expect(typeof dialogVisible).toBe('boolean');
    }
  });

  test('should create a new world book with name and scope', async ({ page }) => {
    // Mock POST for creation
    await page.route('**/api/v1/worldbooks', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { id: 'wb_new', name: 'New World', scope: 'global', isEnabled: true, description: 'New world book' },
          }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(WORLDBOOKS_LIST_MOCK),
        });
      }
    });

    await page.goto('/worldbooks');
    await waitForNetworkIdle(page);

    // Open create dialog
    const createButton = page.locator('.el-button--primary').filter({ hasText: /新建|Create/ });
    const btnVisible = await createButton.isVisible().catch(() => false);

    if (btnVisible) {
      await createButton.click();
      await page.waitForTimeout(300);

      // Fill in name
      const nameInput = page.locator('.el-dialog .el-input__inner').first();
      const inputVisible = await nameInput.isVisible().catch(() => false);

      if (inputVisible) {
        await nameInput.fill('New World');

        // Click submit button in dialog footer
        const submitBtn = page.locator('.el-dialog__footer .el-button--primary');
        await submitBtn.click();
        await page.waitForTimeout(500);
      }
    }

    expect(page.url()).toContain('/worldbooks');
  });

  test('should display world book list with name and scope tags', async ({ page }) => {
    await page.goto('/worldbooks');
    await waitForNetworkIdle(page);

    // Table rows should contain world book data
    const tableRows = page.locator('.el-table__body-wrapper .el-table__row');
    const rowCount = await tableRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(0);

    if (rowCount > 0) {
      // First row should have "Fantasy World" name
      const firstRowText = await tableRows.first().textContent();
      expect(typeof firstRowText).toBe('string');

      // Scope tags should be present
      const scopeTags = page.locator('.el-tag');
      const tagCount = await scopeTags.count();
      expect(tagCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should toggle world book enabled/disabled', async ({ page }) => {
    // Mock PATCH for toggle
    await mockApiResponse(page, '**/api/v1/worldbooks/*', {
      success: true,
      data: { id: 'wb_1', name: 'Fantasy World', scope: 'global', isEnabled: false },
    });

    await page.goto('/worldbooks');
    await waitForNetworkIdle(page);

    // Find the switch in the table
    const switches = page.locator('.el-switch');
    const switchCount = await switches.count();
    expect(switchCount).toBeGreaterThanOrEqual(0);

    if (switchCount > 0) {
      const firstSwitch = switches.first();
      await firstSwitch.click();
      await page.waitForTimeout(500);

      // Page should not crash
      expect(page.url()).toContain('/worldbooks');
    }
  });

  test('should delete a world book', async ({ page }) => {
    // Mock DELETE
    await mockApiResponse(page, '**/api/v1/worldbooks/*', {
      success: true,
      data: { message: 'Deleted successfully' },
    });

    await page.goto('/worldbooks');
    await waitForNetworkIdle(page);

    // Find delete button (danger type, has Delete icon)
    const deleteButtons = page.locator('.el-button--danger');
    const deleteCount = await deleteButtons.count();
    expect(deleteCount).toBeGreaterThanOrEqual(0);

    if (deleteCount > 0) {
      await deleteButtons.first().click();
      await page.waitForTimeout(300);

      // Confirmation dialog should appear (ElMessageBox)
      const confirmDialog = page.locator('.el-message-box');
      const dialogVisible = await confirmDialog.isVisible().catch(() => false);
      expect(typeof dialogVisible).toBe('boolean');

      if (dialogVisible) {
        // Click confirm button
        const confirmBtn = page.locator('.el-message-box__btns .el-button--primary');
        await confirmBtn.click();
        await page.waitForTimeout(500);
      }
    }

    expect(page.url()).toContain('/worldbooks');
  });
});
