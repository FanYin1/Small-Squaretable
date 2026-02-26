import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle, mockApiResponse, setupAuth, mockCommonEndpoints } from './utils/helpers';

/**
 * E2E Tests: Intelligence Features
 *
 * 3 smoke tests for the intelligence debug panel, memory panel,
 * and emotion state display.  All API responses are mocked.
 */

const PAGINATION = { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false };

const CHATS_LIST = {
  success: true,
  data: {
    items: [
      { id: 'chat_1', tenantId: 'tenant_1', userId: 'user_1', characterId: 'char_1', title: 'Test Chat', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ],
    pagination: PAGINATION,
  },
};

const CHARACTERS = {
  success: true,
  data: {
    items: [
      { id: 'char_1', name: 'Test Character', description: 'A test character', greeting: 'Hello!', avatarUrl: null, tags: [], isPublic: false, creatorId: 'user_1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ],
    pagination: PAGINATION,
  },
};

const MESSAGES = {
  success: true,
  data: [
    { id: 'msg_1', chatId: 'chat_1', role: 'user', content: 'Hello', sentAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'msg_2', chatId: 'chat_1', role: 'assistant', content: 'Hi there!', sentAt: '2026-01-01T00:01:00Z', createdAt: '2026-01-01T00:01:00Z' },
  ],
};

const EMOTION_MOCK = { success: true, data: { current: { valence: 0.5, arousal: 0.3, label: 'content' }, history: [] } };
const MEMORIES_MOCK = { success: true, data: { memories: [], total: 0 } };
const DEBUG_MOCK = { success: true, data: { emotionState: { valence: 0.5, arousal: 0.3 }, memoryCount: 0, lastUpdated: '2026-01-01T00:00:00Z' } };

async function mockIntelligenceEndpoints(page: import('@playwright/test').Page) {
  await mockApiResponse(page, '**/api/v1/chats', CHATS_LIST);
  await mockApiResponse(page, '**/api/v1/chats/chat_1/messages*', MESSAGES);
  await mockApiResponse(page, '**/api/v1/chats/chat_1/characters', { success: true, data: [] });
  await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
  await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/emotion*', EMOTION_MOCK);
  await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/memories*', MEMORIES_MOCK);
  await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/debug*', DEBUG_MOCK);
  await mockApiResponse(page, '**/api/v1/chat-templates*', { success: true, data: [] });
  await mockCommonEndpoints(page);
}

test.describe('Intelligence Features', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('intelligence debug button is accessible in chat actions', async ({ page }) => {
    await setupAuth(page);
    await page.addInitScript(() => { localStorage.setItem('lastChatId', 'chat_1'); });
    await mockIntelligenceEndpoints(page);

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    const chatActions = page.locator('.chat-actions');
    await expect(chatActions).toBeVisible({ timeout: 10000 });

    const debugBtn = chatActions.locator('button').filter({ hasText: /Debug/i });
    await expect(debugBtn).toBeVisible();
  });

  test('memory button is accessible in chat actions', async ({ page }) => {
    await setupAuth(page);
    await page.addInitScript(() => { localStorage.setItem('lastChatId', 'chat_1'); });
    await mockIntelligenceEndpoints(page);

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    const chatActions = page.locator('.chat-actions');
    await expect(chatActions).toBeVisible({ timeout: 10000 });

    const memoryBtn = chatActions.locator('button').filter({ hasText: /Memory/i });
    await expect(memoryBtn).toBeVisible();
  });

  test('emotion state displays in chat subtitle', async ({ page }) => {
    await setupAuth(page);
    await page.addInitScript(() => { localStorage.setItem('lastChatId', 'chat_1'); });
    await mockIntelligenceEndpoints(page);

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    const chatSubtitle = page.locator('.chat-subtitle');
    await expect(chatSubtitle).toBeVisible({ timeout: 10000 });
    await expect(chatSubtitle).toContainText(/content/i);
  });
});
