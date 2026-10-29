import { test, expect, type Page } from '@playwright/test';
import type { UserPersona } from '../src/client/services/user-persona.api';
import {
  mockApiResponse,
  mockCommonEndpoints,
  mockModules,
  mockUnhandledApi,
  setupAuth,
} from './utils/helpers';

const EMPTY_CHATS = {
  success: true,
  data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } },
};

const STORY_CHAT = {
  id: 'chat-story',
  tenantId: 'tenant_1',
  userId: 'user_1',
  characterId: 'char-story',
  title: 'The Lantern Room',
  characterName: 'Mara',
  characterAvatar: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const STORY_CHARACTER = {
  id: 'char-story',
  name: 'Mara',
  description: 'A keeper of quiet doors.',
  avatarUrl: null,
  cardData: {
    name: 'Mara',
    first_mes: 'The lantern room is waiting. What do you do?',
    alternate_greetings: [],
  },
  tags: ['mystery'],
  isPublic: true,
  creatorId: 'author-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

async function setupStoryEntry(page: Page, personas: UserPersona[] = []) {
  await setupAuth(page);
  await mockUnhandledApi(page);
  await mockModules(page, 'all');
  await mockCommonEndpoints(page);
  await page.routeWebSocket(/\/ws(?:\?|$)/, () => {});
  await mockApiResponse(page, '**/api/v1/chat-templates*', { success: true, data: [] });
  await mockApiResponse(page, '**/api/v1/llm/models', { success: true, data: [] });
  await mockApiResponse(page, '**/api/v1/chats/chat-story/messages*', { success: true, data: [] });
  await mockApiResponse(page, '**/api/v1/chats/chat-story/characters', { success: true, data: [] });
  await mockApiResponse(page, '**/api/v1/characters*', {
    success: true,
    data: {
      items: [STORY_CHARACTER],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    },
  });
  await mockApiResponse(page, '**/api/v1/characters/char-story', { success: true, data: STORY_CHARACTER });
  await mockApiResponse(page, '**/api/v1/characters/char-story/intelligence/emotion*', {
    success: true,
    data: { current: { valence: 0.2, arousal: 0.2, label: 'calm' }, history: [] },
  });
  await mockApiResponse(page, '**/api/v1/characters/char-story/intelligence/memories*', {
    success: true,
    data: { memories: [], total: 0 },
  });
  await mockApiResponse(page, '**/api/v1/personas', { success: true, data: personas });
  for (const persona of personas) {
    await mockApiResponse(page, `**/api/v1/personas/${persona.id}`, { success: true, data: persona });
  }
  let createdChat = { ...STORY_CHAT, personaId: null as string | null };
  await page.route('**/api/v1/chats/chat-story', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: createdChat }),
  }));
  await page.route('**/api/v1/chats', (route) => {
    if (route.request().method() === 'POST') {
      createdChat = { ...STORY_CHAT, personaId: route.request().postDataJSON().personaId ?? null };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: createdChat }) });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_CHATS) });
  });
}

