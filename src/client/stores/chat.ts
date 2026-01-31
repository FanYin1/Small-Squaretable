import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Chat, Message } from '@client/types';

export const useChatStore = defineStore('chat', () => {
  // State
  const chats = ref<Chat[]>([]);
  const currentChatId = ref<string | null>(null);
  const messages = ref<Message[]>([]);
  const loading = ref(false);
  const sending = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const currentChat = computed(() =>
    chats.value.find(c => c.id === currentChatId.value)
  );

  // Actions
  async function fetchChats(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      console.log('Fetch chats called (API integration in Task 4)');
      // TODO: Task 4 - API integration
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch chats';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMessages(chatId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      console.log('Fetch messages called (API integration in Task 4):', chatId);
      // TODO: Task 4 - API integration
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch messages';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function sendMessage(content: string): Promise<void> {
    if (!currentChatId.value) {
      throw new Error('No active chat');
    }
    sending.value = true;
    error.value = null;
    try {
      console.log('Send message called (API integration in Task 4):', content);
      // TODO: Task 4 - API integration
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to send message';
      throw e;
    } finally {
      sending.value = false;
    }
  }

  async function createChat(characterId: string): Promise<Chat> {
    loading.value = true;
    error.value = null;
    try {
      console.log('Create chat called (API integration in Task 4):', characterId);
      // TODO: Task 4 - API integration
      // Temporary mock
      const mockChat: Chat = {
        id: 'temp-' + Date.now(),
        title: 'New Chat',
        characterId,
        characterName: 'Character',
        createdAt: new Date().toISOString(),
      };
      return mockChat;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create chat';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteChat(chatId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      console.log('Delete chat called (API integration in Task 4):', chatId);
      // TODO: Task 4 - API integration
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete chat';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function setCurrentChat(chatId: string | null): void {
    currentChatId.value = chatId;
  }

  function addMessage(message: Message): void {
    messages.value.push(message);
  }

  function clearMessages(): void {
    messages.value = [];
  }

  return {
    chats,
    currentChatId,
    currentChat,
    messages,
    loading,
    sending,
    error,
    fetchChats,
    fetchMessages,
    sendMessage,
    createChat,
    deleteChat,
    setCurrentChat,
    addMessage,
    clearMessages,
  };
});
