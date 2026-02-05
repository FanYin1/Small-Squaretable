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
  readonly emptyState: Locator;
  readonly createChatButton: Locator;
  readonly newChatDialog: Locator;
  readonly dialogCharacterSelect: Locator;
  readonly dialogCreateButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Message input - Element Plus textarea inside .message-input container
    this.messageInput = page.locator('.message-input .el-textarea__inner');
    // Send button - matches "Send" or "Sending..." text
    this.sendButton = page.locator('.message-input button:has-text("Send")');
    // Messages in chat window - use the actual class from MessageBubble component
    this.messages = page.locator('.message-bubble');
    // Chat sidebar
    this.chatSidebar = page.locator('.chat-sidebar-container, .chat-sidebar');
    // New chat button in header (use the one with class new-chat-btn)
    this.newChatButton = page.locator('button.new-chat-btn, button:has-text("新建聊天")');
    // Chat list items in sidebar
    this.chatList = page.locator('.chat-list .chat-item');
    // Character selector in dialog
    this.characterSelector = page.locator('.el-select');
    // Empty state when no chat is selected
    this.emptyState = page.locator('.chat-empty');
    // Create chat button in empty state
    this.createChatButton = page.locator('.empty-content button:has-text("创建新聊天")');
    // New chat dialog
    this.newChatDialog = page.locator('.el-dialog:has-text("创建新聊天")');
    // Character select in dialog
    this.dialogCharacterSelect = page.locator('.el-dialog .el-select');
    // Create button in dialog
    this.dialogCreateButton = page.locator('.el-dialog button:has-text("创建聊天")');
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
    // Wait for AI response to appear - matches ChatWindow.vue streaming message class
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
    // Check if streaming indicator is visible - matches ChatWindow.vue classes
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
   * Create a new chat by opening dialog and selecting a character
   */
  async createChatWithCharacter(characterIndex: number = 0) {
    // Click new chat button
    await this.newChatButton.click();

    // Wait for dialog to appear
    await this.newChatDialog.waitFor({ state: 'visible', timeout: 5000 });

    // Click on character select dropdown
    await this.dialogCharacterSelect.click();

    // Wait for dropdown options to appear
    await this.page.waitForSelector('.el-select-dropdown__item', { state: 'visible', timeout: 5000 });

    // Select character by index (skip first empty option if any)
    const options = this.page.locator('.el-select-dropdown__item');
    const count = await options.count();
    if (count > characterIndex) {
      await options.nth(characterIndex).click();
    }

    // Click create button
    await this.dialogCreateButton.click();

    // Wait for dialog to close
    await this.newChatDialog.waitFor({ state: 'hidden', timeout: 10000 });
  }
}
