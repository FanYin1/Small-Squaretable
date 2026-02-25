import { test, expect } from '@playwright/test';
import { setupAuth, mockApiResponse, waitForNetworkIdle } from './utils/helpers';

/**
 * E2E Tests: Developer API Portal
 *
 * Tests the DeveloperSettings page: loading, empty state, key list, create dialog.
 * All API responses are mocked — no live backend required.
 */

const SCOPES_MOCK = {
  success: true,
  data: ['characters:read', 'characters:write', 'chats:read', 'chats:write'],
};

const SAMPLE_KEY = {
  id: 'key_1',
  name: 'Test Key',
  keyHint: 'sk_...abc',
  scopes: ['characters:read'],
  isActive: true,
  rateLimitPerMinute: 100,
  createdAt: '2026-02-20T00:00:00Z',
  lastUsedAt: null,
  requestCount: 0,
  expiresAt: null,
};

test.describe('Developer API Portal', () => {
  // 1. Developer page loads
  test('developer page loads', async ({ page }) => {
    await setupAuth(page);
    await mockApiResponse(page, '**/api/v1/developer/api-keys', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/developer/scopes', SCOPES_MOCK);

    await page.goto('/developer');
    await waitForNetworkIdle(page);

    await expect(page.locator('.developer-settings')).toBeVisible();
  });

  // 2. Empty state shown
  test('empty state shown when no API keys', async ({ page }) => {
    await setupAuth(page);
    await mockApiResponse(page, '**/api/v1/developer/api-keys', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/developer/scopes', SCOPES_MOCK);

    await page.goto('/developer');
    await waitForNetworkIdle(page);

    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText(/No API Keys|API Key|没有/);
  });

  // 3. Key list renders
  test('key list renders with key cards', async ({ page }) => {
    await setupAuth(page);
    await mockApiResponse(page, '**/api/v1/developer/api-keys', { success: true, data: [SAMPLE_KEY] });
    await mockApiResponse(page, '**/api/v1/developer/scopes', SCOPES_MOCK);

    await page.goto('/developer');
    await waitForNetworkIdle(page);

    const keyCards = page.locator('.key-card');
    await expect(keyCards.first()).toBeVisible();

    const count = await keyCards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify key name is displayed
    await expect(page.locator('.key-name').first()).toContainText('Test Key');

    // Verify masked key hint is displayed
    await expect(page.locator('.key-hint').first()).toBeVisible();
  });

  // 4. Create key dialog opens
  test('create key dialog opens', async ({ page }) => {
    await setupAuth(page);
    await mockApiResponse(page, '**/api/v1/developer/api-keys', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/developer/scopes', SCOPES_MOCK);

    await page.goto('/developer');
    await waitForNetworkIdle(page);

    // Click the create button
    const createButton = page.locator('button').filter({ hasText: /创建|Create|API Key/ }).first();
    await createButton.click();
    await page.waitForTimeout(500);

    // Dialog should appear
    const dialog = page.locator('.el-dialog');
    await expect(dialog.first()).toBeVisible();
  });
});