test.describe('Story entry identity confirmation', () => {
  const traveler: UserPersona = {
    id: 'persona-1', tenantId: 'tenant_1', userId: 'user_1', name: 'Alex',
    description: 'A careful traveler.', metadata: {}, isDefault: true,
    createdAt: '', updatedAt: '', avatarUrl: null,
  };

  async function setupPersonalizedOpening(page: Page) {
    await setupStoryEntry(page, [traveler]);
    await mockApiResponse(page, '**/api/v1/characters/char-story', {
      success: true,
      data: { ...STORY_CHARACTER, cardData: { ...STORY_CHARACTER.cardData, first_mes: '{{char}} welcomes {{user}}.' } },
    });
  }

  test('quick start uses the default persona and survives refresh without another creation', async ({ page }) => {
    await setupPersonalizedOpening(page);
    const requests: unknown[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/chats') requests.push(request.postDataJSON());
    });
    await page.goto('/characters/char-story');
    await page.getByTestId('enter-story').click();
    await page.waitForURL('**/chat/chat-story');
    await expect(page.locator('.greeting-bubble')).toContainText('Mara welcomes Alex.');
    await expect(page.locator('.story-identity-page')).toHaveCount(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ characterId: 'char-story', personaId: 'persona-1' });
    await page.reload();
    await expect(page.locator('.greeting-bubble')).toContainText('Mara welcomes Alex.');
    expect(requests).toHaveLength(1);
  });

  test('offers optional setup without creating a story just by viewing it', async ({ page }) => {
    await setupPersonalizedOpening(page);
    const requests: string[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/chats') requests.push(request.url());
    });
    await page.goto('/characters/char-story');
    await page.getByRole('button', { name: 'Adjust your identity first' }).click();
    await expect(page.locator('.story-identity-page')).toBeVisible();
    await expect(page.locator('.entry-preview').getByRole('heading', { name: STORY_CHARACTER.name, exact: true })).toBeVisible();
    expect(requests).toEqual([]);
    await page.locator('.story-identity-page').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(/\/chat$/);
    expect(requests).toEqual([]);
  });

  test('recovers a lost creation response after reload without another POST', async ({ page }) => {
    await setupStoryEntry(page);
    let submissions = 0;
    let savedRequestId = '';
    await page.route('**/api/v1/chats', route => {
      if (route.request().method() !== 'POST') return route.fallback();
      submissions += 1;
      savedRequestId = route.request().postDataJSON().clientRequestId;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
        success: false, error: { code: 'UNAVAILABLE', message: 'Response lost after commit' },
      }) });
    });
    let lookups = 0;
    await page.route('**/api/v1/chats/creation-requests/*', route => {
      lookups += 1;
      expect(route.request().method()).toBe('GET');
      expect(route.request().url()).toContain(savedRequestId);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true, data: { protocol: 1, status: 'created', chatId: 'chat-story' },
      }) });
    });
    await page.goto('/chat?characterId=char-story&storyEntry=1');
    await page.locator('.el-dialog, .story-identity-page').getByRole('button', { name: 'Start without one' }).click();
    await expect(page.locator('.el-dialog, .story-identity-page')).toContainText('result is unknown');
    await page.reload();
    const recovery = page.getByRole('region', { name: 'A story creation request needs your attention' });
    await expect(recovery.getByRole('button', { name: 'Open original story' })).toBeVisible();
    await expect(page).toHaveURL(/\/chat\?characterId=char-story&storyEntry=1$/);
    expect(submissions).toBe(1);
    expect(lookups).toBe(1);
    await recovery.getByRole('button', { name: 'Open original story' }).click();
    await page.waitForURL('**/chat/chat-story');
    await expect(page.locator('.greeting-bubble')).toBeVisible();
    expect(submissions).toBe(1);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('story-creation:')))).toEqual([]);
  });

  for (const outcome of ['not_found', 'old_server'] as const) {
    test(`keeps creation paused after reload when recovery returns ${outcome}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await setupStoryEntry(page);
      let submissions = 0;
      await page.route('**/api/v1/chats', route => {
        if (route.request().method() !== 'POST') return route.fallback();
        submissions += 1;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          success: false, error: { code: 'UNAVAILABLE', message: 'Response lost' },
        }) });
      });
      let lookups = 0;
      await page.route('**/api/v1/chats/creation-requests/*', route => {
        lookups += 1;
        return route.fulfill({ status: outcome === 'old_server' ? 404 : 200,
          contentType: 'application/json', body: JSON.stringify(outcome === 'old_server'
            ? { success: false, error: { code: 'NOT_FOUND', message: 'Unsupported endpoint' } }
            : { success: true, data: { protocol: 1, status: 'not_found' } }),
        });
      });
      await page.goto('/chat?characterId=char-story&storyEntry=1');
      await page.locator('.el-dialog, .story-identity-page').getByRole('button', { name: 'Start without one' }).click();
      await expect(page.locator('.el-dialog, .story-identity-page')).toContainText('result is unknown');
      await page.reload();
      const recovery = page.getByRole('region', { name: 'A story creation request needs your attention' });
      await expect(recovery).toContainText('creation remains paused');
      await expect(recovery.getByRole('button', { name: 'Open original story' })).toHaveCount(0);
      await recovery.getByRole('button', { name: 'Check result' }).click();
      await expect.poll(() => lookups).toBe(2);
      await expect(page.locator('.el-dialog, .story-identity-page')).toBeHidden();
      expect(submissions).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test('uses the confirmed identity in the opening and restores it after refresh', async ({ page }) => {
    await setupPersonalizedOpening(page);
    await page.goto('/chat?characterId=char-story&storyEntry=1');
    await expect(page.locator('.persona-item[aria-pressed="true"]')).toContainText('Alex');
    await page.locator('.el-dialog, .story-identity-page').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page).toHaveURL(/\/chat\/chat-story$/);
    await expect(page.locator('.greeting-bubble')).toContainText('Mara welcomes Alex.');
    await page.reload();
    await expect(page.locator('.greeting-bubble')).toContainText('Mara welcomes Alex.');
    await expect(page.locator('.greeting-bubble')).not.toContainText('E2E User');
  });

  test('retries a rejected creation with the same request key and identity', async ({ page }) => {
    await setupStoryEntry(page, [traveler]);
    const requests: { clientRequestId: string; personaId: string; characterId: string }[] = [];
    await page.route('**/api/v1/chats', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      requests.push(route.request().postDataJSON());
      if (requests.length > 1) return route.fallback();
      return route.fulfill({
        status: 429, contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: 'Please retry' } }),
      });
    });
    await page.goto('/chat?characterId=char-story&storyEntry=1');
    const dialog = page.locator('.el-dialog, .story-identity-page');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog.locator('[role="alert"]')).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page).toHaveURL(/\/chat\/chat-story$/);
    expect(requests).toHaveLength(2);
    expect(requests[0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requests[0].personaId).toBe(traveler.id);
    expect(requests[1]).toEqual(requests[0]);
  });

  test('keeps an unknown creation blocked after closing and reopening the dialog', async ({ page }) => {
    await setupStoryEntry(page, [{ ...traveler, isDefault: false }, { ...traveler, id: 'persona-2', name: 'Morgan', isDefault: false }]);
    let creations = 0;
    await page.route('**/api/v1/chats', route => {
      if (route.request().method() !== 'POST') return route.fallback();
      creations += 1;
      return route.fulfill({
        status: 503, contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { code: 'UNAVAILABLE', message: 'Unknown result' } }),
      });
    });
    await page.goto('/chat');
    await page.locator('.story-start-tools > summary').click();
    const card = page.locator('.character-card').first();
    await card.click();
    const dialog = page.locator('.el-dialog, .story-identity-page');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog.locator('[role="alert"]')).toContainText('result is unknown');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await card.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.persona-item').first()).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Use a new identity', exact: true })).toBeDisabled();
    expect(creations).toBe(1);
  });

  test('offers a safe retry when the selected identity cannot be loaded', async ({ page }) => {
    await setupPersonalizedOpening(page);
    let attempts = 0;
    await page.route('**/api/v1/personas/persona-1', route => {
      attempts += 1;
      return route.fulfill({
        status: attempts === 1 ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(attempts === 1
          ? { success: false, error: { code: 'UNAVAILABLE', message: 'Temporarily unavailable' } }
          : { success: true, data: traveler }),
      });
    });
    await page.goto('/chat?characterId=char-story&storyEntry=1');
    await expect(page.locator('.persona-item[aria-pressed="true"]')).toContainText('Alex');
    await page.locator('.el-dialog, .story-identity-page').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.locator('.greeting-container [role="alert"]')).toBeVisible();
    await expect(page.locator('.greeting-bubble')).toHaveCount(0);
    await page.locator('.greeting-container').getByRole('button', { name: 'Reload identity', exact: true }).click();
    await expect(page.locator('.greeting-bubble')).toContainText('Mara welcomes Alex.');
  });

  test('starts without an identity and shows the character opening', async ({ page }) => {
    await setupStoryEntry(page);
    await page.goto('/chat?characterId=char-story&storyEntry=1');

    const dialog = page.locator('.el-dialog, .story-identity-page');
    await expect(dialog).toBeVisible();
    const startWithoutIdentity = dialog.getByRole('button', { name: 'Start without one' });
    await expect(startWithoutIdentity).toBeVisible();
    await startWithoutIdentity.click();
    await page.waitForURL('**/chat/chat-story');
    await expect(page.getByText('The lantern room is waiting. What do you do?')).toBeVisible({ timeout: 10000 });
  });

  test('cancels optional setup and clears the pending story URL', async ({ page }) => {
    await setupStoryEntry(page, [
      {
        id: 'persona-1', tenantId: 'tenant_1', userId: 'user_1', name: 'Alex',
        description: 'A careful traveler.', metadata: {}, isDefault: true,
        createdAt: '', updatedAt: '', avatarUrl: null,
      },
    ]);
    await page.goto('/chat?characterId=char-story&storyEntry=1');
    await expect(page.locator('.story-identity-page')).toBeVisible();

    await page.locator('.story-identity-page').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.story-identity-page')).toBeHidden();
    await expect(page).toHaveURL(/\/chat$/);
  });

  test('fits optional identity setup on a 390px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupStoryEntry(page);
    await page.goto('/chat?characterId=char-story&storyEntry=1');
    await expect(page.locator('.el-dialog, .story-identity-page')).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      dialog: document.querySelector('.el-dialog, .story-identity-page')?.getBoundingClientRect().width ?? 0,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.dialog).toBeLessThanOrEqual(dimensions.viewport - 16);
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport);
  });

  test('returns focus to the character card after Escape', async ({ page }) => {
    await setupStoryEntry(page, [
      {
        id: 'persona-1', tenantId: 'tenant_1', userId: 'user_1', name: 'Alex',
        description: 'A careful traveler.', metadata: {}, isDefault: false,
        createdAt: '', updatedAt: '', avatarUrl: null,
      },
      {
        id: 'persona-2', tenantId: 'tenant_1', userId: 'user_1', name: 'Morgan',
        description: 'A patient traveler.', metadata: {}, isDefault: false,
        createdAt: '', updatedAt: '', avatarUrl: null,
      },
    ]);
    await page.goto('/chat');
    await page.locator('.story-start-tools > summary').click();
    const card = page.locator('.character-card').first();
    await expect(card).toBeVisible();
    await card.focus();
    await card.click();
    await expect(page.locator('.el-dialog, .story-identity-page')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.el-dialog, .story-identity-page')).toBeHidden();
    await expect(card).toBeFocused();
  });
});
