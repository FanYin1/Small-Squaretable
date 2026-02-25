import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle, mockApiResponse, setupAuth } from './utils/helpers';

/**
 * E2E Tests: Intelligence Features
 *
 * 3 smoke tests for the intelligence debug panel, memory panel,
 * and emotion state display.  All API responses are mocked.
 */

const CHAT_MOCK = {
  success: true,
  data: {
    id: 'chat_1',
    characterId: 'char_1',
    characterName: 'Test Character',
    title: 'Test Chat',
    createdAt: '2026-01-01T00:00:00Z',
  },
  meta: { timestamp: new Date().toISOString() },
};

const CHATS_LIST = {
  success: true,
  data: [CHAT_MOCK.data],
  meta: { timestamp: new Date().toISOString() },
};

const MESSAGES_MOCK = {
  success: true,
  data: {
    messages: [
      { id: 'msg_1', role: 'user', content: 'Hello', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'msg_2', role: 'assistant', content: 'Hi there!', createdAt: '2026-01-01T00:01:00Z' },
    ],
    hasMore: false,
  },
  meta: { timestamp: new Date().toISOString() },
};

const CHARACTERS = {
  success: true,
  data: [
    { id: 'char_1', name: 'Test Character', description: 'A test character', greeting: 'Hello!', avatar: null },
  ],
};

const EMOTION_MOCK = { success: true, data: { valence: 0.5, arousal: 0.3, label: 'content' } };
const MEMORIES_MOCK = { success: true, data: { memories: [], total: 0 } };
const DEBUG_MOCK = {
  success: true,
  data: { emotionState: { valence: 0.5, arousal: 0.3 }, memoryCount: 0, lastUpdated: '2026-01-01T00:00:00Z' },
};
const NOTIFICATIONS_COUNT = { success: true, data: { count: 0 } };
const NOTIFICATIONS_LIST = { success: true, data: [] };

/** Set up all common mocks needed for a chat with intelligence data. */
async function mockIntelligenceEndpoints(page: import('@playwright/test').Page) {
  await mockApiResponse(page, '**/api/v1/chats', CHATS_LIST);
  await mockApiResponse(page, '**/api/v1/chats/chat_1', CHAT_MOCK);
  await mockApiResponse(page, '**/api/v1/chats/chat_1/messages*', MESSAGES_MOCK);
  await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
  await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/emotion', EMOTION_MOCK);
  await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/memories', MEMORIES_MOCK);
  await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/debug', DEBUG_MOCK);
  await mockApiResponse(page, '**/api/v1/notifications/unread-count', NOTIFICATIONS_COUNT);
  await mockApiResponse(page, '**/api/v1/notifications*', NOTIFICATIONS_LIST);
}

test.describe('Intelligence Features', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  // 1. Intelligence debug panel accessible — debug button exists in .chat-actions
  test('intelligence debug button is accessible in chat actions', async ({ page }) => {
    await setupAuth(page);
    await mockIntelligenceEndpoints(page);

    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    // The chat header should render with action buttons
    const chatActions = page.locator('.chat-actions');
    await expect(chatActions).toBeVisible({ timeout: 10000 });

    // Debug button should exist inside .chat-actions
    const debugBtn = chatActions.locator('button').filter({ hasText: /Debug/i });
    await expect(debugBtn).toBeVisible();
  });

  // 2. Memory panel loads — memory button exists and debug panel elements are present
  test('memory button is accessible in chat actions', async ({ page }) => {
    await setupAuth(page);
    await mockIntelligenceEndpoints(page);

    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    const chatActions = page.locator('.chat-actions');
    await expect(chatActions).toBeVisible({ timeout: 10000 });

    // Memory button should exist inside .chat-actions
    const memoryBtn = chatActions.locator('button').filter({ hasText: /Memory/i });
    await expect(memoryBtn).toBeVisible();
  });

  // 3. Emotion state displays in chat subtitle
  test('emotion state displays in chat subtitle', async ({ page }) => {
    await setupAuth(page);
    await mockIntelligenceEndpoints(page);

    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    // The chat subtitle should show the emotion label from the mocked data
    const chatSubtitle = page.locator('.chat-subtitle');
    await expect(chatSubtitle).toBeVisible({ timeout: 10000 });
    // The mocked emotion label is "content"
    await expect(chatSubtitle).toContainText(/content/i);
  });
});
