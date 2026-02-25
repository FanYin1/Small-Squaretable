import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Chat Interface
 *
 * Selectors match the real Vue components:
 *   ChatLayout.vue  — .chat-layout, .chat-sidebar-wrapper, .chat-main
 *   ChatSidebar.vue — .chat-sidebar, .chat-item, new-chat button
 *   ChatWindow.vue  — .chat-window, .message-bubble, .message-wrapper
 *   MessageInput.vue — .message-input .el-textarea__inner
 *   WelcomePage.vue  — .welcome-page (shown when no chat selected)
 */
export class ChatPage {
  readonly page: Page;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly messages: Locator;
  readonly chatSidebar: Locator;
  readonly newChatButton: Locator;
  readonly chatList: Locator;
  readonly characterSelector: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    // Message input — Element Plus textarea inside .message-input container
    this.messageInput = page.locator('.message-input .el-textarea__inner');
    // Send button inside .message-input
    this.sendButton = page.locator('.message-input button.send-btn');
    // Messages in chat window — MessageBubble root is .message.message-{role}
    // ChatWindow also renders .message-bubble for greeting/streaming
    this.messages = page.locator('.message-bubble, .message-wrapper');
    // Chat sidebar wrapper
    this.chatSidebar = page.locator('.chat-sidebar-wrapper');
    // New chat button in ChatSidebar header (el-button with Plus icon)
    this.newChatButton = page.locator('.sidebar-header .el-button--primary');
    // Chat list items in sidebar
    this.chatList = page.locator('.chat-item');
    // Character selector (el-select in dialogs)
    this.characterSelector = page.locator('.el-select');
    // Empty/welcome state when no chat is selected
    this.emptyState = page.locator('.welcome-page');
  }

  async goto(chatId?: string) {
    if (chatId) {
      await this.page.goto(`/chat/${chatId}`);
    } else {
      await this.page.goto('/chat');
    }
  }

  async sendMessage(message: string) {
    await this.messageInput.fill(message);
    await this.sendButton.click();
  }

  async waitForResponse(timeout = 30000) {
    // Wait for AI response — streaming bubble or typing indicator
    await this.page.waitForSelector('.message-bubble.streaming, .typing-indicator', { timeout });
  }

  async getMessageCount(): Promise<number> {
    return await this.messages.count();
  }

  async getLastMessage(): Promise<string> {
    const lastMessage = this.messages.last();
    return await lastMessage.textContent() || '';
  }

  async createNewChat() {
    await this.newChatButton.click();
  }

  async selectCharacter(characterName: string) {
    await this.characterSelector.selectOption({ label: characterName });
  }

  async getChatHistory(): Promise<number> {
    return await this.chatList.count();
  }

  async openChat(index: number) {
    await this.chatList.nth(index).click();
  }

  async isStreaming(): Promise<boolean> {
    const streamingIndicator = this.page.locator('.streaming, .typing-indicator, .typing-cursor');
    return await streamingIndicator.isVisible();
  }

  async isEmptyState(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  async hasMessageInput(): Promise<boolean> {
    return await this.messageInput.isVisible();
  }

  /**
   * Create a new chat by clicking a character card on the WelcomePage.
   * WelcomePage shows character cards inline — clicking one creates a chat.
   */
  async createChatWithCharacter(characterIndex: number = 0) {
    // WelcomePage renders character cards in .character-grid
    const cards = this.page.locator('.welcome-page .character-card');
    const count = await cards.count();
    if (count > characterIndex) {
      await cards.nth(characterIndex).click();
    }
  }
}
