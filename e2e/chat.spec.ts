import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle, mockApiResponse, setupAuth } from './utils/helpers';

/**
 * E2E Tests: Chat Page
 *
 * 5 smoke tests for the chat layout, sidebar, welcome state, chat list,
 * message input, and auth guard.  All API responses are mocked.
 */

const CHATS_LIST = {
  success: true,
  data: [
    { id: 'chat_1', characterId: 'char_1', characterName: 'Test Character', title: 'Test Chat', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'chat_2', characterId: 'char_2', characterName: 'Second Character', title: 'Second Chat', createdAt: '2026-01-02T00:00:00Z' },
  ],
  meta: { timestamp: new Date().toISOString() },
};

const CHARACTERS = {
  success: true,
  data: [
    { id: 'char_1', name: 'Test Character', description: 'A test character', greeting: 'Hello!', avatar: null },
  ],
};

const NOTIFICATIONS_COUNT = { success: true, data: { count: 0 } };
const NOTIFICATIONS_LIST = { success: true, data: [] };

test.describe('Chat Page', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  // 1. Chat page loads with sidebar
  test('chat page loads with sidebar', async ({ page }) => {
    await setupAuth(page);
    await mockApiResponse(page, '**/api/v1/chats', CHATS_LIST);
    await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', NOTIFICATIONS_COUNT);
    await mockApiResponse(page, '**/api/v1/notifications*', NOTIFICATIONS_LIST);

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    await expect(page.locator('.chat-layout')).toBeVisible();
    await expect(page.locator('.chat-sidebar-wrapper')).toBeVisible();
  });

  // 2. Empty chat shows welcome/empty state
  test('empty chat shows welcome state', async ({ page }) => {
    await setupAuth(page);
    await mockApiResponse(page, '**/api/v1/chats', { success: true, data: [], meta: { timestamp: new Date().toISOString() } });
    await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', NOTIFICATIONS_COUNT);
    await mockApiResponse(page, '**/api/v1/notifications*', NOTIFICATIONS_LIST);

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    await expect(page.locator('.welcome-page')).toBeVisible();
  });

  // 3. Chat list renders
  test('chat list renders items in sidebar', async ({ page }) => {
    await setupAuth(page);
    await mockApiResponse(page, '**/api/v1/chats', CHATS_LIST);
    await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', NOTIFICATIONS_COUNT);
    await mockApiResponse(page, '**/api/v1/notifications*', NOTIFICATIONS_LIST);

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    const chatItems = page.locator('.chat-item');
    await expect(chatItems.first()).toBeVisible({ timeout: 10000 });
    const count = await chatItems.count();
    expect(count).toBe(2);
  });

  // 4. Message input is visible
  test('message input is visible in active chat', async ({ page }) => {
    await setupAuth(page);
    await mockApiResponse(page, '**/api/v1/chats', CHATS_LIST);
    await mockApiResponse(page, '**/api/v1/chats/chat_1', {
      success: true,
      data: { id: 'chat_1', characterId: 'char_1', characterName: 'Test Character', title: 'Test Chat', createdAt: '2026-01-01T00:00:00Z' },
      meta: { timestamp: new Date().toISOString() },
    });
    await mockApiResponse(page, '**/api/v1/chats/chat_1/messages*', {
      success: true,
      data: { messages: [], hasMore: false },
      meta: { timestamp: new Date().toISOString() },
    });
    await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
    await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/emotion', { success: true, data: { valence: 0.5, arousal: 0.3, label: 'content' } });
    await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/memories', { success: true, data: { memories: [], total: 0 } });
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', NOTIFICATIONS_COUNT);
    await mockApiResponse(page, '**/api/v1/notifications*', NOTIFICATIONS_LIST);

    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    await expect(page.locator('.message-input')).toBeVisible({ timeout: 10000 });
  });

  // 5. Chat requires auth
  test('chat requires authentication', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForURL(/\/auth\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/auth/login');
  });
});
