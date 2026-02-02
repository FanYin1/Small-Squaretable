import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Chat, Message } from '@client/types';
import { chatApi, ApiError } from '@client/services';
import { WebSocketClient } from '@client/services/websocket';
import { WSConnectionState } from '../../types/websocket';

export const useChatStore = defineStore('chat', () => {
  // State
  const chats = ref<Chat[]>([]);
  const currentChatId = ref<string | null>(null);
  const messages = ref<Message[]>([]);
  const loading = ref(false);
  const sending = ref(false);
  const error = ref<string | null>(null);
  const wsConnected = ref(false);
  const streamingMessage = ref<string>('');
  const isStreaming = ref(false);

  // WebSocket client
  let wsClient: WebSocketClient | null = null;

  // Getters
  const currentChat = computed(() =>
    chats.value.find(c => c.id === currentChatId.value)
  );

  /**
   * 初始化 WebSocket 连接
   */
  function initWebSocket(token: string): void {
    if (wsClient) {
      return; // Already initialized
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    wsClient = new WebSocketClient({
      url: wsUrl,
      token,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
    });

    // 连接状态变化
    wsClient.on('stateChange', (data: unknown) => {
      const state = data as WSConnectionState;
      wsConnected.value = state === WSConnectionState.CONNECTED;
    });

    // 连接成功
    wsClient.on('connected', () => {
      console.log('WebSocket connected');
      // 如果有当前聊天，加入聊天室
      if (currentChatId.value) {
        wsClient?.joinChat(currentChatId.value);
      }
    });

    // 断开连接
    wsClient.on('disconnected', () => {
      console.log('WebSocket disconnected');
    });

    // 接收用户消息
    wsClient.on('userMessage', (data: unknown) => {
      const msgData = data as { messageId: string; chatId: string; content: string };
      const message: Message = {
        id: msgData.messageId,
        chatId: msgData.chatId,
        role: 'user',
        content: msgData.content,
        createdAt: new Date().toISOString(),
      };
      messages.value.push(message);
    });

    // 接收助手消息块（流式）
    wsClient.on('assistantMessageChunk', (data: unknown) => {
      const chunkData = data as { chunk: string };
      if (!isStreaming.value) {
        isStreaming.value = true;
        streamingMessage.value = '';
      }
      streamingMessage.value += chunkData.chunk;
    });

    // 助手消息完成
    wsClient.on('assistantMessageDone', (data: unknown) => {
      const doneData = data as { messageId: string; chatId: string };
      if (isStreaming.value) {
        const message: Message = {
          id: doneData.messageId,
          chatId: doneData.chatId,
          role: 'assistant',
          content: streamingMessage.value,
          createdAt: new Date().toISOString(),
        };
        messages.value.push(message);
        streamingMessage.value = '';
        isStreaming.value = false;
        sending.value = false;
      }
    });

    // 错误处理
    wsClient.on('error', (data: unknown) => {
      const errorData = data as { message: string };
      console.error('WebSocket error:', errorData);
      error.value = errorData.message;
      sending.value = false;
      isStreaming.value = false;
    });

    wsClient.connect();
  }

  /**
   * 断开 WebSocket
   */
  function disconnectWebSocket(): void {
    if (wsClient) {
      wsClient.disconnect();
      wsClient = null;
    }
    wsConnected.value = false;
  }

  // Actions
  async function fetchChats(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await chatApi.getChats();
      chats.value = response.chats;
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message;
      } else {
        error.value = e instanceof Error ? e.message : 'Failed to fetch chats';
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMessages(chatId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await chatApi.getMessages(chatId);
      messages.value = response.messages;
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message;
      } else {
        error.value = e instanceof Error ? e.message : 'Failed to fetch messages';
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function sendMessage(content: string): Promise<void> {
    if (!currentChatId.value) {
      throw new Error('No active chat');
    }

    // 如果 WebSocket 已连接，使用 WebSocket 发送
    if (wsConnected.value && wsClient) {
      sending.value = true;
      error.value = null;

      // 立即添加用户消息到界面
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        chatId: currentChatId.value,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };
      messages.value.push(userMessage);

      // 通过 WebSocket 发送
      wsClient.sendMessage(currentChatId.value, content);
    } else {
      // 降级到 HTTP API
      sending.value = true;
      error.value = null;
      try {
        const response = await chatApi.sendMessage(currentChatId.value, { content });
        messages.value.push(response.message);
      } catch (e) {
        if (e instanceof ApiError) {
          error.value = e.message;
        } else {
          error.value = e instanceof Error ? e.message : 'Failed to send message';
        }
        throw e;
      } finally {
        sending.value = false;
      }
    }
  }

  async function createChat(characterId: string, title?: string): Promise<Chat> {
    loading.value = true;
    error.value = null;
    try {
      const response = await chatApi.createChat({ characterId, title });
      chats.value.unshift(response.chat);
      return response.chat;
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message;
      } else {
        error.value = e instanceof Error ? e.message : 'Failed to create chat';
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteChat(chatId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await chatApi.deleteChat(chatId);
      chats.value = chats.value.filter(c => c.id !== chatId);
      if (currentChatId.value === chatId) {
        currentChatId.value = null;
        messages.value = [];
      }
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message;
      } else {
        error.value = e instanceof Error ? e.message : 'Failed to delete chat';
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function setCurrentChat(chatId: string | null): Promise<void> {
    // 离开当前聊天室
    if (currentChatId.value && wsClient && wsConnected.value) {
      wsClient.leaveChat(currentChatId.value);
    }

    currentChatId.value = chatId;

    if (chatId) {
      await fetchMessages(chatId);
      // 加入新聊天室
      if (wsClient && wsConnected.value) {
        wsClient.joinChat(chatId);
      }
    } else {
      messages.value = [];
    }
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
    wsConnected,
    streamingMessage,
    isStreaming,
    fetchChats,
    fetchMessages,
    sendMessage,
    createChat,
    deleteChat,
    setCurrentChat,
    addMessage,
    clearMessages,
    initWebSocket,
    disconnectWebSocket,
  };
});
