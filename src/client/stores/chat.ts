import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Chat, Message, Character, MessageAttachment } from '@client/types';
import type { ModelMeta } from '@client/services/llm.api';
import { chatApi, ApiError, llmApi, characterApi, api } from '@client/services';
import { WebSocketClient } from '@client/services/websocket';
import { WSConnectionState } from '../../types/websocket';
import { useCharacterIntelligenceStore } from './characterIntelligence';
import { useNotificationStore } from './notification';
import { useDeviceSync } from '@client/composables/useDeviceSync';
import { createLogger } from '@client/utils/logger';
import i18n from '@client/i18n';
import { isInsufficientCredits, showInsufficientCreditsAlert } from '@client/utils/credit-alert';
import { useUserStore } from './user';
import { storyIdentitySnapshotSchema } from '../../types/story-identity';
import type { OpeningSelection } from '../../types/story-opening';
import { contextBudgetDetailsSchema } from '../../types/context-budget';

const logger = createLogger('Chat');

export const useChatStore = defineStore('chat', () => {
  // State
  const chats = ref<Chat[]>([]);
  const currentChatId = ref<string | null>(null);
  const messages = ref<Message[]>([]);
  const chatCharacters = ref<Character[]>([]);
  const loading = ref(false);
  const sending = ref(false);
  const error = ref<string | null>(null);
  const wsConnected = ref(false);
  const wsConnectionState = ref<WSConnectionState>(WSConnectionState.DISCONNECTED);
  const streamingMessage = ref<string>('');
  const streamingCharacterId = ref<string | null>(null);
  const streamingCharacterName = ref<string | null>(null);
  const isStreaming = ref(false);
  const stopping = ref(false);
  const billingRevision = ref(0);
  const hasMoreMessages = ref(true);
  const loadingOlder = ref(false);
  const searchResults = ref<Message[]>([]);
  const searchQuery = ref('');
  const searching = ref(false);
  const availableModels = ref<ModelMeta[]>([]);
  const contextRecovery = ref<{ chatId: string; requestId: string; content: string } | null>(null);
  const failedGeneration = ref<{
    chatId: string;
    requestId: string;
    content: string;
    attachments?: MessageAttachment[];
    mentionedCharacterIds?: string[];
  } | null>(null);

  // Reply-to-message state
  const replyingTo = ref<{ messageId: string; content: string; role: string } | null>(null);

  // Pinned messages state
  const pinnedMessages = ref<any[]>([]);

  // Branch navigation state
  const branchCache = ref<Map<number, { siblings: Message[]; currentIndex: number }>>(new Map());

  // Typing indicator state
  const typingUsers = ref<Map<string, { userId: string; userName: string; timeout: ReturnType<typeof setTimeout> }>>(new Map());

  // WebSocket client
  let wsClient: WebSocketClient | null = null;
  let selectionVersion = 0;
  let accountVersion = 0;
  let chatsVersion = 0;
  let httpGenerationController: AbortController | null = null;
  let pendingAcceptance: { messageId: string; accept: () => void } | null = null;
  let activeRequestId: string | null = null;
  let lastFinishedRequestId: string | null = null;
  let generationRecoveryPending = false;
  const requestPayloads = new Map<string, {
    content: string;
    attachments?: MessageAttachment[];
    mentionedCharacterIds?: string[];
    onAccepted?: () => void;
    storyAction?: import('../../types/story-state').StoryActionRequest;
    storyAudience?: import('../../types/story-knowledge').StoryAudience;
  }>();

  type GenerationState = { chatId: string; status: 'running' | 'idle'; requestId?: string };

  const canRetryGeneration = computed(() => Boolean(
    failedGeneration.value &&
    failedGeneration.value.chatId === currentChatId.value &&
    wsConnected.value &&
    !sending.value &&
    !isStreaming.value
  ));

  function takeContextInput(): string | null {
    if (!contextRecovery.value || contextRecovery.value.chatId !== currentChatId.value || sending.value || isStreaming.value) return null;
    const content = contextRecovery.value.content;
    contextRecovery.value = null;
    return content;
  }

  function rememberFailedGeneration(requestId?: string): void {
    if (!requestId || !currentChatId.value) return;
    const userMessage = messages.value.find(message =>
      message.id === requestId || message.extra?.clientMessageId === requestId
    );
    const payload = requestPayloads.get(requestId);
    if (!userMessage && !payload) return;

    failedGeneration.value = {
      chatId: currentChatId.value,
      requestId,
      content: payload?.content || userMessage?.content || '',
      attachments: payload?.attachments || userMessage?.attachments,
      mentionedCharacterIds: payload?.mentionedCharacterIds,
    };
  }

  function clearStreamingState(): void {
    streamingMessage.value = '';
    streamingCharacterId.value = null;
    streamingCharacterName.value = null;
    isStreaming.value = false;
  }

  async function refreshLegacyVariables(chatId: string) {
    if (currentChat.value?.id !== chatId || currentChat.value.contentSnapshotVersion != null) return;
    try {
      const { fetchVariables, updateVariables } = await import('@client/utils/era-bridge');
      const variables = await fetchVariables(chatId);
      if (currentChat.value?.id === chatId) updateVariables(variables);
    } catch (variableError) {
      logger.warn('Failed to recover legacy variables', { error: variableError });
      if (currentChat.value?.id === chatId && !error.value) error.value = i18n.global.t('chat.replyRecoveryFailed');
    }
  }

  async function reconcileMessages(chatId: string, includeLastMessage = false, recoveryRequestId = activeRequestId): Promise<{ assistantRecovered: boolean; failed?: boolean }> {
    const version = selectionVersion;
    const requestId = recoveryRequestId;
    const numericIds = messages.value
      .map(message => Number(message.id))
      .filter(Number.isSafeInteger);
    const lastMessageId = numericIds.length > 0 ? Math.max(...numericIds) : undefined;
    const requestMessage = requestId ? messages.value.find(message => message.extra?.clientMessageId === requestId || message.id === requestId) : undefined;
    const requestMessageId = requestMessage ? Number(requestMessage.id) : NaN;
    const after = Number.isSafeInteger(requestMessageId)
      ? Math.max(0, requestMessageId - 1)
      : lastMessageId !== undefined ? (includeLastMessage ? Math.max(0, lastMessageId - 1) : lastMessageId) : undefined;

    try {
      const recovered: Message[] = [];
      let cursor = after;
      while (true) {
        const response = await chatApi.getMessages(chatId, {
          ...(cursor !== undefined ? { after: cursor } : {}), limit: 50,
        });
        if (version !== selectionVersion || currentChatId.value !== chatId) return { assistantRecovered: false };
        recovered.push(...response.messages);
        if (cursor === undefined || !response.hasMore) break;
        const nextCursor = Math.max(...response.messages.map(message => Number(message.id)));
        if (!Number.isSafeInteger(nextCursor) || nextCursor <= cursor) throw new Error('Message recovery cursor did not advance');
        cursor = nextCursor;
      }

      const merged = [...messages.value];
      let assistantRecovered = false;

      for (const incoming of recovered) {
        const incomingClientMessageId = incoming.extra?.clientMessageId;
        let existingIndex = merged.findIndex(message => message.id === incoming.id);

        if (existingIndex === -1 && incoming.role === 'user' && incomingClientMessageId) {
          existingIndex = merged.findIndex(message => message.id === incomingClientMessageId);
        }

        if (existingIndex !== -1) {
          const existingMessage = merged[existingIndex];
          if (incoming.role === 'user' && existingMessage.id.startsWith('temp-') && pendingAcceptance?.messageId === existingMessage.id) {
            const accept = pendingAcceptance.accept;
            pendingAcceptance = null;
            accept();
          }
          merged[existingIndex] = { ...merged[existingIndex], ...incoming };
        } else {
          merged.push(incoming);
        }

        if (incoming.role === 'assistant' && !messages.value.some(message => message.id === incoming.id)) {
          assistantRecovered = true;
        }
      }

      messages.value = merged.sort((first, second) => {
        const firstId = Number(first.id);
        const secondId = Number(second.id);
        return Number.isSafeInteger(firstId) && Number.isSafeInteger(secondId) ? firstId - secondId : 0;
      });
      if (!assistantRecovered && requestId) {
        const requestUserIndex = merged.findIndex(message =>
          message.id === requestId || message.extra?.clientMessageId === requestId
        );
        if (requestUserIndex !== -1) {
          assistantRecovered = merged
            .slice(requestUserIndex + 1)
            .some(message => message.role === 'assistant');
        }
      }
      await refreshLegacyVariables(chatId);
      return { assistantRecovered };
    } catch (reconcileError) {
      logger.warn('Failed to reconcile messages after WebSocket reconnect', { error: reconcileError });
      if (version === selectionVersion && currentChatId.value === chatId && !error.value) error.value = i18n.global.t('chat.replyRecoveryFailed');
      return { assistantRecovered: false, failed: true };
    }
  }

  function acceptGenerationEvent(requestId?: string): boolean {
    if (!requestId) return true;
    if (requestId === lastFinishedRequestId || (activeRequestId && requestId !== activeRequestId)) return false;
    activeRequestId = requestId;
    sending.value = true;
    return true;
  }

  // Getters
  const currentChat = computed(() =>
    chats.value.find(c => c.id === currentChatId.value)
  );

  // Backwards compatible: first character in the group
  const currentCharacter = computed<Character | null>(() =>
    chatCharacters.value.length > 0 ? chatCharacters.value[0] : null
  );

  // Current model for the active chat
  const currentModel = computed<string>(() => {
    const chatModel = currentChat.value?.metadata?.model;
    if (chatModel) return chatModel as string;
    return availableModels.value.length > 0 ? availableModels.value[0].id : '';
  });

  // Current model's context window
  const currentModelContextWindow = computed<number>(() => {
    const modelId = currentModel.value;
    const model = availableModels.value.find(m => m.id === modelId);
    return model?.contextWindow || 128000; // Default to 128K
  });

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

    const snapshot = currentChat.value?.identitySnapshot;
    if (snapshot != null) {
      const identity = storyIdentitySnapshotSchema.parse(snapshot);
      parts.push(`[User Persona: ${identity.name}]${identity.description ? `\n${identity.description}` : ''}`);
      return parts.join('\n\n').replace(/\{\{user\}\}/gi, () => identity.name);
    }
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
      refreshAccessToken: async () => {
        const userStore = useUserStore();
        await userStore.refreshAccessToken();
        if (!userStore.token) throw new Error('Access token refresh returned no token');
        return userStore.token;
      },
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
    });

    // 连接状态变化
    wsClient.on('stateChange', (data: unknown) => {
      const state = data as WSConnectionState;
      wsConnected.value = state === WSConnectionState.CONNECTED;
      wsConnectionState.value = state;
    });

    // 连接成功
    wsClient.on('connected', () => {
      // 如果有当前聊天，加入聊天室
      if (currentChatId.value) {
        const chatId = currentChatId.value;
        generationRecoveryPending = !httpGenerationController && Boolean(activeRequestId || sending.value || isStreaming.value);
        wsClient?.joinChat(chatId);
      }
    });

    // 断开连接
    wsClient.on('disconnected', () => {
      generationRecoveryPending = !httpGenerationController && Boolean(activeRequestId || sending.value || isStreaming.value);
    });

    wsClient.on('generationState', (data: unknown) => {
      const state = data as GenerationState;
      if (state.chatId !== currentChatId.value) return;
      if (httpGenerationController) return;

      if (state.status === 'running') {
        generationRecoveryPending = true;
        if (state.requestId) activeRequestId = state.requestId;
        sending.value = true;
        stopping.value = false;
        void reconcileMessages(state.chatId).then(({ assistantRecovered }) => {
          if (assistantRecovered && currentChatId.value === state.chatId) clearStreamingState();
        });
        return;
      }

      const wasGenerating = generationRecoveryPending || Boolean(activeRequestId || sending.value || isStreaming.value);
      void reconcileMessages(state.chatId).then(({ assistantRecovered }) => {
        if (currentChatId.value !== state.chatId || !wasGenerating) return;
        failedGeneration.value = null;
        if (assistantRecovered || isStreaming.value) clearStreamingState();
        lastFinishedRequestId = state.requestId || activeRequestId;
        activeRequestId = null;
        generationRecoveryPending = false;
        pendingAcceptance = null;
        sending.value = false;
        stopping.value = false;
        if (!assistantRecovered) {
          if (!error.value) error.value = i18n.global.t('chat.generationFailed');
        }
      });
    });

    // 接收用户消息（来自 WebSocket 广播，包含数据库真实 ID）
    wsClient.on('userMessage', (data: unknown) => {
      const msgData = data as { messageId: string; chatId: string; content: string; clientMessageId?: string; attachments?: MessageAttachment[]; storyAudience?: string[] };
      if (msgData.chatId !== currentChatId.value) return;
      if (messages.value.some(message => message.id === msgData.messageId)) return;

      // 查找并替换临时消息，或添加新消息（如果是其他客户端发送的）
      const tempIndex = messages.value.findIndex(
        m => m.chatId === msgData.chatId && (msgData.clientMessageId
          ? m.id === msgData.clientMessageId
          : m.id.startsWith('temp-') && m.content === msgData.content)
      );

      if (tempIndex !== -1) {
        if (pendingAcceptance && pendingAcceptance.messageId === msgData.clientMessageId) {
          const accept = pendingAcceptance.accept;
          pendingAcceptance = null;
          accept();
        }
        // 替换临时消息为真实消息（更新 ID）
        messages.value[tempIndex] = {
          ...messages.value[tempIndex],
          id: msgData.messageId,
          extra: { ...messages.value[tempIndex].extra, clientMessageId: msgData.clientMessageId,
            ...(msgData.storyAudience ? { storyAudience: msgData.storyAudience } : {}) },
        };
      } else {
        // 新消息（可能来自其他客户端）
        const message: Message = {
          id: msgData.messageId,
          chatId: msgData.chatId,
          role: 'user',
          content: msgData.content,
          attachments: msgData.attachments,
          extra: { ...(msgData.clientMessageId ? { clientMessageId: msgData.clientMessageId } : {}),
            ...(msgData.storyAudience ? { storyAudience: msgData.storyAudience } : {}) },
          createdAt: new Date().toISOString(),
        };
        messages.value.push(message);
      }
    });

    // 接收助手消息块（流式）
    wsClient.on('assistantMessageChunk', (data: unknown) => {
      const chunkData = data as { chatId: string; requestId?: string; chunk: string; characterId?: string; characterName?: string };
      if (chunkData.chatId !== currentChatId.value) return;
      if (!acceptGenerationEvent(chunkData.requestId)) return;
      if (isStreaming.value && (chunkData.characterId ?? null) !== streamingCharacterId.value) {
        generationRecoveryPending = true;
        isStreaming.value = false;
      }
      if (!isStreaming.value) {
        isStreaming.value = true;
        streamingMessage.value = '';
        streamingCharacterId.value = chunkData.characterId ?? null;
        streamingCharacterName.value = chunkData.characterName ?? null;
      }
      streamingMessage.value += chunkData.chunk;
    });

    // 助手消息完成
    wsClient.on('assistantMessageDone', (data: unknown) => {
      const doneData = data as { messageId: string; chatId: string; requestId?: string; characterId?: string; characterName?: string; variablesChanged?: boolean; storyAudience?: string[];
        storyIntent?: import('../../types/story-intent').StoredStoryIntent; storyConfirmedIntent?: import('../../types/story-intent').StoryIntent; storyIntentInvalid?: boolean; storyRecommendations?: Array<{ label: string; input: string }>; storyRecommendationsSource?: import('../../types/story-recommendations').StoryRecommendationsSource; stateStatus?: string };
      if (doneData.chatId !== currentChatId.value) return;
      if (!acceptGenerationEvent(doneData.requestId)) return;
      if (doneData.variablesChanged) void refreshLegacyVariables(doneData.chatId);
      if (!doneData.requestId) stopping.value = false;
      if (isStreaming.value && streamingMessage.value && doneData.messageId) {
        const message: Message = {
          id: doneData.messageId,
          chatId: doneData.chatId,
          role: 'assistant',
          content: streamingMessage.value,
          characterId: doneData.characterId ?? streamingCharacterId.value ?? undefined,
          characterName: doneData.characterName ?? streamingCharacterName.value ?? undefined,
          extra: { ...(doneData.storyAudience ? { storyAudience: doneData.storyAudience } : {}),
            ...(doneData.stateStatus ? { stateStatus: doneData.stateStatus } : {}),
            ...(doneData.storyIntent ? { storyIntent: doneData.storyIntent } : {}),
            ...(doneData.storyConfirmedIntent ? { storyConfirmedIntent: doneData.storyConfirmedIntent } : {}),
            ...(doneData.storyIntentInvalid ? { storyIntentInvalid: true } : {}),
            ...(doneData.storyRecommendations ? { storyRecommendations: doneData.storyRecommendations } : {}),
            ...(doneData.storyRecommendationsSource ? { storyRecommendationsSource: doneData.storyRecommendationsSource } : {}),
          },
          createdAt: new Date().toISOString(),
        };
        if (!messages.value.some(existing => existing.id === message.id)) messages.value.push(message);
        streamingMessage.value = '';
        streamingCharacterId.value = null;
        streamingCharacterName.value = null;
        isStreaming.value = false;
        if (!doneData.requestId) sending.value = false;

      }
      if (!doneData.requestId) {
        sending.value = false;
        isStreaming.value = false;
        activeRequestId = null;
      }
    });

    wsClient.on('generationFinished', (data: unknown) => {
      const finished = data as { chatId: string; requestId: string; status: 'completed' | 'stopped' | 'failed'; retryable?: boolean };
      if (finished.chatId === currentChatId.value) billingRevision.value += 1;
      if (finished.chatId !== currentChatId.value || finished.requestId !== activeRequestId) return;
      const needsReconciliation = generationRecoveryPending || finished.status !== 'completed';
      const recoveryVersion = selectionVersion;
      if (finished.status === 'failed' && finished.retryable === true && contextRecovery.value?.requestId !== finished.requestId) rememberFailedGeneration(finished.requestId);
      else {
        failedGeneration.value = null;
        requestPayloads.delete(finished.requestId);
      }
      lastFinishedRequestId = finished.requestId;
      activeRequestId = null;
      generationRecoveryPending = false;
      pendingAcceptance = null;
      streamingMessage.value = '';
      streamingCharacterId.value = null;
      streamingCharacterName.value = null;
      isStreaming.value = false;
      sending.value = false;
      stopping.value = false;
      if (finished.status === 'failed' && !error.value) error.value = i18n.global.t('chat.generationFailed');
      if (needsReconciliation) {
        void reconcileMessages(finished.chatId, true, finished.requestId).then(({ failed }) => {
          if (failed && recoveryVersion === selectionVersion && currentChatId.value === finished.chatId && !error.value) {
            error.value = i18n.global.t('chat.replyRecoveryFailed');
          }
        });
      }
    });

    // 错误处理
    wsClient.on('error', (data: unknown) => {
      const errorData = data as { code?: string; message: string; details?: unknown; chatId?: string; requestId?: string };
      if (errorData.chatId && errorData.chatId !== currentChatId.value) return;
      if (errorData.requestId && errorData.requestId !== activeRequestId) return;
      failedGeneration.value = null;
      contextRecovery.value = null;
      logger.error('WebSocket error', undefined, { errorData });
      // 平台花费熔断（P0-7）：服务端消息是英文，这里换成本地化提示
      // 点数不足（P3-1）：同样换成本地化提示
      if (errorData.code === 'PLATFORM_SPEND_LIMIT') {
        error.value = i18n.global.t('chat.platformSpendLimit');
      } else if (errorData.code === 'PLATFORM_SPEND_UNAVAILABLE') {
        error.value = i18n.global.t('chat.platformSpendUnavailable');
      } else if (errorData.code === 'INSUFFICIENT_CREDITS') {
        error.value = i18n.global.t('credits.insufficient');
        void showInsufficientCreditsAlert(errorData.details);
      } else if (errorData.code === 'GENERATION_ALREADY_ACCEPTED') {
        error.value = i18n.global.t('chat.generationAlreadyAccepted');
      } else if (errorData.code === 'GENERATION_OUTPUT_TRUNCATED') {
        error.value = i18n.global.t('chat.generationTruncated');
      } else if (errorData.code === 'CONTEXT_BUDGET_EXCEEDED') {
        const details = contextBudgetDetailsSchema.safeParse(errorData.details);
        const reason = details.success ? details.data.reason : 'payload';
        const key = reason === 'latest' ? 'contextBudgetInput' : reason === 'pinned' ? 'contextBudgetPinned'
          : reason === 'critical' ? 'contextBudgetCritical' : 'contextBudgetPayload';
        error.value = i18n.global.t(`chat.${key}`);
        const requestId = errorData.requestId ?? activeRequestId;
        if (requestId && currentChatId.value) {
          const saved = messages.value.find(message => message.id === requestId || message.extra?.clientMessageId === requestId);
          contextRecovery.value = { chatId: currentChatId.value, requestId,
            content: requestPayloads.get(requestId)?.content ?? saved?.content ?? '' };
        }
      } else if (['STORY_STATE_CONFLICT', 'STORY_ACTION_UNAVAILABLE', 'STORY_ACTION_PRECONDITION'].includes(errorData.code ?? '')) {
        error.value = i18n.global.t('chat.storyActionChanged');
        if (errorData.requestId) messages.value = messages.value.filter(message => message.id !== errorData.requestId);
      } else {
        error.value = errorData.message;
      }
      if (errorData.code === 'GENERATION_BUSY' && currentChatId.value) {
        wsClient?.joinChat(currentChatId.value);
        return;
      }
      if (activeRequestId) return;
      pendingAcceptance = null;
      sending.value = false;
      isStreaming.value = false;
      stopping.value = false;
      generationRecoveryPending = false;
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

    // Social notification events
    wsClient.on('social:notification', (data: unknown) => {
      const notifStore = useNotificationStore();
      notifStore.handleWsNotification(data as import('@/types/social').NotificationItem);
    });

    wsClient.on('social:unread_count', (data: unknown) => {
      const notifStore = useNotificationStore();
      notifStore.handleWsUnreadCount((data as { count: number }).count);
    });

    // Remote user typing events
    wsClient.on('userTyping', (data: unknown) => {
      handleRemoteTyping(data as { chatId: string; userId: string; userName?: string; isTyping?: boolean });
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
    wsConnectionState.value = WSConnectionState.DISCONNECTED;
  }

  // Actions
  async function fetchChats(): Promise<void> {
    const version = ++chatsVersion;
    loading.value = true;
    error.value = null;
    try {
      const response = await chatApi.getChats();
      if (version !== chatsVersion) return;
      chats.value = response.chats;
    } catch (e) {
      if (version !== chatsVersion) return;
      if (e instanceof ApiError) {
        error.value = e.message;
      } else {
        error.value = e instanceof Error ? e.message : 'Failed to fetch chats';
      }
      throw e;
    } finally {
      if (version === chatsVersion) loading.value = false;
    }
  }

  async function fetchMessages(chatId: string): Promise<void> {
    const version = selectionVersion;
    loading.value = true;
    error.value = null;
    try {
      const response = await chatApi.getMessages(chatId, { limit: 30 });
      if (version !== selectionVersion) return;
      messages.value = response.messages;
      hasMoreMessages.value = response.hasMore;
    } catch (e) {
      if (version !== selectionVersion) return;
      if (e instanceof ApiError) {
        error.value = e.message;
      } else {
        error.value = e instanceof Error ? e.message : 'Failed to fetch messages';
      }
      throw e;
    } finally {
      if (version === selectionVersion) loading.value = false;
    }
  }

  async function fetchOlderMessages(): Promise<void> {
    if (!currentChatId.value || !hasMoreMessages.value || loadingOlder.value) return;
    const version = selectionVersion;

    const oldestMessage = messages.value[0];
    if (!oldestMessage) return;

    loadingOlder.value = true;
    try {
      const oldestId = parseInt(oldestMessage.id);
      if (isNaN(oldestId)) return;

      const response = await chatApi.getMessages(currentChatId.value, {
        before: oldestId,
        limit: 20,
      });
      if (version !== selectionVersion) return;

      if (response.messages.length > 0) {
        messages.value = [...response.messages, ...messages.value];
      }
      hasMoreMessages.value = response.hasMore;
    } catch (e) {
      if (version !== selectionVersion) return;
      error.value = e instanceof Error ? e.message : 'Failed to load older messages';
    } finally {
      if (version === selectionVersion) loadingOlder.value = false;
    }
  }

  async function sendMessage(
    content: string,
    attachments?: MessageAttachment[],
    mentionedCharacterIds?: string[],
    onAccepted?: () => void,
    retryRequestId?: string,
    storyAction?: import('../../types/story-state').StoryActionRequest,
    storyAudience?: import('../../types/story-knowledge').StoryAudience
  ): Promise<void> {
    if (!currentChatId.value) {
      throw new Error('No active chat');
    }
    if (sending.value || isStreaming.value) return;
    if ((currentChat.value?.worldbookSnapshotVersion != null || currentChat.value?.contentSnapshotVersion != null) && !(wsConnected.value && wsClient)) {
      error.value = i18n.global.t('chat.savedSettingsConnectionRequired');
      throw new Error(error.value);
    }
    stopping.value = false;
    const requestChatId = currentChatId.value;
    const requestVersion = selectionVersion;
    failedGeneration.value = null;
    contextRecovery.value = null;

    // Build extra field with replyTo if replying
    const extra = { ...(replyingTo.value ? { replyTo: { ...replyingTo.value } } : {}), ...(storyAudience ? { storyAudience } : {}) };

    // 如果 WebSocket 已连接，使用 WebSocket 发送
    if (wsConnected.value && wsClient) {
      const localMessageId = retryRequestId || `temp-${crypto.randomUUID()}`;
      sending.value = true;
      error.value = null;
      requestPayloads.set(localMessageId, { content, attachments, mentionedCharacterIds, onAccepted, storyAction, storyAudience });

      const existingMessage = retryRequestId
        ? messages.value.find(message => message.id === retryRequestId || message.extra?.clientMessageId === retryRequestId)
        : undefined;
      if (!existingMessage) {
        // 立即添加用户消息到界面
        const userMessage: Message = {
          id: localMessageId,
          chatId: currentChatId.value,
          role: 'user',
          content,
          attachments,
          extra,
          createdAt: new Date().toISOString(),
        };
        messages.value.push(userMessage);
        pendingAcceptance = onAccepted ? { messageId: userMessage.id, accept: onAccepted } : null;
      } else {
        pendingAcceptance = onAccepted && existingMessage.id.startsWith('temp-')
          ? { messageId: existingMessage.id, accept: onAccepted }
          : null;
      }
      activeRequestId = localMessageId;
      lastFinishedRequestId = null;
      replyingTo.value = null;

      // 通过 WebSocket 发送 (包含附件和提及)
      wsClient.sendMessage(currentChatId.value, content, attachments, mentionedCharacterIds, localMessageId, storyAction, storyAudience);
    } else {
      // 降级到 HTTP API
      sending.value = true;
      error.value = null;
      const controller = new AbortController();
      httpGenerationController = controller;
      try {
        // 1. 保存用户消息
        const response = await chatApi.sendMessage(requestChatId, { role: 'user', content, ...(extra && { extra }) });
        onAccepted?.();
        if (requestVersion !== selectionVersion) return;
        messages.value.push(response.message);
        replyingTo.value = null;

        // Determine which characters should respond
        const isGroup = chatCharacters.value.length > 1;
        const respondents = isGroup ? chatCharacters.value : (currentCharacter.value ? [currentCharacter.value] : []);

        for (const character of respondents) {
          if (controller.signal.aborted || requestVersion !== selectionVersion) break;
          let responseContent = '';
          // 2. 调用 LLM 获取 AI 回复（流式）
          isStreaming.value = true;
          streamingMessage.value = '';
          streamingCharacterId.value = isGroup ? character.id : null;
          streamingCharacterName.value = isGroup ? character.name : null;

          // 构建消息历史，包含角色的 system prompt
          const chatMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

          const systemPrompt = buildSystemPrompt(character);
          chatMessages.push({ role: 'system', content: systemPrompt });

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
              responseContent += chunk;
              if (requestVersion === selectionVersion) streamingMessage.value = responseContent;
            },
            // onDone
            async () => {
              // 保存 AI 回复到数据库
              if (responseContent) {
                try {
                  const aiResponse = await chatApi.sendMessage(requestChatId, {
                    role: 'assistant',
                    content: responseContent,
                  });
                  if (requestVersion === selectionVersion) messages.value.push(aiResponse.message);
                } catch (saveError) {
                  const tempMessage: Message = {
                    id: `temp-ai-${Date.now()}`,
                    chatId: requestChatId,
                    role: 'assistant',
                    content: responseContent,
                    characterId: isGroup ? character.id : undefined,
                    characterName: isGroup ? character.name : undefined,
                    createdAt: new Date().toISOString(),
                  };
                  if (requestVersion === selectionVersion) messages.value.push(tempMessage);
                  logger.error('Failed to save AI message', saveError);
                }
              }
              if (requestVersion !== selectionVersion) return;
              streamingMessage.value = '';
              streamingCharacterId.value = null;
              streamingCharacterName.value = null;
              isStreaming.value = false;
            },
            // onError
            (err: Error) => {
              if (requestVersion !== selectionVersion) return;
              logger.error('LLM stream error', err);
              error.value = err.message;
              streamingMessage.value = '';
              streamingCharacterId.value = null;
              streamingCharacterName.value = null;
              isStreaming.value = false;
              sending.value = false;
            },
            controller.signal
          );
        }
        // All respondents done
        if (requestVersion === selectionVersion) sending.value = false;
      } catch (e) {
        if (requestVersion !== selectionVersion || controller.signal.aborted) return;
        if (isInsufficientCredits(e)) {
          // 点数不足（P3-1）：输入框处显示本地化文案，同时弹窗提醒充值
          error.value = i18n.global.t('credits.insufficient');
          void showInsufficientCreditsAlert(e.details);
        } else if (e instanceof ApiError) {
          error.value = e.message;
        } else {
          error.value = e instanceof Error ? e.message : 'Failed to send message';
        }
        isStreaming.value = false;
        sending.value = false;
        throw e;
      } finally {
        if (requestVersion === selectionVersion) {
          httpGenerationController = null;
          stopping.value = false;
          isStreaming.value = false;
          sending.value = false;
        }
      }
    }
  }

  async function retryLastGeneration(): Promise<void> {
    const failed = failedGeneration.value;
    if (!failed || !canRetryGeneration.value) return;

    await sendMessage(
      failed.content,
      failed.attachments,
      failed.mentionedCharacterIds,
      requestPayloads.get(failed.requestId)?.onAccepted,
      failed.requestId,
      requestPayloads.get(failed.requestId)?.storyAction,
      requestPayloads.get(failed.requestId)?.storyAudience
    );
  }

  async function createChat(characterId: string, title?: string, characterIds?: string[], personaId?: string, clientRequestId?: string, opening?: OpeningSelection): Promise<Chat> {
    loading.value = true;
    error.value = null;
    try {
      const payload = characterIds
        ? { characterIds, title, personaId, clientRequestId }
        : { characterId, title, personaId, clientRequestId };
      const response = await chatApi.createChat({ ...payload, ...(opening ? { opening } : {}) });
      const existingIndex = chats.value.findIndex(chat => chat.id === response.chat.id);
      if (existingIndex === -1) chats.value.unshift(response.chat);
      else chats.value[existingIndex] = response.chat;
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
    // Deletion owns a local pending/error UI; list loading errors belong to fetchChats.
    await chatApi.deleteChat(chatId);
    chats.value = chats.value.filter(c => c.id !== chatId);
    if (currentChatId.value === chatId) {
      currentChatId.value = null;
      messages.value = [];
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

  async function editMessage(
    messageId: string,
    updates: { content?: string; pinned?: boolean; importance?: number }
  ): Promise<void> {
    if (!currentChatId.value) return;

    try {
      await chatApi.editMessage(currentChatId.value, messageId, updates);
      const index = messages.value.findIndex(m => m.id === messageId);
      if (index !== -1) {
        messages.value[index] = { ...messages.value[index], ...updates };
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to edit message';
      throw e;
    }
  }

  async function regenerateMessage(messageId: string): Promise<void> {
    if (!currentChatId.value) return;

    // Find the assistant message to regenerate
    const msgIndex = messages.value.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const targetMessage = messages.value[msgIndex];
    if (targetMessage.role !== 'assistant') return;

    // Find the preceding user message
    let userMessage: Message | null = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages.value[i].role === 'user') {
        userMessage = messages.value[i];
        break;
      }
    }
    if (!userMessage) return;

    // Delete the assistant message from backend
    try {
      await chatApi.deleteMessage(currentChatId.value, messageId);
    } catch {
      // If delete fails (e.g. temp message), just remove locally
    }

    // Remove the assistant message from local state
    messages.value = messages.value.filter(m => m.id !== messageId);

    // Re-send the user message content to trigger a new LLM response
    await sendMessage(userMessage.content, userMessage.attachments);
  }

  async function setCurrentChat(chatId: string | null): Promise<void> {
    const version = ++selectionVersion;
    pendingAcceptance = null;
    activeRequestId = null;
    generationRecoveryPending = false;
    failedGeneration.value = null;
    contextRecovery.value = null;
    requestPayloads.clear();
    httpGenerationController?.abort();
    httpGenerationController = null;
    // 离开当前聊天室
    if (currentChatId.value && wsClient && wsConnected.value) {
      wsClient.leaveChat(currentChatId.value);
    }

    currentChatId.value = chatId;
    messages.value = [];
    loadingOlder.value = false;
    hasMoreMessages.value = true;
    chatCharacters.value = [];
    streamingMessage.value = '';
    streamingCharacterId.value = null;
    streamingCharacterName.value = null;
    isStreaming.value = false;
    sending.value = false;
    stopping.value = false;
    replyingTo.value = null;
    error.value = null;
    loading.value = false;
    clearBranchCache();

    if (chatId) {
      if (!chats.value.some(chat => chat.id === chatId)) {
        loading.value = true;
        try {
          const response = await chatApi.getChat(chatId);
          if (version !== selectionVersion) return;
          if (!chats.value.some(chat => chat.id === response.chat.id)) chats.value.push(response.chat);
        } catch (failure) {
          if (version !== selectionVersion) return;
          currentChatId.value = null;
          error.value = failure instanceof Error ? failure.message : 'Failed to load chat';
          throw failure;
        } finally {
          if (version === selectionVersion) loading.value = false;
        }
      }
      await fetchMessages(chatId);
      if (version !== selectionVersion) return;

      // 加载聊天角色列表
      let loaded = false;
      try {
        const characters = await chatApi.getChatCharacters(chatId);
        if (version !== selectionVersion) return;
        logger.debug('getChatCharacters result', { chatId, count: characters?.length });
        if (Array.isArray(characters) && characters.length > 0) {
          chatCharacters.value = characters.map(c => ({
            id: c.id,
            name: c.name,
            avatar: c.avatarUrl,
            cardData: c.cardData as Character['cardData'],
            compatibility: c.compatibility,
            diagnostics: c.diagnostics,
            isPublic: false,
            createdAt: '',
          }));
          loaded = true;
          logger.debug('Loaded characters from getChatCharacters', { count: chatCharacters.value.length });
        }
      } catch (err) {
        if (version !== selectionVersion) return;
        logger.warn('getChatCharacters failed, will try fallback', { error: err });
      }

      if (!loaded && currentChat.value?.contentSnapshotVersion != null && currentChat.value?.characterId) {
        throw new Error(i18n.global.t('chat.savedContentUnavailable'));
      }

      // Fallback: load single character from chat metadata
      if (!loaded) {
        logger.debug('Attempting fallback character load', { chatId });
        let chat = chats.value.find(c => c.id === chatId);
        logger.debug('Found chat in store', { found: !!chat, characterId: chat?.characterId });

        // If chat not in store, fetch it directly
        if (!chat) {
          try {
            logger.debug('Chat not in store, fetching directly', { chatId });
            const response = await chatApi.getChat(chatId);
            chat = response.chat;
            logger.debug('Fetched chat directly', { characterId: chat.characterId });
          } catch (err) {
            logger.error('Failed to fetch chat directly', err);
          }
        }

        if (chat?.characterId) {
          try {
            const character = await characterApi.getCharacter(chat.characterId);
            if (version !== selectionVersion) return;
            chatCharacters.value = [character];
            logger.debug('Loaded character from fallback', { characterId: character.id, name: character.name });
          } catch (err) {
            logger.error('Failed to load character from fallback', err);
          }
        } else {
          logger.warn('No character ID found in chat, cannot load greeting', { chatId, chat });
        }
      }

      // 加入新聊天室
      if (version !== selectionVersion) return;
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

  async function addGreetingMessage(chatId: string, content: string): Promise<void> {
    const version = selectionVersion;
    try {
      const response = await chatApi.sendMessage(chatId, {
        role: 'assistant',
        content,
      });
      if (version === selectionVersion && currentChatId.value === chatId) messages.value.push(response.message);
    } catch (e) {
      logger.error('Failed to persist greeting message', e);
      throw e;
    }
  }

  function clearMessages(): void {
    messages.value = [];
  }

  async function searchMessages(query: string) {
    if (!currentChatId.value || !query.trim()) {
      searchResults.value = [];
      return;
    }
    searching.value = true;
    try {
      searchResults.value = await chatApi.searchMessages(currentChatId.value, query);
    } catch {
      searchResults.value = [];
    } finally {
      searching.value = false;
    }
  }

  function clearSearch() {
    searchQuery.value = '';
    searchResults.value = [];
  }

  function abortGeneration(): void {
    if ((!isStreaming.value && !sending.value) || !currentChatId.value || stopping.value) return;
    if (httpGenerationController) {
      stopping.value = true;
      httpGenerationController.abort();
      return;
    }
    if (wsConnected.value && wsClient) {
      stopping.value = true;
      if (activeRequestId) wsClient.sendAbortGeneration(currentChatId.value, activeRequestId);
      else wsClient.sendAbortGeneration(currentChatId.value);
      return;
    }
    error.value = i18n.global.t('chat.stopUnavailable');
  }

  async function rollbackToMessage(messageId: string) {
    if (!currentChatId.value) return;
    const result = await chatApi.rollbackChat(currentChatId.value, Number(messageId));
    // Refresh messages after rollback
    await fetchMessages(currentChatId.value);
    return result.deletedCount;
  }

  // Simple in-memory cache for models (rarely change)
  const modelsCache: { data: ModelMeta[] | null; timestamp: number } = { data: null, timestamp: 0 };
  const MODELS_CACHE_TTL = 300000; // 5 minutes

  async function fetchModels(): Promise<void> {
    const version = accountVersion;
    const now = Date.now();
    if (modelsCache.data && now - modelsCache.timestamp < MODELS_CACHE_TTL) {
      availableModels.value = modelsCache.data;
      return;
    }
    try {
      const models = await llmApi.getModels();
      if (version !== accountVersion) return;
      availableModels.value = models;
      modelsCache.data = models;
      modelsCache.timestamp = now;
    } catch (e) {
      logger.error('Failed to fetch models', e);
    }
  }

  async function switchModel(model: string): Promise<void> {
    if (!currentChatId.value) return;
    try {
      await chatApi.updateChatModel(currentChatId.value, model);
      // Update local chat metadata
      const index = chats.value.findIndex(c => c.id === currentChatId.value);
      if (index !== -1) {
        const chat = chats.value[index];
        chats.value[index] = {
          ...chat,
          metadata: { ...chat.metadata, model },
        };
      }
    } catch (e) {
      logger.error('Failed to switch model', e);
      throw e;
    }
  }

  /**
   * Fetch branch siblings for a message
   */
  async function fetchBranches(messageId: number): Promise<void> {
    if (!currentChatId.value) return;
    try {
      const siblings = await chatApi.getBranches(currentChatId.value, messageId);
      if (siblings.length > 1) {
        const currentIndex = siblings.findIndex(s => String(s.id) === String(messageId));
        branchCache.value.set(messageId, {
          siblings,
          currentIndex: currentIndex >= 0 ? currentIndex : 0,
        });
      }
    } catch (e) {
      logger.error('Failed to fetch branches', e);
    }
  }

  /**
   * Check if a message has branches (2+ siblings)
   */
  function hasBranches(messageId: number): boolean {
    const entry = branchCache.value.get(messageId);
    return !!entry && entry.siblings.length > 1;
  }

  /**
   * Get branch info for a message (for UI display)
   */
  function getBranchInfo(messageId: number): { currentIndex: number; total: number } | null {
    const entry = branchCache.value.get(messageId);
    if (!entry || entry.siblings.length < 2) return null;
    return { currentIndex: entry.currentIndex, total: entry.siblings.length };
  }

  /**
   * Switch to a sibling branch message
   */
  async function switchBranch(messageId: number, direction: 'prev' | 'next'): Promise<void> {
    const entry = branchCache.value.get(messageId);
    if (!entry || entry.siblings.length < 2) return;

    const newIndex = direction === 'prev' ? entry.currentIndex - 1 : entry.currentIndex + 1;
    if (newIndex < 0 || newIndex >= entry.siblings.length) return;

    const newMessage = entry.siblings[newIndex];
    const oldMessageIdStr = String(messageId);

    // Replace the message in the displayed messages array
    const msgIndex = messages.value.findIndex(m => m.id === oldMessageIdStr);
    if (msgIndex === -1) return;

    messages.value[msgIndex] = newMessage;

    // Update the branch cache: remove old key, add new key
    branchCache.value.delete(messageId);
    const newMsgId = Number(newMessage.id);
    branchCache.value.set(newMsgId, {
      siblings: entry.siblings,
      currentIndex: newIndex,
    });

    // Reload messages after the switched message to show the correct branch path
    if (currentChatId.value) {
      try {
        const response = await chatApi.getMessages(currentChatId.value, {
          after: newMsgId,
          limit: 50,
        });
        // Keep messages up to and including the switched message, then append the new tail
        const kept = messages.value.slice(0, msgIndex + 1);
        messages.value = [...kept, ...response.messages];
      } catch (e) {
        logger.error('Failed to reload branch messages', e);
      }
    }
  }

  /**
   * Clear branch cache (e.g. when switching chats)
   */
  function clearBranchCache(): void {
    branchCache.value.clear();
  }

  /**
   * Send typing start event via WebSocket
   */
  function sendTypingStart(): void {
    const chatId = currentChatId.value;
    if (!chatId || !wsClient) return;
    wsClient.sendTyping(chatId, true);
  }

  /**
   * Send typing stop event via WebSocket
   */
  function sendTypingStop(): void {
    const chatId = currentChatId.value;
    if (!chatId || !wsClient) return;
    wsClient.sendTyping(chatId, false);
  }

  /**
   * Mark a chat as read by sending a read receipt via WebSocket
   */
  function markChatAsRead(chatId: string, lastMessageId: string | number): void {
    if (!wsClient) return;
    wsClient.sendChatRead(chatId, String(lastMessageId));
    // Optimistically update local state
    const chat = chats.value.find((c: any) => c.id === chatId);
    if (chat) chat.unreadCount = 0;
  }

  /**
   * Handle remote user typing event from WebSocket
   */
  function handleRemoteTyping(data: { chatId: string; userId: string; userName?: string; isTyping?: boolean }): void {
    if (data.chatId !== currentChatId.value) return;
    const key = data.userId;
    const existing = typingUsers.value.get(key);
    if (existing) clearTimeout(existing.timeout);

    if (data.isTyping !== false) {
      const timeout = setTimeout(() => {
        typingUsers.value.delete(key);
      }, 5000);
      typingUsers.value.set(key, { userId: data.userId, userName: data.userName || 'Someone', timeout });
    } else {
      typingUsers.value.delete(key);
    }
  }

  /**
   * Fetch pinned messages for a chat
   */
  async function fetchPinnedMessages(chatId: string) {
    const version = selectionVersion;
    try {
      const response = await api.get<any[]>(`/chats/${chatId}/pinned`);
      if (version !== selectionVersion) return;
      pinnedMessages.value = response || [];
    } catch {
      if (version === selectionVersion) pinnedMessages.value = [];
    }
  }

  /**
   * Toggle pin state of a message
   */
  async function togglePin(chatId: string, messageId: string, isPinned: boolean) {
    try {
      if (isPinned) {
        await api.delete(`/chats/${chatId}/messages/${messageId}/pin`);
      } else {
        await api.post(`/chats/${chatId}/messages/${messageId}/pin`);
      }
      // Update local message state
      const msg = messages.value.find(m => String(m.id) === String(messageId));
      if (msg) {
        if (!msg.extra) msg.extra = {};
        (msg.extra as Record<string, unknown>).pinned = !isPinned;
      }
      // Refresh pinned list
      await fetchPinnedMessages(chatId);
    } catch (e) {
      logger.error('Failed to toggle pin', e);
    }
  }

  /**
   * Set or clear the message being replied to
   */
  function setReplyTo(message: { id: string; content: string; role: string } | null) {
    replyingTo.value = message ? { messageId: message.id, content: message.content, role: message.role } : null;
  }

  const userStore = useUserStore();
  watch(() => userStore.user ? JSON.stringify([userStore.user.tenantId, userStore.user.id]) : null, () => {
    accountVersion += 1;
    chatsVersion += 1;
    disconnectWebSocket();
    void setCurrentChat(null);
    chats.value = [];
    availableModels.value = [];
    modelsCache.data = null;
    pinnedMessages.value = [];
    searchResults.value = [];
  }, { flush: 'sync' });

  return {
    chats,
    currentChatId,
    currentChat,
    currentCharacter,
    chatCharacters,
    messages,
    loading,
    sending,
    error,
    wsConnected,
    wsConnectionState,
    streamingMessage,
    streamingCharacterId,
    streamingCharacterName,
    isStreaming,
    stopping,
    billingRevision,
    hasMoreMessages,
    loadingOlder,
    searchResults,
    searchQuery,
    searching,
    availableModels,
    currentModel,
    currentModelContextWindow,
    canRetryGeneration,
    contextRecovery,
    takeContextInput,
    fetchChats,
    fetchMessages,
    fetchOlderMessages,
    sendMessage,
    retryLastGeneration,
    createChat,
    deleteChat,
    deleteMessage,
    editMessage,
    regenerateMessage,
    renameChat,
    setCurrentChat,
    addMessage,
    addGreetingMessage,
    clearMessages,
    searchMessages,
    clearSearch,
    abortGeneration,
    rollbackToMessage,
    fetchModels,
    switchModel,
    branchCache,
    fetchBranches,
    hasBranches,
    getBranchInfo,
    switchBranch,
    clearBranchCache,
    typingUsers,
    sendTypingStart,
    sendTypingStop,
    markChatAsRead,
    handleRemoteTyping,
    initWebSocket,
    disconnectWebSocket,
    replyingTo,
    setReplyTo,
    pinnedMessages,
    fetchPinnedMessages,
    togglePin,
  };
});
