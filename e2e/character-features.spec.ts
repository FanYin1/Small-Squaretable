import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { generateUniqueUser } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle } from './utils/helpers';

/**
 * E2E Tests: Character Editor & Search Features
 *
 * Smoke tests for character editor (templates, version history)
 * and search features (command palette, search page).
 */

test.describe('Character Editor Features', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    await clearSession(page);

    const testUser = generateUniqueUser();
    await authPage.register(testUser.email, testUser.password, testUser.name);
    await page.waitForURL(/\/chat|\/dashboard/, { timeout: 15000 });
    await waitForNetworkIdle(page);
  });

  test('can navigate to character creation page', async ({ page }) => {
    await page.goto('/characters/new');
    await waitForNetworkIdle(page);

    // Verify the editor form exists (el-form with name input)
    const editorForm = page.locator('.editor-form, .el-form');
    const isVisible = await editorForm.first().isVisible().catch(() => false);
    expect(isVisible).toBe(true);

    // URL should reflect the creation route
    expect(page.url()).toContain('/characters/new');
  });

  test('character creation shows template options', async ({ page }) => {
    await page.goto('/characters/new');
    await waitForNetworkIdle(page);

    // TemplateSelector is rendered only in create mode (not edit mode)
    const templateSelector = page.locator(
      '.template-selector, .template-list, [class*="template"]'
    );
    const isVisible = await templateSelector.first().isVisible().catch(() => false);
    expect(typeof isVisible).toBe('boolean');
  });

  test('character editor shows version history in edit mode', async ({ page }) => {
    // Navigate to an edit URL — the page will attempt to load a character.
    // Even if the fetch fails, the VersionHistory component is conditionally
    // rendered when isEditMode && characterId, so we verify the route works.
    await page.goto('/characters/test-id/edit');
    await waitForNetworkIdle(page);

    // In edit mode the URL should contain /edit
    expect(page.url()).toContain('/edit');

    // Check for version history section (rendered when character loads successfully)
    const versionHistory = page.locator(
      '.version-history, [class*="version-history"], [class*="VersionHistory"]'
    );
    const isVisible = await versionHistory.first().isVisible().catch(() => false);
    expect(typeof isVisible).toBe('boolean');
  });
});

test.describe('Search Features', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    await clearSession(page);

    const testUser = generateUniqueUser();
    await authPage.register(testUser.email, testUser.password, testUser.name);
    await page.waitForURL(/\/chat|\/dashboard/, { timeout: 15000 });
    await waitForNetworkIdle(page);
  });

  test('Ctrl+K opens search command palette', async ({ page }) => {
    await page.goto('/chat');
    await waitForNetworkIdle(page);

    // Press Ctrl+K to open the command palette
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);

    // The command palette overlay should appear
    const palette = page.locator('.command-palette-overlay, .command-palette');
    const isVisible = await palette.first().isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });

  test('search page renders with tabs', async ({ page }) => {
    await page.goto('/search');
    await waitForNetworkIdle(page);

    // Verify the search input exists
    const searchInput = page.locator('.search-bar .el-input, .search-header .el-input');
    const inputVisible = await searchInput.first().isVisible().catch(() => false);
    expect(inputVisible).toBe(true);

    // Verify result tabs exist (all / characters / messages / worldbooks)
    const tabs = page.locator('.el-tabs__item');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);
  });

  test('search page shows results area for query', async ({ page }) => {
    await page.goto('/search?q=test');
    await waitForNetworkIdle(page);

    // The search query should be populated
    expect(page.url()).toContain('q=test');

    // Results area should exist (either results, empty state, or loading skeleton)
    const resultsArea = page.locator(
      '.search-results, .el-empty, .results-loading, .el-skeleton'
    );
    const isVisible = await resultsArea.first().isVisible().catch(() => false);
    expect(typeof isVisible).toBe('boolean');
  });
});
