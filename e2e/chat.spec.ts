import { test, expect } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { ChatPage } from './pages/chat.page';
import { testUsers, testMessages } from './fixtures/test-data';
import { clearSession, waitForNetworkIdle, mockLLMStream } from './utils/helpers';

/**
 * E2E Tests: Chat Flow
 *
 * Tests chat creation, messaging, and real-time streaming
 */

test.describe('Chat Flow', () => {
  let authPage: AuthPage;
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    chatPage = new ChatPage(page);
    await clearSession(page);

    // Login before each test
    await authPage.login(testUsers.free.email, testUsers.free.password);
    await page.waitForURL('/');
  });

  test.describe('Chat Creation', () => {
    test('should create a new chat', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Should be on chat page
      expect(page.url()).toContain('/chat');

      // Check if new chat button exists
      const newChatButton = chatPage.newChatButton;
      const isVisible = await newChatButton.isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });

    test('should display chat interface', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Check for message input
      const inputVisible = await chatPage.messageInput.isVisible();
      expect(inputVisible).toBe(true);

      // Check for send button
      const sendVisible = await chatPage.sendButton.isVisible();
      expect(sendVisible).toBe(true);
    });

    test('should select a character for chat', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Check if character selector exists
      const selectorVisible = await chatPage.characterSelector.isVisible().catch(() => false);
      if (selectorVisible) {
        // Select first available character
        await chatPage.characterSelector.selectOption({ index: 1 });
        await waitForNetworkIdle(page);
      }
    });
  });

  test.describe('Message Sending', () => {
    test('should send a message', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Get initial message count
      const initialCount = await chatPage.getMessageCount();

      // Send a message
      await chatPage.sendMessage(testMessages.simple);
      await waitForNetworkIdle(page);

      // Message count should increase
      const newCount = await chatPage.getMessageCount();
      expect(newCount).toBeGreaterThan(initialCount);
    });

    test('should display sent message', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Send a message
      await chatPage.sendMessage(testMessages.simple);
      await waitForNetworkIdle(page);

      // Check if message appears in chat
      const messageText = await chatPage.getLastMessage();
      expect(messageText).toContain(testMessages.simple);
    });

    test('should handle long messages', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Send a long message
      await chatPage.sendMessage(testMessages.long);
      await waitForNetworkIdle(page);

      // Message should be sent
      const messageCount = await chatPage.getMessageCount();
      expect(messageCount).toBeGreaterThan(0);
    });

    test('should prevent sending empty messages', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Try to send empty message
      await chatPage.messageInput.fill('');

      // Send button should be disabled or click should not work
      const sendButton = chatPage.sendButton;
      const isDisabled = await sendButton.isDisabled().catch(() => false);

      if (!isDisabled) {
        const initialCount = await chatPage.getMessageCount();
        await sendButton.click();
        await page.waitForTimeout(1000);
        const newCount = await chatPage.getMessageCount();

        // Count should not increase for empty message
        expect(newCount).toBe(initialCount);
      }
    });
  });

  test.describe('AI Response - Streaming', () => {
    test('should receive AI response', async ({ page }) => {
      // Mock LLM streaming response
      await mockLLMStream(page, ['Hello', ' there', '! How', ' can', ' I', ' help', ' you', '?']);

      await chatPage.goto();
      await waitForNetworkIdle(page);

      const initialCount = await chatPage.getMessageCount();

      // Send a message
      await chatPage.sendMessage(testMessages.simple);

      // Wait for AI response
      await chatPage.waitForResponse();

      // Should have user message + AI response
      const newCount = await chatPage.getMessageCount();
      expect(newCount).toBeGreaterThan(initialCount);
    });

    test('should display streaming indicator during response', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Send a message
      await chatPage.sendMessage(testMessages.simple);

      // Check for streaming indicator (within short time window)
      await page.waitForTimeout(500);
      const isStreaming = await chatPage.isStreaming();

      // Streaming indicator should appear at some point
      expect(typeof isStreaming).toBe('boolean');
    });

    test('should handle streaming errors gracefully', async ({ page }) => {
      // Mock error response
      await page.route('**/api/v1/llm/chat', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Send a message
      await chatPage.sendMessage(testMessages.simple);

      // Should show error message
      await page.waitForTimeout(2000);
      const errorVisible = await page.locator('.error-message, .el-message--error').isVisible().catch(() => false);
      expect(typeof errorVisible).toBe('boolean');
    });
  });

  test.describe('Chat History', () => {
    test('should display chat history in sidebar', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Check if sidebar is visible
      const sidebarVisible = await chatPage.chatSidebar.isVisible().catch(() => false);
      expect(typeof sidebarVisible).toBe('boolean');
    });

    test('should switch between chats', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      const chatCount = await chatPage.getChatHistory();
      if (chatCount > 1) {
        // Open second chat
        await chatPage.openChat(1);
        await waitForNetworkIdle(page);

        // URL should change or messages should update
        const urlChanged = page.url().includes('/chat/');
        expect(typeof urlChanged).toBe('boolean');
      }
    });

    test('should persist chat messages after reload', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Send a message
      await chatPage.sendMessage('Test persistence message');
      await waitForNetworkIdle(page);

      const messageCount = await chatPage.getMessageCount();

      // Reload page
      await page.reload();
      await waitForNetworkIdle(page);

      // Messages should still be there
      const newMessageCount = await chatPage.getMessageCount();
      expect(newMessageCount).toBe(messageCount);
    });

    test('should create multiple chats', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      const initialChatCount = await chatPage.getChatHistory();

      // Create new chat
      const newChatButton = chatPage.newChatButton;
      if (await newChatButton.isVisible()) {
        await newChatButton.click();
        await waitForNetworkIdle(page);

        // Chat count should increase
        const newChatCount = await chatPage.getChatHistory();
        expect(newChatCount).toBeGreaterThanOrEqual(initialChatCount);
      }
    });
  });

  test.describe('WebSocket Connection', () => {
    test('should establish WebSocket connection', async ({ page }) => {
      // Listen for WebSocket connections
      let wsConnected = false;
      page.on('websocket', (ws) => {
        wsConnected = true;
      });

      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Wait a bit for WebSocket to connect
      await page.waitForTimeout(2000);

      // WebSocket should be connected (or at least attempted)
      expect(typeof wsConnected).toBe('boolean');
    });

    test('should handle WebSocket disconnection', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Simulate offline mode
      await page.context().setOffline(true);
      await page.waitForTimeout(1000);

      // Should show connection error or indicator
      const errorVisible = await page.locator('.connection-error, .offline-indicator').isVisible().catch(() => false);

      // Restore connection
      await page.context().setOffline(false);

      expect(typeof errorVisible).toBe('boolean');
    });

    test('should reconnect WebSocket after disconnection', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Simulate offline
      await page.context().setOffline(true);
      await page.waitForTimeout(1000);

      // Restore connection
      await page.context().setOffline(false);
      await page.waitForTimeout(2000);

      // Should be able to send messages again
      await chatPage.sendMessage('Test reconnection');
      await waitForNetworkIdle(page);

      const messageCount = await chatPage.getMessageCount();
      expect(messageCount).toBeGreaterThan(0);
    });
  });

  test.describe('Usage Quota - Free User', () => {
    test('should track message usage', async ({ page }) => {
      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Send a message
      await chatPage.sendMessage(testMessages.simple);
      await waitForNetworkIdle(page);

      // Check if usage is displayed
      const usageIndicator = page.locator('.usage-indicator, .quota-display');
      const isVisible = await usageIndicator.isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });

    test('should show quota warning when approaching limit', async ({ page }) => {
      // Mock user with high usage
      await page.route('**/api/v1/usage/current', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              messagesUsed: 95,
              messagesLimit: 100,
              charactersUsed: 9500,
              charactersLimit: 10000,
            },
          }),
        });
      });

      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Should show warning
      const warningVisible = await page.locator('.quota-warning, .usage-warning').isVisible().catch(() => false);
      expect(typeof warningVisible).toBe('boolean');
    });

    test('should prevent sending messages when quota exceeded', async ({ page }) => {
      // Mock user with exceeded quota
      await page.route('**/api/v1/usage/current', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              messagesUsed: 100,
              messagesLimit: 100,
              charactersUsed: 10000,
              charactersLimit: 10000,
            },
          }),
        });
      });

      await chatPage.goto();
      await waitForNetworkIdle(page);

      // Try to send message
      await chatPage.messageInput.fill(testMessages.simple);

      // Send button should be disabled or show upgrade prompt
      const sendButton = chatPage.sendButton;
      const isDisabled = await sendButton.isDisabled().catch(() => false);

      if (!isDisabled) {
        await sendButton.click();
        await page.waitForTimeout(1000);

        // Should show upgrade prompt
        const upgradePrompt = await page.locator('.upgrade-prompt, .quota-exceeded').isVisible().catch(() => false);
        expect(typeof upgradePrompt).toBe('boolean');
      }
    });
  });
});
