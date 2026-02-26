import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle, mockApiResponse, setupAuth, mockCommonEndpoints, mockChatEndpoints, gotoWithAuth } from './utils/helpers';

/**
 * E2E Tests: Chat Features
 *
 * 4 smoke tests for new-chat button, message input text entry,
 * sidebar collapse on mobile, and message bubble rendering.
 * All API responses are mocked.
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

const MESSAGES_WITH_CONTENT = {
  success: true,
  data: [
    { id: 'msg_1', chatId: 'chat_1', role: 'user', content: 'Hello', sentAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'msg_2', chatId: 'chat_1', role: 'assistant', content: 'Hi there!', sentAt: '2026-01-01T00:01:00Z', createdAt: '2026-01-01T00:01:00Z' },
  ],
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

async function setupChatMocks(page: import('@playwright/test').Page) {
  await mockApiResponse(page, '**/api/v1/chats', CHATS_LIST);
  await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
  await mockApiResponse(page, '**/api/v1/chat-templates*', { success: true, data: [] });
  await mockApiResponse(page, '**/api/v1/csrf-token', { csrfToken: 'fake-csrf-token' });
  await mockCommonEndpoints(page);
}

test.describe('Chat Features', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('new chat button exists in sidebar', async ({ page }) => {
    await setupAuth(page);
    await setupChatMocks(page);

    await gotoWithAuth(page, '/chat');

    await expect(page.locator('.sidebar-header .el-button--primary')).toBeVisible({ timeout: 10000 });
  });

  test('message input accepts text', async ({ page }) => {
    await setupAuth(page);
    // Set lastChatId so Chat.vue auto-selects this chat
    await page.addInitScript(() => { localStorage.setItem('lastChatId', 'chat_1'); });

    // Catch-all FIRST: prevent any unmocked API call from hitting real server (401 → redirect to /login)
    // Playwright matches routes in LIFO order, so this catch-all must be registered BEFORE specific mocks
    await page.route('**/api/v1/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
    });

    await setupChatMocks(page);
    await mockApiResponse(page, '**/api/v1/chats/chat_1/messages*', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/chats/chat_1/characters', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/emotion*', { success: true, data: { current: { valence: 0.5, arousal: 0.3, label: 'content' }, history: [] } });
    await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/memories*', { success: true, data: { memories: [], total: 0 } });

    await gotoWithAuth(page, '/chat');

    const textarea = page.getByRole('textbox', { name: 'Type your message...' });
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('Hello world');
    await expect(textarea).toHaveValue('Hello world');
  });

  test('chat sidebar is collapsible on mobile', async ({ page }) => {
    await setupAuth(page);
    await setupChatMocks(page);

    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoWithAuth(page, '/chat');
    await expect(page.locator('.chat-sidebar-wrapper')).toBeVisible();

    // Switch to mobile viewport — sidebar should be off-screen (translateX(-100%))
    await page.setViewportSize({ width: 375, height: 667 });
    // On mobile, the sidebar gets class 'mobile-closed' and transforms off-screen
    await expect(page.locator('.chat-sidebar-wrapper.mobile-closed')).toBeAttached({ timeout: 3000 });
  });

  test('chat with messages renders message wrappers', async ({ page }) => {
    await setupAuth(page);
    await page.addInitScript(() => { localStorage.setItem('lastChatId', 'chat_1'); });
    await setupChatMocks(page);
    await mockApiResponse(page, '**/api/v1/chats/chat_1/messages*', MESSAGES_WITH_CONTENT);
    await mockApiResponse(page, '**/api/v1/chats/chat_1/characters', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/emotion*', { success: true, data: { current: { valence: 0.5, arousal: 0.3, label: 'content' }, history: [] } });
    await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/memories*', { success: true, data: { memories: [], total: 0 } });

    await gotoWithAuth(page, '/chat');

    const messages = page.locator('.message-wrapper, .message-bubble');
    await expect(messages.first()).toBeVisible({ timeout: 10000 });
    const count = await messages.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
