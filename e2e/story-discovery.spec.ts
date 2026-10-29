import { test, expect, type Page } from '@playwright/test';
import { mockApiResponse, mockCommonEndpoints, mockModules, mockUnhandledApi, setupAuth } from './utils/helpers';

const character = {
  id: 'char-lantern', name: 'Mara and the Lantern Room', description: 'A quiet door opens into a city without a dawn.',
  avatarUrl: '/missing-story-cover.png', tags: ['Fantasy', 'Adventure', 'Mystery', 'Drama'], isPublic: true,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const pagination = { page: 1, limit: 20, total: 20, totalPages: 1, hasNext: false, hasPrev: false };
const chat = { id: 'chat-lantern', title: 'The Lantern Room', characterId: character.id, characterName: 'Mara', createdAt: '', updatedAt: '' };

async function setupDiscovery(page: Page) {
  await setupAuth(page);
  await mockUnhandledApi(page);
  await mockModules(page, 'all');
  await mockCommonEndpoints(page);
  await page.routeWebSocket(/\/ws(?:\?|$)/, () => {});
  await mockApiResponse(page, '**/api/v1/recommendations/**', { success: true, data: [] });
  await mockApiResponse(page, '**/api/v1/characters/search?**', {
    success: true, data: {
      items: Array.from({ length: 20 }, (_, index) => ({ ...character, id: index ? `char-${index}` : character.id, name: index ? `Story ${index}` : character.name })),
      pagination,
    },
  });
  await mockApiResponse(page, '**/api/v1/characters/char-lantern', { success: true, data: { ...character, cardData: {} } });
  await mockApiResponse(page, '**/api/v1/credits/balance', { success: true, data: { balance: 100, totalEarned: 100, totalSpent: 0 } });
  await mockApiResponse(page, '**/api/v1/chats', { success: true, data: { items: [], pagination: { ...pagination, total: 0 } } });
  await mockApiResponse(page, '**/api/v1/chats/chat-lantern', { success: true, data: chat });
  await mockApiResponse(page, '**/api/v1/chats/chat-lantern/messages*', { success: true, data: [] });
  await mockApiResponse(page, '**/api/v1/chats/chat-lantern/characters', { success: true, data: [] });
  let favorited = false;
  const mutations: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/v1\/(chats|llm)(?:[/?]|$)/.test(request.url())) mutations.push(request.url());
  });
  await page.route('**/api/v1/social/favorites**', route => {
    const method = route.request().method();
    if (method === 'POST') favorited = true;
    if (method === 'DELETE') favorited = false;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, data: { isFavorited: favorited, favoriteCount: favorited ? 1 : 0 },
    }) });
  });
  return { mutations };
}

test.describe('Story discovery', () => {
  test('keeps keyboard favorite actions separate from the native detail link', async ({ page }) => {
    const { mutations } = await setupDiscovery(page);
    await page.goto('/market');
    const card = page.locator('.story-card').first();
    await expect(card.getByRole('heading')).toHaveText(character.name);
    await expect(card.locator('.story-tags li')).toHaveCount(3);
    await expect(card.locator('.cover-initial')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Continue your last story' })).toHaveCount(0);
    const favorite = card.getByRole('button', { name: `Favorite ${character.name}`, exact: true });
    await favorite.focus();
    await page.keyboard.press('Enter');
    await expect(card.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/\/market$/);
    await card.getByRole('button').focus();
    await page.keyboard.press('Space');
    await expect(card.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    expect(mutations).toEqual([]);
  });

  test('restores search, filters and scroll after opening a detail and going back', async ({ page }) => {
    await setupDiscovery(page);
    const query = '?q=lantern&category=game&tags=Fantasy&sort=newest&page=2';
    await page.goto(`/market${query}`);
    const search = page.getByRole('textbox', { name: 'Search stories by character or description' });
    await expect(search).toHaveValue('lantern');
    await expect(page.locator('.filter-item').first().getByText('Game', { exact: true })).toBeVisible();
    await expect(page.locator('.story-card')).toHaveCount(20);
    await page.evaluate(() => window.scrollTo(0, 700));
    const target = page.locator('.story-card').nth(3).locator('.story-link');
    await target.scrollIntoViewIfNeeded();
    const offset = await page.evaluate(() => window.scrollY);
    await target.click();
    await page.waitForURL('**/characters/char-3');
    await page.goBack();
    await expect(search).toHaveValue('lantern');
    await expect(page).toHaveURL(`/market${query}`);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(offset, -1);
    await search.fill('new world');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/q=new\+world|q=new%20world/);
    expect(new URL(page.url()).searchParams.has('page')).toBe(false);
    await page.reload();
    await expect(search).toHaveValue('new world');
  });

  test('offers a verified existing story and resumes without creating one', async ({ page }) => {
    const { mutations } = await setupDiscovery(page);
    await page.addInitScript(() => localStorage.setItem('lastChatId', 'chat-lantern'));
    await page.goto('/market');
    const continuation = page.getByRole('region', { name: 'Continue your last story' });
    await expect(continuation).toContainText('The Lantern Room');
    await continuation.getByRole('link', { name: 'Continue reading' }).click();
    await page.waitForURL('**/chat/chat-lantern');
    expect(mutations).toEqual([]);
  });

  test('shows a retryable error instead of an empty list', async ({ page }) => {
    await setupDiscovery(page);
    let requests = 0;
    await page.route('**/api/v1/characters/search?**', route => {
      requests += 1;
      return route.fulfill({ status: requests === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(requests === 1
        ? { success: false, error: { code: 'UNAVAILABLE', message: 'Offline' } }
        : { success: true, data: { items: [character], pagination: { ...pagination, total: 1 } } }),
      });
    });
    await page.goto('/market');
    await expect(page.getByRole('alert').filter({ hasText: 'Failed to Load' })).toBeVisible();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.story-card')).toHaveCount(1);
  });

  for (const theme of ['light', 'dark']) {
    test(`keeps mobile search, summary and actions visible without overflow (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await setupDiscovery(page);
      await page.addInitScript(themeValue => localStorage.setItem('theme-preference', themeValue), theme);
      await page.goto('/market');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('textbox', { name: 'Search stories by character or description' })).toBeVisible();
      const card = page.locator('.story-card').first();
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('p')).toHaveText(character.description);
      await expect(card.getByRole('button')).toBeVisible();
      const box = await card.getByRole('button').boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      await card.getByRole('button').click();
      await expect(card.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: test.info().outputPath('discovery.png') });
    });
  }
});
