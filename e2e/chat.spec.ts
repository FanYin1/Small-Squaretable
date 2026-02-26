import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle, mockApiResponse, setupAuth } from './utils/helpers';

/**
 * E2E Tests: Chat Page
 *
 * 5 smoke tests for the chat layout, sidebar, welcome state, chat list,
 * message input, and auth guard.  All API responses are mocked.
 */

const PAGINATION = { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false };

const CHATS_LIST = {
  success: true,
  data: {
    items: [
      { id: 'chat_1', tenantId: 'tenant_1', userId: 'user_1', characterId: 'char_1', title: 'Test Chat', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'chat_2', tenantId: 'tenant_1', userId: 'user_1', characterId: 'char_2', title: 'Second Chat', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    ],
    pagination: PAGINATION,
  },
};

const EMPTY_CHATS = {
  success: true,
  data: { items: [], pagination: { ...PAGINATION, total: 0, totalPages: 0 } },
};

const CHARACTERS = {
  success: true,
  data: {
    items: [
      { id: 'char_1', name: 'Test Character', description: 'A test character', greeting: 'Hello!', avatarUrl: null, tags: [], isPublic: false, creatorId: 'user_1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ],
    pagination: { ...PAGINATION, total: 1 },
  },
};

const SINGLE_CHAT = {
  success: true,
  data: { id: 'chat_1', tenantId: 'tenant_1', userId: 'user_1', characterId: 'char_1', title: 'Test Chat', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
};

const MESSAGES = {
  success: true,
  data: [],
};

const NOTIFICATIONS_COUNT = { success: true, data: { count: 0 } };
const NOTIFICATIONS_LIST = { success: true, data: [] };

/** Mock all common endpoints for chat page */
async function mockChatPage(page: import('@playwright/test').Page) {
  await mockApiResponse(page, '**/api/v1/chats', CHATS_LIST);
  await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
  await mockApiResponse(page, '**/api/v1/notifications/unread-count', NOTIFICATIONS_COUNT);
  await mockApiResponse(page, '**/api/v1/notifications*', NOTIFICATIONS_LIST);
  await mockApiResponse(page, '**/api/v1/chat-templates*', { success: true, data: [] });
  await mockApiResponse(page, '**/api/v1/auth/ws-ticket', { success: true, data: { ticket: 'fake' } });
}

test.describe('Chat Page', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('chat page loads with sidebar', async ({ page }) => {
    await setupAuth(page);
    await mockChatPage(page);

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    await expect(page.locator('.chat-layout')).toBeVisible();
    await expect(page.locator('.chat-sidebar-wrapper')).toBeVisible();
  });

  test('empty chat shows welcome state', async ({ page }) => {
    await setupAuth(page);
    await mockApiResponse(page, '**/api/v1/chats', EMPTY_CHATS);
    await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', NOTIFICATIONS_COUNT);
    await mockApiResponse(page, '**/api/v1/notifications*', NOTIFICATIONS_LIST);
    await mockApiResponse(page, '**/api/v1/chat-templates*', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/auth/ws-ticket', { success: true, data: { ticket: 'fake' } });

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    await expect(page.locator('.welcome-page')).toBeVisible();
  });

  test('chat list renders items in sidebar', async ({ page }) => {
    await setupAuth(page);
    await mockChatPage(page);

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    const chatItems = page.locator('.chat-item');
    await expect(chatItems.first()).toBeVisible({ timeout: 10000 });
    const count = await chatItems.count();
    expect(count).toBe(2);
  });

  test('message input is visible in active chat', async ({ page }) => {
    await setupAuth(page);
    // Set lastChatId so Chat.vue auto-selects this chat on mount
    await page.addInitScript(() => {
      localStorage.setItem('lastChatId', 'chat_1');
    });
    await mockApiResponse(page, '**/api/v1/chats/chat_1/messages*', MESSAGES);
    await mockApiResponse(page, '**/api/v1/chats/chat_1/characters', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/emotion*', { success: true, data: { current: { valence: 0.5, arousal: 0.3, label: 'content' }, history: [] } });
    await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/memories*', { success: true, data: { memories: [], total: 0 } });
    await mockChatPage(page);

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    await expect(page.locator('.message-input')).toBeVisible({ timeout: 10000 });
  });

  test('chat requires authentication', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForURL(/\/auth\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/auth/login');
  });
});
