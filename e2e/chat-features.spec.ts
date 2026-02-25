import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { generateUniqueUser } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockApiResponse } from './utils/helpers';

/**
 * E2E Tests: Chat Features (Iterations 23-25, 45)
 *
 * Smoke tests for message actions, reactions, reply, pin,
 * bookmark, export, and pinned-messages header button.
 *
 * All API responses are mocked — no live backend required.
 */

const AUTH_MOCK = {
  success: true,
  data: {
    user: {
      id: 'user_1',
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'user',
      tenantId: 'tenant_1',
      plan: 'pro',
    },
  },
};

const CHAT_MOCK = {
  success: true,
  data: {
    id: 'chat_1',
    characterId: 'char_1',
    characterName: 'Test Character',
    title: 'Test Chat',
    createdAt: '2026-02-20T12:00:00Z',
  },
  meta: { timestamp: new Date().toISOString() },
};

const CHATS_LIST_MOCK = {
  success: true,
  data: [CHAT_MOCK.data],
  meta: { timestamp: new Date().toISOString() },
};

const MESSAGES_MOCK = {
  success: true,
  data: {
    messages: [
      { id: '1', role: 'user', content: 'Hello', createdAt: '2026-02-20T12:00:00Z', extra: null },
      { id: '2', role: 'assistant', content: 'Hi there!', createdAt: '2026-02-20T12:01:00Z', extra: null },
    ],
    hasMore: false,
  },
  meta: { timestamp: new Date().toISOString() },
};

const CHARACTERS_MOCK = {
  success: true,
  data: [
    { id: 'char_1', name: 'Test Character', description: 'A test character', greeting: 'Hello!', avatar: null },
  ],
};

const EMOTION_MOCK = {
  success: true,
  data: { valence: 0.5, arousal: 0.3, label: 'content' },
};

test.describe('Chat Features', () => {
  test.beforeEach(async ({ page }) => {
    // Mock all API endpoints so tests don't need a live backend
    await mockApiResponse(page, '**/api/v1/auth/me', AUTH_MOCK);
    await mockApiResponse(page, '**/api/v1/auth/register', AUTH_MOCK);
    await mockApiResponse(page, '**/api/v1/auth/refresh', AUTH_MOCK);
    await mockApiResponse(page, '**/api/v1/chats', CHATS_LIST_MOCK);
    await mockApiResponse(page, '**/api/v1/chats/chat_1', CHAT_MOCK);
    await mockApiResponse(page, '**/api/v1/chats/chat_1/messages*', MESSAGES_MOCK);
    await mockApiResponse(page, '**/api/v1/chats/chat_1/messages', MESSAGES_MOCK);
    await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS_MOCK);
    await mockApiResponse(page, '**/api/v1/characters', CHARACTERS_MOCK);
    await mockApiResponse(page, '**/api/v1/notifications/unread-count', { success: true, data: { count: 0 } });
    await mockApiResponse(page, '**/api/v1/notifications*', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/emotion', EMOTION_MOCK);
    await mockApiResponse(page, '**/api/v1/characters/char_1/intelligence/memories', { success: true, data: [] });

    const authPage = new AuthPage(page);
    await clearSession(page);
    const testUser = generateUniqueUser();
    await authPage.register(testUser.email, testUser.password, testUser.name);
    await page.waitForURL(/\/chat|\/dashboard|\/$/, { timeout: 15000 });
    await waitForNetworkIdle(page);
  });

  test('message bubble renders with reaction bar', async ({ page }) => {
    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    // Messages should be rendered
    const messages = page.locator('.message');
    await expect(messages.first()).toBeVisible({ timeout: 10000 });

    // The reaction bar is always rendered inside each message
    const reactionBar = page.locator('.reaction-bar').first();
    await expect(reactionBar).toBeVisible();
  });

  test('message actions contain reply button', async ({ page }) => {
    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    // Wait for messages to render
    const message = page.locator('.message').first();
    await expect(message).toBeVisible({ timeout: 10000 });

    // Hover to reveal actions (they are opacity:0 by default)
    await message.hover();
    await page.waitForTimeout(300);

    // The reply button uses aria-label containing the reply text
    const replyBtn = page.locator('.message-actions .action-btn[aria-label]').filter({ hasText: /Reply|回复/ });
    const isVisible = await replyBtn.isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });

  test('message actions contain pin button', async ({ page }) => {
    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    const message = page.locator('.message').first();
    await expect(message).toBeVisible({ timeout: 10000 });
    await message.hover();
    await page.waitForTimeout(300);

    // Pin button has aria-label for pin/unpin
    const pinBtn = page.locator('.message-actions .action-btn').filter({ hasText: /Pin|固定|Unpin/ });
    const isVisible = await pinBtn.isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });

  test('message actions contain bookmark button', async ({ page }) => {
    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    const message = page.locator('.message').first();
    await expect(message).toBeVisible({ timeout: 10000 });
    await message.hover();
    await page.waitForTimeout(300);

    const bookmarkBtn = page.locator('.message-actions .action-btn').filter({ hasText: /Bookmark|收藏|Bookmarked/ });
    const isVisible = await bookmarkBtn.isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });

  test('chat header has export dropdown', async ({ page }) => {
    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    // Wait for chat header to render (it only shows when currentChat is set)
    const chatHeader = page.locator('.chat-header');
    await expect(chatHeader).toBeVisible({ timeout: 10000 });

    // The export dropdown uses an el-dropdown with a Download icon button
    const exportDropdown = chatHeader.locator('.el-dropdown').first();
    const isVisible = await exportDropdown.isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });

  test('chat header has pinned messages button', async ({ page }) => {
    await page.goto('/chat/chat_1');
    await waitForNetworkIdle(page);

    const chatHeader = page.locator('.chat-header');
    await expect(chatHeader).toBeVisible({ timeout: 10000 });

    // The pinned messages button is an el-button in .chat-actions
    const chatActions = chatHeader.locator('.chat-actions');
    await expect(chatActions).toBeVisible();

    // Look for the button that contains the pinned messages text
    const pinnedBtn = chatActions.locator('button').filter({ hasText: /Pinned|固定消息|pinnedMessages/ });
    const isVisible = await pinnedBtn.isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });
});
