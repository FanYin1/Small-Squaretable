import { test, expect } from '@playwright/test';
import { clearSession, waitForNetworkIdle, mockApiResponse, setupAuth } from './utils/helpers';

/**
 * E2E Tests: Chat Features
 *
 * 4 smoke tests for new-chat button, message input text entry,
 * sidebar collapse on mobile, and message bubble rendering.
 * All API responses are mocked.
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
const NOTIFICATIONS_COUNT = { success: true, data: { count: 0 } };
const NOTIFICATIONS_LIST = { success: true, data: [] };

/** Set up all common mocks needed for the chat page. */
async function mockChatEndpoints(page: import('@playwright/test').Page) {
  await mockApiResponse(page, '**/api/v1/chats', CHATS_LIST);
  await mockApiResponse(page, '**/api/v1/chats/chat_1', CHAT_MOCK);
  await mockApiResponse(page, '**/api/v1/chats/chat_1/messages*', MESSAGES_MOCK);
  await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
  await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/emotion', EMOTION_MOCK);
  await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/memories', MEMORIES_MOCK);
  await mockApiResponse(page, '**/api/v1/notifications/unread-count', NOTIFICATIONS_COUNT);
  await mockApiResponse(page, '**/api/v1/notifications*', NOTIFICATIONS_LIST);
}

test.describe('Chat Features', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  // 1. New chat button exists
  test('new chat button exists in sidebar', async ({ page }) => {
    await setupAuth(page);
    await mockChatEndpoints(page);

    await page.goto('/chat');
    await waitForNetworkIdle(page);

    await expect(page.locator('.sidebar-header .el-button--primary')).toBeVisible({ timeout: 10000 });
  });

  // 2. Message input accepts text
  test('message input accepts text', async ({ page }) => {
    await setupAuth(page);
    await mockChatEndpoints(page);

    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    const textarea = page.locator('.message-input .el-textarea__inner');
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('Hello world');
    await expect(textarea).toHaveValue('Hello world');
  });

  // 3. Chat sidebar is collapsible on mobile
  test('chat sidebar is collapsible on mobile', async ({ page }) => {
    await setupAuth(page);
    await mockChatEndpoints(page);

    // Start at desktop so sidebar is visible
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/chat');
    await waitForNetworkIdle(page);
    await expect(page.locator('.chat-sidebar-wrapper')).toBeVisible();

    // Switch to mobile viewport — sidebar should collapse / hide
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('.chat-sidebar-wrapper')).not.toBeVisible({ timeout: 2000 });
  });

  // 4. Chat with messages renders bubbles
  test('chat with messages renders message wrappers', async ({ page }) => {
    await setupAuth(page);
    await mockChatEndpoints(page);

    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    // Wait for at least one message wrapper or bubble to appear
    const messages = page.locator('.message-wrapper, .message-bubble');
    await expect(messages.first()).toBeVisible({ timeout: 10000 });
    const count = await messages.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
