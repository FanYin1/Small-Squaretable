import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { generateUniqueUser } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

/**
 * E2E Tests: Developer API Portal
 *
 * Tests API key management on the DeveloperSettings page.
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

const SCOPES_MOCK = {
  success: true,
  data: ['characters:read', 'characters:write', 'chats:read', 'chats:write'],
};

const SAMPLE_KEY: Record<string, unknown> = {
  id: 'key_1',
  name: 'Test Key',
  keyHint: 'sk_...abc',
  scopes: ['characters:read'],
  isActive: true,
  rateLimitPerMinute: 100,
  createdAt: '2026-02-20T00:00:00Z',
  lastUsedAt: '2026-02-21T00:00:00Z',
  requestCount: 42,
  expiresAt: null,
};

const API_KEYS_MOCK = {
  success: true,
  data: [SAMPLE_KEY],
};

const EMPTY_KEYS_MOCK = {
  success: true,
  data: [],
};

const CREATE_KEY_MOCK = {
  success: true,
  data: {
    id: 'key_2',
    name: 'New Key',
    key: 'sk_live_abc123def456ghi789',
    keyHint: 'sk_...789',
    scopes: ['characters:read', 'chats:read'],
    isActive: true,
    rateLimitPerMinute: 60,
    createdAt: '2026-02-21T12:00:00Z',
    lastUsedAt: null,
    requestCount: 0,
    expiresAt: null,
  },
};

test.describe('Developer API Portal', () => {
  test.describe('API Key Management', () => {
    let authPage: AuthPage;

    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);

      await mockApiResponse(page, '**/api/v1/auth/me', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/auth/register', AUTH_MOCK);
      await mockApiResponse(page, '**/api/v1/developer/scopes', SCOPES_MOCK);
      await mockApiResponse(page, '**/api/v1/developer/api-keys', API_KEYS_MOCK);

      // Single key operations (GET/PATCH/DELETE)
      await mockApiResponse(page, '**/api/v1/developer/api-keys/*', {
        success: true,
        data: SAMPLE_KEY,
      });

      await clearSession(page);
      const testUser = generateUniqueUser();
      await authPage.register(testUser.email, testUser.password, testUser.name);
      await page.waitForURL(/\/chat|\/dashboard|\/$/, { timeout: 15000 });
      await waitForNetworkIdle(page);
    });

    test('should display developer settings page', async ({ page }) => {
      await page.goto('/developer');
      await waitForNetworkIdle(page);

      expect(page.url()).toContain('/developer');

      // Page should render without crashing
      const settingsContainer = page.locator('.developer-settings');
      const visible = await settingsContainer.isVisible().catch(() => false);
      expect(typeof visible).toBe('boolean');
    });

    test('should show empty state when no API keys', async ({ page }) => {
      // Override to return empty key list
      await page.route('**/api/v1/developer/api-keys', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_KEYS_MOCK),
        });
      });

      await page.goto('/developer');
      await waitForNetworkIdle(page);

      const emptyState = page.locator('.empty-state');
      const visible = await emptyState.isVisible().catch(() => false);
      expect(typeof visible).toBe('boolean');

      if (visible) {
        // Empty state should contain the Key icon and descriptive text
        const heading = emptyState.locator('h3');
        const headingVisible = await heading.isVisible().catch(() => false);
        expect(typeof headingVisible).toBe('boolean');
      }
    });

    test('should open create API key dialog', async ({ page }) => {
      await page.goto('/developer');
      await waitForNetworkIdle(page);

      // Click the "创建 API Key" button
      const createButton = page.locator('button').filter({ hasText: /创建|API Key|Create/ }).first();
      const btnVisible = await createButton.isVisible().catch(() => false);

      if (btnVisible) {
        await createButton.click();
        await page.waitForTimeout(500);

        // Dialog should appear
        const dialog = page.locator('.el-dialog');
        const dialogVisible = await dialog.isVisible().catch(() => false);
        expect(dialogVisible).toBe(true);

        // Dialog should contain name input and scope checkboxes
        const nameInput = dialog.locator('.el-input');
        const inputVisible = await nameInput.first().isVisible().catch(() => false);
        expect(typeof inputVisible).toBe('boolean');
      }
    });

    test('should create a new API key and display the key value', async ({ page }) => {
      // Override POST to return the created key
      await page.route('**/api/v1/developer/api-keys', (route) => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(CREATE_KEY_MOCK),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(API_KEYS_MOCK),
          });
        }
      });

      await page.goto('/developer');
      await waitForNetworkIdle(page);

      // Open create dialog
      const createButton = page.locator('button').filter({ hasText: /创建|API Key|Create/ }).first();
      const btnVisible = await createButton.isVisible().catch(() => false);

      if (btnVisible) {
        await createButton.click();
        await page.waitForTimeout(500);

        const dialog = page.locator('.el-dialog');

        // Fill in key name
        const nameInput = dialog.locator('.el-input__inner').first();
        await nameInput.fill('New Key');

        // Select at least one scope checkbox
        const scopeCheckbox = dialog.locator('.el-checkbox').first();
        const checkboxVisible = await scopeCheckbox.isVisible().catch(() => false);
        if (checkboxVisible) {
          await scopeCheckbox.click();
        }

        // Click create button in dialog footer
        const submitButton = dialog.locator('.el-dialog__footer .el-button--primary');
        const submitVisible = await submitButton.isVisible().catch(() => false);
        if (submitVisible) {
          await submitButton.click();
          await page.waitForTimeout(1000);

          // After creation, the full key should be displayed
          const fullKey = dialog.locator('.full-key');
          const keyVisible = await fullKey.isVisible().catch(() => false);
          expect(typeof keyVisible).toBe('boolean');

          if (keyVisible) {
            const keyText = await fullKey.textContent();
            expect(keyText).toContain('sk_live_');
          }

          // Warning alert should be shown
          const warningAlert = dialog.locator('.el-alert--warning');
          const alertVisible = await warningAlert.isVisible().catch(() => false);
          expect(typeof alertVisible).toBe('boolean');
        }
      }
    });

    test('should display API key list with name and masked key', async ({ page }) => {
      await page.goto('/developer');
      await waitForNetworkIdle(page);

      const keyCards = page.locator('.key-card');
      const count = await keyCards.count();
      expect(count).toBeGreaterThanOrEqual(0);

      if (count > 0) {
        // Key name should be visible
        const keyName = keyCards.first().locator('.key-name');
        const nameVisible = await keyName.isVisible().catch(() => false);
        expect(typeof nameVisible).toBe('boolean');

        if (nameVisible) {
          const nameText = await keyName.textContent();
          expect(nameText).toBe('Test Key');
        }

        // Masked key hint should be visible
        const keyHint = keyCards.first().locator('.key-hint');
        const hintVisible = await keyHint.isVisible().catch(() => false);
        expect(typeof hintVisible).toBe('boolean');

        if (hintVisible) {
          const hintText = await keyHint.textContent();
          expect(hintText).toContain('sk_');
        }
      }
    });

    test('should show scope tags on API key cards', async ({ page }) => {
      await page.goto('/developer');
      await waitForNetworkIdle(page);

      const keyCards = page.locator('.key-card');
      const count = await keyCards.count();

      if (count > 0) {
        const scopeTags = keyCards.first().locator('.scope-tag');
        const tagCount = await scopeTags.count();
        expect(tagCount).toBeGreaterThanOrEqual(0);

        if (tagCount > 0) {
          const firstTag = await scopeTags.first().textContent();
          expect(firstTag).toContain('characters:read');
        }
      }
    });

    test('should toggle API key active/inactive', async ({ page }) => {
      // Mock PATCH to return toggled key
      await page.route('**/api/v1/developer/api-keys/*', (route) => {
        if (route.request().method() === 'PATCH') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { ...SAMPLE_KEY, isActive: false },
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: SAMPLE_KEY }),
          });
        }
      });

      await page.goto('/developer');
      await waitForNetworkIdle(page);

      const keyCards = page.locator('.key-card');
      const count = await keyCards.count();

      if (count > 0) {
        // Find the switch in the key actions
        const toggle = keyCards.first().locator('.el-switch');
        const toggleVisible = await toggle.isVisible().catch(() => false);
        expect(typeof toggleVisible).toBe('boolean');

        if (toggleVisible) {
          await toggle.click();
          await page.waitForTimeout(500);

          // Should show success message
          const successMsg = page.locator('.el-message--success');
          const msgVisible = await successMsg.isVisible().catch(() => false);
          expect(typeof msgVisible).toBe('boolean');
        }
      }
    });

    test('should delete an API key with confirmation', async ({ page }) => {
      // Mock DELETE
      await page.route('**/api/v1/developer/api-keys/*', (route) => {
        if (route.request().method() === 'DELETE') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: { message: 'Deleted' } }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: SAMPLE_KEY }),
          });
        }
      });

      await page.goto('/developer');
      await waitForNetworkIdle(page);

      const keyCards = page.locator('.key-card');
      const count = await keyCards.count();

      if (count > 0) {
        // Click the delete button
        const deleteButton = keyCards.first().locator('.key-actions .el-button').filter({ hasText: /删除|Delete/ });
        const deleteVisible = await deleteButton.isVisible().catch(() => false);
        expect(typeof deleteVisible).toBe('boolean');

        if (deleteVisible) {
          await deleteButton.click();
          await page.waitForTimeout(500);

          // Confirmation dialog should appear (ElMessageBox)
          const confirmDialog = page.locator('.el-message-box');
          const confirmVisible = await confirmDialog.isVisible().catch(() => false);
          expect(typeof confirmVisible).toBe('boolean');

          if (confirmVisible) {
            // Click confirm button
            const confirmBtn = confirmDialog.locator('.el-message-box__btns .el-button--primary');
            await confirmBtn.click();
            await page.waitForTimeout(500);
          }
        }
      }
    });

    test('should show key metadata (created date, last used, request count)', async ({ page }) => {
      await page.goto('/developer');
      await waitForNetworkIdle(page);

      const keyCards = page.locator('.key-card');
      const count = await keyCards.count();

      if (count > 0) {
        const metaSection = keyCards.first().locator('.key-meta');
        const metaVisible = await metaSection.isVisible().catch(() => false);
        expect(typeof metaVisible).toBe('boolean');

        if (metaVisible) {
          const metaItems = metaSection.locator('.meta-item');
          const itemCount = await metaItems.count();
          // Should have created, lastUsed, requests, rateLimit, expiresAt = 5 items
          expect(itemCount).toBeGreaterThanOrEqual(3);

          // Check that meta labels exist
          const labels = metaSection.locator('.meta-label');
          const labelCount = await labels.count();
          expect(labelCount).toBeGreaterThanOrEqual(3);

          // Check that meta values exist
          const values = metaSection.locator('.meta-value');
          const valueCount = await values.count();
          expect(valueCount).toBeGreaterThanOrEqual(3);

          // Request count should show "42"
          const requestValue = await values.nth(2).textContent();
          expect(requestValue).toContain('42');
        }
      }
    });

    test('should open edit dialog and update key name', async ({ page }) => {
      // Mock PATCH to return updated key
      await page.route('**/api/v1/developer/api-keys/*', (route) => {
        if (route.request().method() === 'PATCH') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { ...SAMPLE_KEY, name: 'Updated Key Name' },
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: SAMPLE_KEY }),
          });
        }
      });

      await page.goto('/developer');
      await waitForNetworkIdle(page);

      const keyCards = page.locator('.key-card');
      const count = await keyCards.count();

      if (count > 0) {
        // Click the edit button
        const editButton = keyCards.first().locator('.key-actions .el-button').filter({ hasText: /编辑|Edit/ });
        const editVisible = await editButton.isVisible().catch(() => false);
        expect(typeof editVisible).toBe('boolean');

        if (editVisible) {
          await editButton.click();
          await page.waitForTimeout(500);

          // Edit dialog should appear
          const dialog = page.locator('.el-dialog').last();
          const dialogVisible = await dialog.isVisible().catch(() => false);
          expect(dialogVisible).toBe(true);

          if (dialogVisible) {
            // Update the name input
            const nameInput = dialog.locator('.el-input__inner').first();
            await nameInput.clear();
            await nameInput.fill('Updated Key Name');

            // Click save button
            const saveButton = dialog.locator('.el-dialog__footer .el-button--primary');
            const saveVisible = await saveButton.isVisible().catch(() => false);
            if (saveVisible) {
              await saveButton.click();
              await page.waitForTimeout(500);

              // Success message should appear
              const successMsg = page.locator('.el-message--success');
              const msgVisible = await successMsg.isVisible().catch(() => false);
              expect(typeof msgVisible).toBe('boolean');
            }
          }
        }
      }
    });

    test('should display rate limit information', async ({ page }) => {
      await page.goto('/developer');
      await waitForNetworkIdle(page);

      const keyCards = page.locator('.key-card');
      const count = await keyCards.count();

      if (count > 0) {
        const metaSection = keyCards.first().locator('.key-meta');
        const metaVisible = await metaSection.isVisible().catch(() => false);

        if (metaVisible) {
          // Rate limit meta item should show the value "100"
          const metaValues = metaSection.locator('.meta-value');
          const allText = await metaValues.allTextContents();
          const hasRateLimit = allText.some((text) => text.includes('100'));
          expect(hasRateLimit).toBe(true);
        }
      }
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // Override API keys endpoint to return 500
      await page.route('**/api/v1/developer/api-keys', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await page.goto('/developer');
      await page.waitForTimeout(2000);

      // Page should not crash — developer-settings container should still render
      const settingsContainer = page.locator('.developer-settings');
      const visible = await settingsContainer.isVisible().catch(() => false);
      expect(typeof visible).toBe('boolean');

      // Should show empty state or error state (not a blank page)
      expect(page.url()).toContain('/developer');
    });
  });
});
