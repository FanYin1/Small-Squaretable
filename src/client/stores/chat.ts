import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Chat, Message, Character, MessageAttachment } from '@client/types';
import { chatApi, ApiError, llmApi, characterApi } from '@client/services';
import { WebSocketClient } from '@client/services/websocket';
import { WSConnectionState } from '../../types/websocket';
import { useCharacterIntelligenceStore } from './characterIntelligence';
import { useDeviceSync } from '@client/composables/useDeviceSync';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('Chat');

export const useChatStore = defineStore('chat', () => {
  // State
  const chats = ref<Chat[]>([]);
  const currentChatId = ref<string | null>(null);
  const messages = ref<Message[]>([]);
  const currentCharacter = ref<Character | null>(null);
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
   * 构建角色的 system prompt
   */
  function buildSystemPrompt(character: Character): string {
    const cardData = character.cardData || {};
    const parts: string[] = [];

    // 角色名称和描述
    parts.push(`You are ${character.name}.`);
    if (character.description) {
      parts.push(character.description);
    }

    // 角色卡数据
    if (cardData.personality) {
      parts.push(`Personality: ${cardData.personality}`);
    }
    if (cardData.scenario) {
      parts.push(`Scenario: ${cardData.scenario}`);
    }
    if (cardData.first_mes) {
      parts.push(`Your greeting: ${cardData.first_mes}`);
    }
    if (cardData.mes_example) {
      parts.push(`Example dialogue:\n${cardData.mes_example}`);
    }
    if (cardData.system_prompt) {
      parts.push(cardData.system_prompt);
    }

    // 默认指令
    parts.push('Stay in character at all times. Respond naturally as this character would.');

    return parts.join('\n\n');
  }

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
      // 如果有当前聊天，加入聊天室
      if (currentChatId.value) {
        wsClient?.joinChat(currentChatId.value);
      }
    });

    // 断开连接
    wsClient.on('disconnected', () => {
      // silently ignore
    });

    // 接收用户消息（来自 WebSocket 广播，包含数据库真实 ID）
    wsClient.on('userMessage', (data: unknown) => {
      const msgData = data as { messageId: string; chatId: string; content: string; attachments?: MessageAttachment[] };

      // 查找并替换临时消息，或添加新消息（如果是其他客户端发送的）
      const tempIndex = messages.value.findIndex(
        m => m.id.startsWith('temp-') && m.content === msgData.content && m.chatId === msgData.chatId
      );

      if (tempIndex !== -1) {
        // 替换临时消息为真实消息（更新 ID）
        messages.value[tempIndex] = {
          ...messages.value[tempIndex],
          id: msgData.messageId,
        };
      } else {
        // 新消息（可能来自其他客户端）
        const message: Message = {
          id: msgData.messageId,
          chatId: msgData.chatId,
          role: 'user',
          content: msgData.content,
          attachments: msgData.attachments,
          createdAt: new Date().toISOString(),
        };
        messages.value.push(message);
      }
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
      logger.error('WebSocket error', undefined, { errorData });
      error.value = errorData.message;
      sending.value = false;
      isStreaming.value = false;
    });

    // Intelligence events - forward to intelligence store
    wsClient.on('intelligenceEmotionChange', (data: unknown) => {
      const intelligenceStore = useCharacterIntelligenceStore();
      intelligenceStore.handleEmotionChange(data as Parameters<typeof intelligenceStore.handleEmotionChange>[0]);
    });

    wsClient.on('intelligenceMemoryRetrieval', (data: unknown) => {
      const intelligenceStore = useCharacterIntelligenceStore();
      intelligenceStore.handleMemoryRetrieval(data as Parameters<typeof intelligenceStore.handleMemoryRetrieval>[0]);
    });

    wsClient.on('intelligenceMemoryExtraction', (data: unknown) => {
      const intelligenceStore = useCharacterIntelligenceStore();
      intelligenceStore.handleMemoryExtraction(data as Parameters<typeof intelligenceStore.handleMemoryExtraction>[0]);
    });

    wsClient.on('intelligencePromptBuild', (data: unknown) => {
      const intelligenceStore = useCharacterIntelligenceStore();
      intelligenceStore.handlePromptBuild(data as Parameters<typeof intelligenceStore.handlePromptBuild>[0]);
    });

    // Sync events - forward to device sync composable
    const { handleSyncMessage } = useDeviceSync();

    wsClient.on('syncDeviceConnected', (data: unknown) => {
      handleSyncMessage({ type: 'sync:device_connected', data: data as Record<string, unknown> });
    });

    wsClient.on('syncDeviceDisconnected', (data: unknown) => {
      handleSyncMessage({ type: 'sync:device_disconnected', data: data as Record<string, unknown> });
    });

    wsClient.on('syncChatRead', (data: unknown) => {
      const readData = data as { chatId: string; lastReadMessageId: string };
      // Update unread count for the specified chat
      const chatIndex = chats.value.findIndex(c => c.id === readData.chatId);
      if (chatIndex !== -1) {
        chats.value[chatIndex] = { ...chats.value[chatIndex], unreadCount: 0 };
      }
      handleSyncMessage({ type: 'sync:chat_read', data: data as Record<string, unknown> });
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

  async function sendMessage(content: string, attachments?: MessageAttachment[]): Promise<void> {
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
        attachments,
        createdAt: new Date().toISOString(),
      };
      messages.value.push(userMessage);

      // 通过 WebSocket 发送 (包含附件)
      wsClient.sendMessage(currentChatId.value, content, attachments);
    } else {
      // 降级到 HTTP API
      sending.value = true;
      error.value = null;
      try {
        // 1. 保存用户消息
        const response = await chatApi.sendMessage(currentChatId.value, { role: 'user', content });
        messages.value.push(response.message);

        // 2. 调用 LLM 获取 AI 回复（流式）
        isStreaming.value = true;
        streamingMessage.value = '';

        // 构建消息历史，包含角色的 system prompt
        const chatMessages: Array<{ role: string; content: string }> = [];

        // 添加角色的 system prompt
        if (currentCharacter.value) {
          const systemPrompt = buildSystemPrompt(currentCharacter.value);
          chatMessages.push({ role: 'system', content: systemPrompt });
        }

        // 添加消息历史
        messages.value.forEach(m => {
          chatMessages.push({ role: m.role, content: m.content });
        });

        await llmApi.streamChatCompletion(
          {
            model: 'glm-4-flash',
            messages: chatMessages,
            stream: true,
          },
          // onChunk
          (chunk: string) => {
            streamingMessage.value += chunk;
          },
          // onDone
          async () => {
            // 保存 AI 回复到数据库
            if (streamingMessage.value && currentChatId.value) {
              try {
                const aiResponse = await chatApi.sendMessage(currentChatId.value, {
                  role: 'assistant',
                  content: streamingMessage.value,
                });
                messages.value.push(aiResponse.message);
              } catch (saveError) {
                // 即使保存失败，也显示消息
                const tempMessage: Message = {
                  id: `temp-ai-${Date.now()}`,
                  chatId: currentChatId.value,
                  role: 'assistant',
                  content: streamingMessage.value,
                  createdAt: new Date().toISOString(),
                };
                messages.value.push(tempMessage);
                logger.error('Failed to save AI message', saveError);
              }
            }
            streamingMessage.value = '';
            isStreaming.value = false;
            sending.value = false;
          },
          // onError
          (err: Error) => {
            logger.error('LLM stream error', err);
            error.value = err.message;
            streamingMessage.value = '';
            isStreaming.value = false;
            sending.value = false;
          }
        );
      } catch (e) {
        if (e instanceof ApiError) {
          error.value = e.message;
        } else {
          error.value = e instanceof Error ? e.message : 'Failed to send message';
        }
        isStreaming.value = false;
        sending.value = false;
        throw e;
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

  async function renameChat(chatId: string, newTitle: string): Promise<Chat> {
    error.value = null;
    try {
      const response = await chatApi.updateChat(chatId, { title: newTitle });
      const index = chats.value.findIndex(c => c.id === chatId);
      if (index !== -1) {
        chats.value[index] = { ...chats.value[index], title: newTitle };
      }
      return response.chat;
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message;
      } else {
        error.value = e instanceof Error ? e.message : 'Failed to rename chat';
      }
      throw e;
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

  async function deleteMessage(messageId: string): Promise<void> {
    if (!currentChatId.value) return;

    try {
      await chatApi.deleteMessage(currentChatId.value, messageId);
      messages.value = messages.value.filter(m => m.id !== messageId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete message';
      throw e;
    }
  }

  async function setCurrentChat(chatId: string | null): Promise<void> {
    // 离开当前聊天室
    if (currentChatId.value && wsClient && wsConnected.value) {
      wsClient.leaveChat(currentChatId.value);
    }

    currentChatId.value = chatId;
    currentCharacter.value = null;

    if (chatId) {
      await fetchMessages(chatId);

      // 加载角色信息
      const chat = chats.value.find(c => c.id === chatId);
      if (chat?.characterId) {
        try {
          currentCharacter.value = await characterApi.getCharacter(chat.characterId);
        } catch (err) {
          logger.error('Failed to load character', err);
        }
      }

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
    currentCharacter,
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
    deleteMessage,
    renameChat,
    setCurrentChat,
    addMessage,
    clearMessages,
    initWebSocket,
    disconnectWebSocket,
  };
});
