import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Chat Interface
 *
 * Encapsulates chat page interactions
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

  constructor(page: Page) {
    this.page = page;
    this.messageInput = page.locator('textarea[placeholder*="message"], textarea[placeholder*="消息"]');
    this.sendButton = page.locator('button:has-text("Send"), button:has-text("发送")');
    this.messages = page.locator('.message, .message-bubble');
    this.chatSidebar = page.locator('.chat-sidebar, .sidebar');
    this.newChatButton = page.locator('button:has-text("New Chat"), button:has-text("新建对话")');
    this.chatList = page.locator('.chat-list, .chat-item');
    this.characterSelector = page.locator('.character-selector, select[name="character"]');
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
    // Wait for AI response to appear
    await this.page.waitForSelector('.message.assistant, .message-bubble.assistant', { timeout });
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
    // Check if streaming indicator is visible
    const streamingIndicator = this.page.locator('.streaming-indicator, .typing-indicator');
    return await streamingIndicator.isVisible();
  }
}
