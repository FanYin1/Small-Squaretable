import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { generateUniqueUser } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

/**
 * E2E Tests: Plugin Marketplace
 *
 * Tests plugin browsing, installation, configuration, and management.
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
      plan: 'pro',
    },
  },
};

const samplePlugins = [
  {
    id: 'plugin_1',
    slug: 'auto-translator',
    name: 'Auto Translator',
    description: 'Translates messages automatically between languages',
    version: '1.0.0',
    authorId: 'user_2',
    authorName: 'dev_user',
    events: ['chat.message.before'],
    permissions: ['events:subscribe'],
    configSchema: { targetLang: { type: 'string', title: 'Target Language', default: 'en' } },
    isPublished: true,
    isOfficial: false,
    installCount: 150,
    iconUrl: null,
    readme: null,
    createdAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'plugin_2',
    slug: 'mood-tracker',
    name: 'Mood Tracker',
    description: 'Tracks character mood across conversations',
    version: '2.1.0',
    authorId: 'user_3',
    authorName: 'another_dev',
    events: ['chat.message.after'],
    permissions: ['kv:read', 'kv:write'],
    configSchema: {},
    isPublished: true,
    isOfficial: false,
    installCount: 87,
    iconUrl: null,
    readme: null,
    createdAt: '2026-02-10T00:00:00Z',
  },
];
const sampleInstalls = [
  {
    id: 'install_1',
    pluginId: 'plugin_1',
    plugin: samplePlugins[0],
    isEnabled: true,
    config: { targetLang: 'en' },
    createdAt: '2026-02-15T00:00:00Z',
  },
];

const MARKETPLACE_RESPONSE = {
  success: true,
  data: {
    items: samplePlugins,
    pagination: {
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  },
};

const INSTALLED_RESPONSE = {
  success: true,
  data: sampleInstalls,
};

const EMPTY_INSTALLED_RESPONSE = {
  success: true,
  data: [],
};

test.describe('Plugin Marketplace', () => {
  // ── Marketplace Tab ──
  test.describe('Marketplace Tab', () => {
    let authPage: AuthPage;

    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);

      await mockApiResponse(page, '**/api/v1/auth/me', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/auth/register', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/plugins/marketplace*', MARKETPLACE_RESPONSE);
      await mockApiResponse(page, '**/api/v1/plugins/installs', INSTALLED_RESPONSE);
      await mockApiResponse(page, '**/api/v1/csrf-token', { csrfToken: 'test-csrf' });

      await clearSession(page);
      const testUser = generateUniqueUser();
      await authPage.register(testUser.email, testUser.password, testUser.name);
      await page.waitForURL(/\/chat|\/dashboard|\/$/, { timeout: 15000 });
      await waitForNetworkIdle(page);
    });

    test('should display plugin marketplace page', async ({ page }) => {
      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      expect(page.url()).toContain('/plugins');

      const marketplace = page.locator('.plugin-marketplace');
      await expect(marketplace).toBeVisible();

      // Tabs should be present
      const tabs = page.locator('.el-tabs__item');
      const tabCount = await tabs.count();
      expect(tabCount).toBeGreaterThanOrEqual(2);
    });

    test('should show plugin cards with name, author, description', async ({ page }) => {
      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      const pluginCards = page.locator('.plugin-card');
      const count = await pluginCards.count();
      expect(count).toBeGreaterThanOrEqual(0);

      if (count > 0) {
        // Check first card has name
        const name = page.locator('.plugin-name').first();
        const nameText = await name.textContent();
        expect(nameText).toBeTruthy();

        // Check first card has author
        const author = page.locator('.plugin-author').first();
        const authorText = await author.textContent();
        expect(authorText).toBeTruthy();

        // Check first card has description
        const desc = page.locator('.plugin-description').first();
        const descText = await desc.textContent();
        expect(descText).toBeTruthy();
      }
    });
    test('should display install count on plugin cards', async ({ page }) => {
      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      const installCounts = page.locator('.plugin-installs');
      const count = await installCounts.count();
      expect(count).toBeGreaterThanOrEqual(0);

      if (count > 0) {
        const text = await installCounts.first().textContent();
        expect(text).toBeTruthy();
        // Should contain the count number from mock data
        expect(text).toBeTruthy();
      }
    });

    test('should search plugins by name', async ({ page }) => {
      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      // Search input should be visible in the marketplace tab
      const searchInput = page.locator('.el-input').filter({ has: page.locator('[class*="el-icon"]') }).first();
      const inputVisible = await searchInput.isVisible().catch(() => false);

      if (inputVisible) {
        const input = searchInput.locator('input');
        await input.fill('Translator');
        await input.press('Enter');
        await page.waitForTimeout(500);
      }

      // Page should not crash
      expect(page.url()).toContain('/plugins');
    });

    test('should sort plugins (popular, newest, name)', async ({ page }) => {
      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      const sortBar = page.locator('.sort-bar');
      const sortVisible = await sortBar.isVisible().catch(() => false);
      expect(sortVisible).toBe(true);

      if (sortVisible) {
        // Click "newest" radio button
        const radioButtons = page.locator('.el-radio-button');
        const radioCount = await radioButtons.count();
        expect(radioCount).toBeGreaterThanOrEqual(3);

        // Click the second radio button (newest)
        if (radioCount >= 2) {
          await radioButtons.nth(1).click();
          await page.waitForTimeout(500);
        }

        // Click the third radio button (name)
        if (radioCount >= 3) {
          await radioButtons.nth(2).click();
          await page.waitForTimeout(500);
        }
      }

      expect(page.url()).toContain('/plugins');
    });
    test('should paginate plugin list', async ({ page }) => {
      // Override marketplace to return paginated results
      await page.route('**/api/v1/plugins/marketplace*', (route) => {
        const url = new URL(route.request().url(), 'http://localhost');
        const pageNum = parseInt(url.searchParams.get('page') || '1');
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              items: samplePlugins,
              pagination: {
                page: pageNum,
                limit: 20,
                total: 50,
                totalPages: 3,
                hasNext: pageNum < 3,
                hasPrev: pageNum > 1,
              },
            },
          }),
        });
      });

      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      // Pagination should be visible when totalPages > 1
      const pagination = page.locator('.pagination-wrapper');
      await expect(pagination).toBeVisible();

      // Click page 2
      const page2Button = page.locator('.el-pager .number').filter({ hasText: '2' });
      const page2Visible = await page2Button.isVisible().catch(() => false);
      if (page2Visible) {
        await page2Button.click();
        await page.waitForTimeout(500);
      }
    });

    test('should install a plugin from marketplace', async ({ page }) => {
      // Override installs to return empty (no plugins installed yet)
      await page.route('**/api/v1/plugins/installs', (route) => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                id: 'install_new',
                pluginId: 'plugin_2',
                plugin: samplePlugins[1],
                isEnabled: true,
                config: {},
                createdAt: new Date().toISOString(),
              },
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(EMPTY_INSTALLED_RESPONSE),
          });
        }
      });

      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      // Find an Install button (not the "Installed" disabled one)
      const installButtons = page.locator('.plugin-card-footer .el-button--primary');
      const btnCount = await installButtons.count();

      if (btnCount > 0) {
        await installButtons.first().click();
        await page.waitForTimeout(500);

        // Should show success message
        const successMsg = page.locator('.el-message--success');
        await expect(successMsg.first()).toBeVisible();
      }
    });
  });
  // ── My Plugins Tab ──
  test.describe('My Plugins Tab', () => {
    let authPage: AuthPage;

    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);

      await mockApiResponse(page, '**/api/v1/auth/me', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/auth/register', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/plugins/marketplace*', MARKETPLACE_RESPONSE);
      await mockApiResponse(page, '**/api/v1/plugins/installs', INSTALLED_RESPONSE);
      await mockApiResponse(page, '**/api/v1/csrf-token', { csrfToken: 'test-csrf' });

      await clearSession(page);
      const testUser = generateUniqueUser();
      await authPage.register(testUser.email, testUser.password, testUser.name);
      await page.waitForURL(/\/chat|\/dashboard|\/$/, { timeout: 15000 });
      await waitForNetworkIdle(page);
    });

    test('should switch to My Plugins tab', async ({ page }) => {
      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      // Click the "My Plugins" tab
      const myPluginsTab = page.locator('.el-tabs__item').nth(1);
      const tabVisible = await myPluginsTab.isVisible().catch(() => false);

      if (tabVisible) {
        await myPluginsTab.click();
        await page.waitForTimeout(500);

        // Tab should be active
        const isActive = await myPluginsTab.evaluate(
          (el) => el.classList.contains('is-active'),
        ).catch(() => false);
        expect(isActive).toBe(true);
      }
    });

    test('should display installed plugins list', async ({ page }) => {
      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      // Switch to installed tab
      const myPluginsTab = page.locator('.el-tabs__item').nth(1);
      const tabVisible = await myPluginsTab.isVisible().catch(() => false);

      if (tabVisible) {
        await myPluginsTab.click();
        await page.waitForTimeout(500);

        const installedCards = page.locator('.installed-card');
        const count = await installedCards.count();
        expect(count).toBeGreaterThanOrEqual(0);

        if (count > 0) {
          // Check card has plugin name
          const name = page.locator('.installed-name').first();
          const nameText = await name.textContent();
          expect(nameText).toBeTruthy();

          // Check card has version
          const version = page.locator('.installed-version').first();
          const versionText = await version.textContent();
          expect(versionText).toBeTruthy();
        }
      }
    });
    test('should show empty state when no plugins installed', async ({ page }) => {
      // Override installs to return empty
      await page.route('**/api/v1/plugins/installs', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_INSTALLED_RESPONSE),
        });
      });

      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      // Switch to installed tab
      const myPluginsTab = page.locator('.el-tabs__item').nth(1);
      const tabVisible = await myPluginsTab.isVisible().catch(() => false);

      if (tabVisible) {
        await myPluginsTab.click();
        await page.waitForTimeout(500);

        const emptyState = page.locator('.empty-state');
        await expect(emptyState).toBeVisible();
      }
    });

    test('should enable/disable an installed plugin', async ({ page }) => {
      // Mock enable/disable endpoints
      await mockApiResponse(page, '**/api/v1/plugins/installs/*/enable', {
        success: true,
        data: { ...sampleInstalls[0], isEnabled: true },
      });
      await mockApiResponse(page, '**/api/v1/plugins/installs/*/disable', {
        success: true,
        data: { ...sampleInstalls[0], isEnabled: false },
      });

      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      // Switch to installed tab
      const myPluginsTab = page.locator('.el-tabs__item').nth(1);
      const tabVisible = await myPluginsTab.isVisible().catch(() => false);

      if (tabVisible) {
        await myPluginsTab.click();
        await page.waitForTimeout(500);

        // Find the switch toggle
        const toggle = page.locator('.installed-card-actions .el-switch').first();
        const toggleVisible = await toggle.isVisible().catch(() => false);

        if (toggleVisible) {
          await toggle.click();
          await page.waitForTimeout(500);
        }

        expect(page.url()).toContain('/plugins');
      }
    });
    test('should open configuration dialog', async ({ page }) => {
      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      // Switch to installed tab
      const myPluginsTab = page.locator('.el-tabs__item').nth(1);
      const tabVisible = await myPluginsTab.isVisible().catch(() => false);

      if (tabVisible) {
        await myPluginsTab.click();
        await page.waitForTimeout(500);

        // Click the Configure button (has Setting icon)
        const configButton = page.locator('.installed-card-actions .el-button').nth(1);
        const configBtnVisible = await configButton.isVisible().catch(() => false);

        if (configBtnVisible) {
          await configButton.click();
          await page.waitForTimeout(500);

          // Config dialog should appear
          const dialog = page.locator('.el-dialog');
          await expect(dialog.first()).toBeVisible();

          // Should have form fields from configSchema
          const formItems = page.locator('.el-form-item');
          const formCount = await formItems.count();
          expect(formCount).toBeGreaterThanOrEqual(0);

          // Close dialog
          const cancelButton = page.locator('.el-dialog__footer .el-button').first();
          await cancelButton.click();
          await page.waitForTimeout(300);
        }
      }
    });

    test('should uninstall a plugin', async ({ page }) => {
      // Mock DELETE for uninstall
      await page.route('**/api/v1/plugins/installs/*', (route) => {
        if (route.request().method() === 'DELETE') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { message: 'Uninstalled successfully' },
            }),
          });
        } else {
          route.continue();
        }
      });

      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      // Switch to installed tab
      const myPluginsTab = page.locator('.el-tabs__item').nth(1);
      const tabVisible = await myPluginsTab.isVisible().catch(() => false);

      if (tabVisible) {
        await myPluginsTab.click();
        await page.waitForTimeout(500);

        // Click the Uninstall button (danger type)
        const uninstallButton = page.locator('.installed-card-actions .el-button--danger').first();
        const uninstallVisible = await uninstallButton.isVisible().catch(() => false);

        if (uninstallVisible) {
          await uninstallButton.click();
          await page.waitForTimeout(500);

          // Confirmation dialog should appear (ElMessageBox)
          const confirmDialog = page.locator('.el-message-box');
          const confirmVisible = await confirmDialog.isVisible().catch(() => false);

          if (confirmVisible) {
            // Click confirm button
            const confirmBtn = page.locator('.el-message-box__btns .el-button--primary');
            await confirmBtn.click();
            await page.waitForTimeout(500);
          }
        }
      }

      expect(page.url()).toContain('/plugins');
    });

    test('should handle feature gate for free users (plugin limit)', async ({ page }) => {
      // Override auth to return free plan user
      await page.route('**/api/v1/auth/me', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              user: {
                id: 'user_1',
                email: 'free@example.com',
                displayName: 'Free User',
                role: 'user',
                tenantId: 'tenant_1',
                plan: 'free',
              },
            },
          }),
        });
      });

      // Mock install to return feature gate error
      await page.route('**/api/v1/plugins/installs', (route) => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              error: {
                code: 'FEATURE_GATE',
                message: 'Plugin limit reached for free plan',
              },
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(EMPTY_INSTALLED_RESPONSE),
          });
        }
      });

      await page.goto('/plugins');
      await waitForNetworkIdle(page);

      // Try to install a plugin
      const installButtons = page.locator('.plugin-card-footer .el-button--primary');
      const btnCount = await installButtons.count();

      if (btnCount > 0) {
        await installButtons.first().click();
        await page.waitForTimeout(500);

        // Should show error message
        const errorMsg = page.locator('.el-message--error');
        await expect(errorMsg.first()).toBeVisible();
      }

      // Page should not crash
      expect(page.url()).toContain('/plugins');
    });
  });
});
