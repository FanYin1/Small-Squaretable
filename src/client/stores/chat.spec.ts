/**
 * Chat Store 测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from './chat';
import { useUserStore } from './user';
import { chatApi, llmApi, ApiError } from '@client/services';
import { showInsufficientCreditsAlert } from '@client/utils/credit-alert';
import type { Chat, Message } from '@client/types';
import i18n from '@client/i18n';

// 捕获 store 注册到 WebSocketClient 的事件处理器，测试里手动触发
const wsHandlers = vi.hoisted(() => new Map<string, (data: unknown) => void>());
const abortRequest = vi.hoisted(() => vi.fn());
const sendMessageRequest = vi.hoisted(() => vi.fn());

describe('Platform generation limit messages', () => {
  it.each([
    ['PLATFORM_SPEND_LIMIT', 'platformSpendLimit'],
    ['PLATFORM_SPEND_UNAVAILABLE', 'platformSpendUnavailable'],
  ])('distinguishes %s from account credit errors', (code, key) => {
    setActivePinia(createPinia());
    const store = useChatStore();
    store.initWebSocket('token');
    wsHandlers.get('error')!({ code, message: 'server error' });
    expect(store.error).toBe(i18n.global.t(`chat.${key}`));
    expect(showInsufficientCreditsAlert).not.toHaveBeenCalled();
    store.disconnectWebSocket();
  });
});

vi.mock('@client/services/websocket', () => ({
  WebSocketClient: class {
    on(event: string, handler: (data: unknown) => void) {
      wsHandlers.set(event, handler);
    }
    connect() {}
    disconnect() {}
    joinChat() {}
    leaveChat() {}
    sendMessage = sendMessageRequest;
    sendAbortGeneration = abortRequest;
  },
}));

vi.mock('@client/utils/credit-alert', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@client/utils/credit-alert');
  return { ...actual, showInsufficientCreditsAlert: vi.fn() };
});


vi.mock('@client/services', () => ({
  chatApi: {
    getChats: vi.fn(),
    getChat: vi.fn(),
    getChatCharacters: vi.fn(),
    createChat: vi.fn(),
    deleteChat: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    updateChatModel: vi.fn(),
  },
  llmApi: {
    getModels: vi.fn(),
    streamChatCompletion: vi.fn().mockImplementation((_params: any, _onChunk: any, onDone: any) => {
      // Immediately call onDone to simulate completion
      if (onDone) onDone();
      return Promise.resolve();
    }),
  },
  characterApi: {
    getCharacter: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public details?: unknown
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

describe('Chat Store', () => {
  it('applies an acknowledged model change to its original story if navigation occurs while saving', async () => {
    setActivePinia(createPinia());
    const store = useChatStore();
    store.chats = [
      { id: 'original', title: 'Original', createdAt: '' },
      { id: 'next', title: 'Next', createdAt: '' },
    ];
    store.currentChatId = 'original';
    let acknowledge!: () => void;
    vi.mocked(chatApi.updateChatModel).mockImplementation(() => new Promise<void>(resolve => { acknowledge = resolve; }));
    const switching = store.switchModel('configured-model');
    store.currentChatId = 'next';
    acknowledge();
    await switching;
    expect(store.chats[0].metadata?.model).toBe('configured-model');
    expect(store.chats[1].metadata?.model).toBeUndefined();
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(chatApi.getChat).mockImplementation(async (chatId) => ({
      chat: { id: chatId, title: chatId, characterId: 'char1', characterName: 'Character', createdAt: '2024-01-01' },
    }));
    vi.mocked(chatApi.getChatCharacters).mockResolvedValue([]);
  });

  it.each(['sending', 'stopping', 'isStreaming'] as const)('blocks model switching while %s without changing selection', async state => {
    const store = useChatStore(); store.currentChatId = 'active';
    store.chats = [{ id: 'active', title: 'Story', createdAt: '', metadata: { model: 'original' } }];
    store[state] = true;
    await expect(store.switchModel('next-model')).rejects.toThrow('等待当前回复');
    expect(chatApi.updateChatModel).not.toHaveBeenCalled();
    expect(store.currentModel).toBe('original');
  });

  describe('fetchModels', () => {
    const model = (id: string) => ({ id, provider: 'custom', contextWindow: 128000, maxOutputTokens: 4096, defaultTemperature: 0.7 });

    it('reads updated runtime models immediately without replacing the selected model', async () => {
      const store = useChatStore();
      store.chats = [{ id: 'story', title: 'Story', createdAt: '', metadata: { model: 'original' } }];
      store.currentChatId = 'story';
      vi.mocked(llmApi.getModels).mockResolvedValueOnce([model('original')])
        .mockResolvedValueOnce([model('original'), model('added')]);
      await store.fetchModels();
      await store.fetchModels();
      expect(llmApi.getModels).toHaveBeenCalledTimes(2);
      expect(store.availableModels.map(m => m.id)).toEqual(['original', 'added']);
      expect(store.currentModel).toBe('original');
      expect(chatApi.updateChatModel).not.toHaveBeenCalled();
    });

    it('shares concurrent reads and ends the loading state', async () => {
      const store = useChatStore();
      let resolve!: (models: ReturnType<typeof model>[]) => void;
      vi.mocked(llmApi.getModels).mockReturnValueOnce(new Promise(done => { resolve = done; }));
      const first = store.fetchModels();
      const second = store.fetchModels();
      expect(store.modelsLoading).toBe(true);
      expect(llmApi.getModels).toHaveBeenCalledTimes(1);
      resolve([model('added')]);
      await Promise.all([first, second]);
      expect(store.availableModels.map(m => m.id)).toEqual(['added']);
      expect(store.modelsLoading).toBe(false);
    });

    it('keeps the last valid list on failure and clears the error on retry', async () => {
      const store = useChatStore();
      vi.mocked(llmApi.getModels).mockResolvedValueOnce([model('original')])
        .mockRejectedValueOnce(new Error('Unavailable'))
        .mockResolvedValueOnce([model('replacement')]);
      await store.fetchModels();
      await store.fetchModels();
      expect(store.availableModels.map(m => m.id)).toEqual(['original']);
      expect(store.modelsError).toBe(i18n.global.t('modelPicker.loadFailed'));
      expect(store.modelsLoading).toBe(false);
      await store.fetchModels();
      expect(store.availableModels.map(m => m.id)).toEqual(['replacement']);
      expect(store.modelsError).toBe('');
    });

    it('isolates late results and loading state after account switching', async () => {
      const user = useUserStore();
      user.user = { id: 'reader-a', tenantId: 'tenant-a', name: 'A', email: 'a@example.test', createdAt: '' };
      const store = useChatStore();
      let resolveOld!: (models: ReturnType<typeof model>[]) => void;
      let resolveNew!: (models: ReturnType<typeof model>[]) => void;
      vi.mocked(llmApi.getModels)
        .mockReturnValueOnce(new Promise(done => { resolveOld = done; }))
        .mockReturnValueOnce(new Promise(done => { resolveNew = done; }));
      const oldRequest = store.fetchModels();
      user.user = { ...user.user, id: 'reader-b', tenantId: 'tenant-b' };
      const newRequest = store.fetchModels();
      resolveOld([model('old-account')]);
      await oldRequest;
      expect(store.availableModels).toEqual([]);
      expect(store.modelsLoading).toBe(true);
      resolveNew([model('new-account')]);
      await newRequest;
      expect(store.availableModels.map(m => m.id)).toEqual(['new-account']);
      expect(store.modelsLoading).toBe(false);
    });
  });

  describe('fetchChats', () => {
    it('clears story state and ignores late list responses after account switching', async () => {
      const userStore = useUserStore();
      userStore.user = { id: 'reader-a', tenantId: 'tenant-a', name: 'A', email: 'a@example.test', createdAt: '' };
      const store = useChatStore();
      store.chats = [{ id: 'private-story', title: 'Private', characterId: 'char1', characterName: 'Private', createdAt: '' }];
      store.currentChatId = 'private-story';
      let resolve!: (value: { chats: Chat[] }) => void;
      vi.mocked(chatApi.getChats).mockReturnValue(new Promise(success => { resolve = success; }));
      const pending = store.fetchChats();
      const oldChats = [...store.chats];
      userStore.user = { ...userStore.user, id: 'reader-b', tenantId: 'tenant-b' };
      expect(store.chats).toEqual([]);
      expect(store.currentChatId).toBeNull();
      resolve({ chats: oldChats });
      await pending;
      expect(store.chats).toEqual([]);
      expect(store.loading).toBe(false);
    });

    it('should fetch chats successfully', async () => {
      const mockChats: Chat[] = [
        {
          id: '1',
          title: 'Chat 1',
          characterId: 'char1',
          characterName: 'Character 1',
          createdAt: '2024-01-01',
        },
        {
          id: '2',
          title: 'Chat 2',
          characterId: 'char2',
          characterName: 'Character 2',
          createdAt: '2024-01-02',
        },
      ];

      vi.mocked(chatApi.getChats).mockResolvedValue({ chats: mockChats });

      const store = useChatStore();
      await store.fetchChats();

      expect(store.chats).toEqual(mockChats);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should handle fetch chats error', async () => {
      const error = new ApiError(500, 'SERVER_ERROR', 'Server error');
      vi.mocked(chatApi.getChats).mockRejectedValue(error);

      const store = useChatStore();
      await expect(store.fetchChats()).rejects.toThrow();

      expect(store.error).toBe('Server error');
      expect(store.chats).toEqual([]);
    });
  });

  describe('fetchMessages', () => {
    it('should fetch messages successfully', async () => {
      const mockMessages: Message[] = [
        {
          id: '1',
          chatId: 'chat1',
          role: 'user',
          content: 'Hello',
          createdAt: '2024-01-01',
        },
        {
          id: '2',
          chatId: 'chat1',
          role: 'assistant',
          content: 'Hi there!',
          createdAt: '2024-01-01',
        },
      ];

      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: mockMessages });

      const store = useChatStore();
      await store.fetchMessages('chat1');

      expect(store.messages).toEqual(mockMessages);
      expect(store.loading).toBe(false);
    });

    it('should handle fetch messages error', async () => {
      const error = new ApiError(404, 'NOT_FOUND', 'Chat not found');
      vi.mocked(chatApi.getMessages).mockRejectedValue(error);

      const store = useChatStore();
      await expect(store.fetchMessages('invalid')).rejects.toThrow();

      expect(store.error).toBe('Chat not found');
    });
  });

  describe('sendMessage', () => {
    it('keeps an offline action unsent rather than bypassing saved worldbooks through HTTP', async () => {
      const store = useChatStore();
      store.currentChatId = 'story';
      store.chats = [{ id: 'story', worldbookSnapshotVersion: 1 } as Chat];
      const accepted = vi.fn();
      await expect(store.sendMessage('Ask about the map', undefined, undefined, accepted)).rejects.toThrow();
      expect(chatApi.sendMessage).not.toHaveBeenCalled();
      expect(llmApi.streamChatCompletion).not.toHaveBeenCalled();
      expect(accepted).not.toHaveBeenCalled();
      expect(store.messages).toHaveLength(0);
      expect(store.sending).toBe(false);
    });

    it('uses the fixed identity in HTTP fallback after the source persona is deleted', async () => {
      const store = useChatStore();
      store.currentChatId = 'story';
      store.chats = [{ id: 'story', personaId: null, identitySnapshot: {
        protocol: 1, source: 'persona', sourceId: '550e8400-e29b-41d4-a716-446655440003',
        userId: '550e8400-e29b-41d4-a716-446655440001', tenantId: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Original traveler', description: 'Keeps promises', revision: 'a'.repeat(64), capturedAt: '2026-10-23T00:00:00.000Z',
      } } as Chat];
      store.chatCharacters = [{ id: 'character', name: 'Guide', description: 'Guide for {{user}}', isPublic: false, createdAt: '' }];
      vi.mocked(chatApi.sendMessage).mockResolvedValue({ message: { id: 'saved', chatId: 'story', role: 'user', content: 'Hello', createdAt: '' } });
      vi.mocked(llmApi.streamChatCompletion).mockResolvedValue(undefined);
      await store.sendMessage('Hello');
      const request = vi.mocked(llmApi.streamChatCompletion).mock.calls[0][0];
      expect(request.messages[0].content).toContain('Guide for Original traveler');
      expect(request.messages[0].content).toContain('[User Persona: Original traveler]\nKeeps promises');
    });

    it('acknowledges HTTP persistence before generation fails', async () => {
      const store = useChatStore();
      store.currentChatId = 'story';
      store.chatCharacters = [{ id: 'character', name: 'Character', isPublic: false, createdAt: '' }];
      const accept = vi.fn();
      vi.mocked(chatApi.sendMessage).mockResolvedValue({ message: { id: 'saved', chatId: 'story', role: 'user', content: 'Hello', createdAt: '' } });
      vi.mocked(llmApi.streamChatCompletion).mockImplementationOnce(async () => {
        expect(accept).toHaveBeenCalledOnce();
        throw new Error('generation failed');
      });
      await expect(store.sendMessage('Hello', undefined, undefined, accept)).rejects.toThrow('generation failed');
      expect(accept).toHaveBeenCalledOnce();
    });

    it('does not acknowledge a rejected HTTP user message', async () => {
      const store = useChatStore();
      store.currentChatId = 'story';
      const accept = vi.fn();
      vi.mocked(chatApi.sendMessage).mockRejectedValueOnce(new Error('rejected'));
      await expect(store.sendMessage('Hello', undefined, undefined, accept)).rejects.toThrow('rejected');
      expect(accept).not.toHaveBeenCalled();
    });

    it('waits for the persisted WebSocket user message before acknowledging', async () => {
      const store = useChatStore();
      store.currentChatId = 'story';
      store.initWebSocket('token');
      store.wsConnected = true;
      const accept = vi.fn();
      await store.sendMessage('Hello', undefined, undefined, accept);
      expect(accept).not.toHaveBeenCalled();
      wsHandlers.get('userMessage')!({ chatId: 'other', messageId: 'other', content: 'Hello' });
      expect(accept).not.toHaveBeenCalled();
      const clientMessageId = store.messages[0].id;
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: 'another-device', clientMessageId: 'other-request', content: 'Hello' });
      expect(accept).not.toHaveBeenCalled();
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: 'saved', clientMessageId, content: 'Hello' });
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: 'saved', clientMessageId, content: 'Hello' });
      expect(accept).toHaveBeenCalledOnce();
    });

    it('ignores a greeting response after leaving the story', async () => {
      const store = useChatStore();
      store.currentChatId = 'story';
      let resolve!: (result: Awaited<ReturnType<typeof chatApi.sendMessage>>) => void;
      vi.mocked(chatApi.sendMessage).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
      const pending = store.addGreetingMessage('story', 'Welcome');
      await store.setCurrentChat(null);
      resolve({ message: { id: 'greeting', chatId: 'story', role: 'assistant', content: 'Welcome', createdAt: '' } });
      await pending;
      expect(store.messages).toEqual([]);
    });

    it('should send message successfully', async () => {
      const mockMessage: Message = {
        id: '3',
        chatId: 'chat1',
        role: 'user',
        content: 'Test message',
        createdAt: '2024-01-01',
      };

      vi.mocked(chatApi.sendMessage).mockResolvedValue({ message: mockMessage });

      const store = useChatStore();
      store.currentChatId = 'chat1';

      await store.sendMessage('Test message');

      expect(store.messages).toContainEqual(mockMessage);
      expect(store.sending).toBe(false);
    });

    it('should throw error if no active chat', async () => {
      const store = useChatStore();

      await expect(store.sendMessage('Test')).rejects.toThrow('No active chat');
    });

    it('should handle send message error', async () => {
      const error = new ApiError(429, 'QUOTA_EXCEEDED', 'Quota exceeded');
      vi.mocked(chatApi.sendMessage).mockRejectedValue(error);

      const store = useChatStore();
      store.currentChatId = 'chat1';

      await expect(store.sendMessage('Test')).rejects.toThrow();

      expect(store.error).toBe('Quota exceeded');
    });
  });

  describe('点数不足报警 (INSUFFICIENT_CREDITS)', () => {
    const details = { requiredPoints: 3, availablePoints: 1 };

    it('WebSocket error 事件：设置错误文案、复位发送状态并弹出报警', () => {
      wsHandlers.clear();
      const store = useChatStore();
      store.initWebSocket('token');
      store.sending = true;
      store.isStreaming = true;

      wsHandlers.get('error')!({ code: 'INSUFFICIENT_CREDITS', message: 'Insufficient credits', details });

      expect(store.error).toBe(i18n.global.t('credits.insufficient'));
      expect(store.sending).toBe(false);
      expect(store.isStreaming).toBe(false);
      expect(showInsufficientCreditsAlert).toHaveBeenCalledTimes(1);
      expect(showInsufficientCreditsAlert).toHaveBeenCalledWith(details);
    });

    it('WebSocket error 事件：其他错误码不弹报警', () => {
      wsHandlers.clear();
      const store = useChatStore();
      store.initWebSocket('token');

      wsHandlers.get('error')!({ code: 'MESSAGE_ERROR', message: 'boom' });

      expect(store.error).toBe('boom');
      expect(showInsufficientCreditsAlert).not.toHaveBeenCalled();
    });

    it('HTTP 流式请求 402：设置错误文案、复位状态并弹出报警', async () => {
      vi.mocked(chatApi.sendMessage).mockResolvedValue({
        message: { id: '3', chatId: 'chat1', role: 'user', content: 'hi', createdAt: '2024-01-01' },
      });
      vi.mocked(llmApi.streamChatCompletion).mockRejectedValueOnce(
        new ApiError(402, 'INSUFFICIENT_CREDITS', 'Insufficient credits', details)
      );

      const store = useChatStore();
      store.currentChatId = 'chat1';
      store.chatCharacters = [{ id: 'c1', name: 'Alice' } as never];

      await expect(store.sendMessage('hi')).rejects.toThrow('Insufficient credits');

      expect(store.error).toBe(i18n.global.t('credits.insufficient'));
      expect(store.sending).toBe(false);
      expect(store.isStreaming).toBe(false);
      expect(showInsufficientCreditsAlert).toHaveBeenCalledWith(details);
    });
  });

  describe('createChat', () => {
    it('forwards the request key and keeps only one sidebar entry on replay', async () => {
      const chat: Chat = { id: 'replayed', title: 'Story', characterId: 'first', createdAt: '' };
      vi.mocked(chatApi.createChat).mockResolvedValue({ chat });
      const store = useChatStore();
      await store.createChat('first', 'Story', ['first', 'second'], 'persona', 'request-key');
      await store.createChat('first', 'Story', ['first', 'second'], 'persona', 'request-key');
      expect(chatApi.createChat).toHaveBeenLastCalledWith({
        characterIds: ['first', 'second'], title: 'Story', personaId: 'persona', clientRequestId: 'request-key',
      });
      expect(store.chats.filter(item => item.id === chat.id)).toHaveLength(1);
    });

    it('should create chat successfully', async () => {
      const mockChat: Chat = {
        id: 'new-chat',
        title: 'New Chat',
        characterId: 'char1',
        characterName: 'Character 1',
        createdAt: '2024-01-01',
      };

      vi.mocked(chatApi.createChat).mockResolvedValue({ chat: mockChat });

      const store = useChatStore();
      const result = await store.createChat('char1', 'New Chat');

      expect(result).toEqual(mockChat);
      expect(store.chats).toContainEqual(mockChat);
      expect(store.chats[0]).toEqual(mockChat); // Should be at the beginning
    });

    it('should handle create chat error', async () => {
      const error = new ApiError(400, 'INVALID_CHARACTER', 'Invalid character');
      vi.mocked(chatApi.createChat).mockRejectedValue(error);

      const store = useChatStore();
      await expect(store.createChat('invalid')).rejects.toThrow();

      expect(store.error).toBe('Invalid character');
    });
  });

  describe('deleteChat', () => {
    it('should delete chat successfully', async () => {
      vi.mocked(chatApi.deleteChat).mockResolvedValue(undefined);

      const store = useChatStore();
      store.chats = [
        {
          id: '1',
          title: 'Chat 1',
          characterId: 'char1',
          characterName: 'Character 1',
          createdAt: '2024-01-01',
        },
        {
          id: '2',
          title: 'Chat 2',
          characterId: 'char2',
          characterName: 'Character 2',
          createdAt: '2024-01-02',
        },
      ];

      await store.deleteChat('1');

      expect(store.chats).toHaveLength(1);
      expect(store.chats[0].id).toBe('2');
    });

    it('should clear current chat if deleted', async () => {
      vi.mocked(chatApi.deleteChat).mockResolvedValue(undefined);

      const store = useChatStore();
      store.currentChatId = '1';
      store.messages = [
        {
          id: 'm1',
          chatId: '1',
          role: 'user',
          content: 'Test',
          createdAt: '2024-01-01',
        },
      ];
      store.chats = [
        {
          id: '1',
          title: 'Chat 1',
          characterId: 'char1',
          characterName: 'Character 1',
          createdAt: '2024-01-01',
        },
      ];

      await store.deleteChat('1');

      expect(store.currentChatId).toBeNull();
      expect(store.messages).toEqual([]);
    });
  });

  describe('setCurrentChat', () => {
    it('does not restore an old selection after a slow summary response', async () => {
      let finishOld!: (response: { chat: Chat }) => void;
      vi.mocked(chatApi.getChat).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [] });
      const store = useChatStore();
      const oldSelection = store.setCurrentChat('old');
      await store.setCurrentChat('new');
      finishOld({ chat: { id: 'old', characterId: 'char1', characterName: 'Old', createdAt: '2024-01-01' } });
      await oldSelection;
      expect(store.currentChatId).toBe('new');
      expect(store.currentChat?.id).toBe('new');
      expect(chatApi.getMessages).not.toHaveBeenCalledWith('old', expect.anything());
    });

    it('discards old message responses when the user switches stories', async () => {
      let finishOld!: (response: { messages: Message[] }) => void;
      vi.mocked(chatApi.getMessages).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
      vi.mocked(chatApi.getMessages).mockResolvedValueOnce({ messages: [] });
      const store = useChatStore();
      store.chats = ['old', 'new'].map(id => ({ id, characterId: 'char1', characterName: id, createdAt: '2024-01-01' }));
      const oldSelection = store.setCurrentChat('old');
      await store.setCurrentChat('new');
      finishOld({ messages: [{ id: '1', chatId: 'old', role: 'user', content: 'Old story', createdAt: '2024-01-01' }] });
      await oldSelection;
      expect(store.messages).toEqual([]);
      expect(store.currentChatId).toBe('new');
    });

    it('rejects an unavailable deep link without retaining another story', async () => {
      vi.mocked(chatApi.getChat).mockRejectedValueOnce(new Error('Not found'));
      const store = useChatStore();
      store.currentChatId = 'old';
      await expect(store.setCurrentChat('missing')).rejects.toThrow('Not found');
      expect(store.currentChatId).toBeNull();
      expect(store.messages).toEqual([]);
      expect(store.loading).toBe(false);
    });

    it('ignores older pages that arrive after leaving a story', async () => {
      let finishPage!: (response: { messages: Message[]; hasMore: boolean }) => void;
      vi.mocked(chatApi.getMessages).mockImplementationOnce(() => new Promise(resolve => { finishPage = resolve; }));
      const store = useChatStore();
      const oldMessage: Message = { id: '20', chatId: 'old', role: 'user', content: 'Old', createdAt: '' };
      store.currentChatId = 'old';
      store.messages = [oldMessage];
      const pendingPage = store.fetchOlderMessages();
      await store.setCurrentChat(null);
      finishPage({ messages: [oldMessage], hasMore: false });
      await pendingPage;
      expect(store.messages).toEqual([]);
      expect(store.loadingOlder).toBe(false);
    });
    it('should set current chat and fetch messages', async () => {
      const mockMessages: Message[] = [
        {
          id: '1',
          chatId: 'chat1',
          role: 'user',
          content: 'Hello',
          createdAt: '2024-01-01',
        },
      ];

      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: mockMessages });

      const store = useChatStore();
      await store.setCurrentChat('chat1');

      expect(store.currentChatId).toBe('chat1');
      expect(store.messages).toEqual(mockMessages);
    });

    it('loads a deep-linked chat summary when it is not in the sidebar list', async () => {
      const deepLinkedChat: Chat = {
        id: 'deep-linked-chat',
        title: 'A restored story',
        characterId: 'char1',
        characterName: 'Character 1',
        createdAt: '2024-01-01',
      };
      vi.mocked(chatApi.getChat).mockResolvedValue({ chat: deepLinkedChat });
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [] });

      const store = useChatStore();
      await store.setCurrentChat(deepLinkedChat.id);

      expect(chatApi.getChat).toHaveBeenCalledWith(deepLinkedChat.id);
      expect(store.currentChat).toEqual(deepLinkedChat);
      expect(store.currentChatId).toBe(deepLinkedChat.id);
    });

    it('should clear messages when setting to null', async () => {
      const store = useChatStore();
      store.messages = [
        {
          id: '1',
          chatId: 'chat1',
          role: 'user',
          content: 'Test',
          createdAt: '2024-01-01',
        },
      ];

      await store.setCurrentChat(null);

      expect(store.currentChatId).toBeNull();
      expect(store.messages).toEqual([]);
    });
  });

  describe('provisional replies and timing', () => {
    afterEach(() => vi.restoreAllMocks());

    async function start() {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [], hasMore: false });
      await store.sendMessage('Private user input');
      return { store, requestId: store.messages[0].id };
    }

    it('tracks control and validation phases without appending text or finishing before commit, and resets on failure', async () => {
      const { store, requestId } = await start();
      const chunk = (phase?: string) => wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: phase ? '' : '正文。', provisional: true, phase });
      chunk(); expect(store.streamingPhase).toBe('body');
      chunk('control'); expect(store.streamingPhase).toBe('control');
      expect(store.streamingMessage).toBe('正文。'); expect(store.sending).toBe(true);
      chunk('validating'); chunk('control'); expect(store.streamingPhase).toBe('validating');
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'other', requestId, chunk: '', phase: 'control' });
      expect(store.streamingPhase).toBe('validating');
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable: false });
      expect(store.streamingPhase).toBe('body'); expect(store.sending).toBe(false); expect(store.isStreaming).toBe(false);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('retains the saved validation reason through DONE and recovery without offering a transport retry', async () => {
      const { store, requestId } = await start();
      const storyDiagnostics = { version: 1, model: 'selected-model', finishReason: 'stop', protocol: 'text-tag-v1',
        validation: 'failed', code: 'invalid_json', warnings: [] };
      const saved: Message = { id: '102', chatId: 'story', role: 'assistant', content: '本轮未提交状态变化。', createdAt: '',
        extra: { storyRequestId: requestId, storyIntentInvalid: true, stateStatus: 'interrupted', storyDiagnostics } };
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [saved], hasMore: false });
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: '尚未校验的正文', provisional: true });
      wsHandlers.get('assistantMessageDone')!({ chatId: 'story', requestId, messageId: saved.id, content: saved.content,
        storyIntentInvalid: true, stateStatus: 'interrupted', storyDiagnostics });
      expect(store.messages.at(-1)?.extra).toEqual(saved.extra);
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable: false, errorCode: 'STORY_INVALID_JSON' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(store.messages.at(-1)).toEqual(saved);
      expect(store.error).toBeNull();
      expect(store.canRetryGeneration).toBe(false);
      expect(store.sending).toBe(false);
      expect(store.streamingMessage).toBe('');
      expect(sendMessageRequest).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['经过正则的权威正文', {}],
      ['本轮校验失败，未推进故事。', { storyIntentInvalid: true, stateStatus: 'invalid' }],
      ['', {}],
    ])('replaces provisional text with authoritative content (%s), including duplicate acknowledgements', async (content, extra) => {
      const { store, requestId } = await start();
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: '尚未校验的正文', provisional: true,
        stateStatus: 'confirmed', storyRecommendations: [{ label: '不可提前生效', input: '继续' }] });
      expect(store.streamingProvisional).toBe(true);
      expect(store.messages.filter(message => message.role === 'assistant')).toEqual([]);
      const done = { chatId: 'story', requestId, messageId: '102', content, ...extra };
      wsHandlers.get('assistantMessageDone')!(done);
      wsHandlers.get('assistantMessageDone')!(done);
      expect(store.messages.filter(message => message.role === 'assistant')).toEqual([
        expect.objectContaining({ id: '102', content, extra: expect.objectContaining(extra) }),
      ]);
      expect(store.streamingMessage).toBe('');
      expect(store.streamingProvisional).toBe(false);
      expect(store.isStreaming).toBe(false);
    });

    it('accepts authoritative done without a chunk, and retains the old no-content protocol', async () => {
      const { store, requestId } = await start();
      wsHandlers.get('assistantMessageDone')!({ chatId: 'story', requestId, messageId: '102', content: '完整回复' });
      expect(store.messages.at(-1)?.content).toBe('完整回复');
      expect(store.replyTiming?.firstChunkAt).toBeNull();
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: '旧协议正文' });
      wsHandlers.get('assistantMessageDone')!({ chatId: 'story', requestId, messageId: '103' });
      expect(store.messages.at(-1)?.content).toBe('旧协议正文');
    });

    it('times only the first nonblank matching body chunk and logs only numbers and fixed labels', async () => {
      let now = 10;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { store, requestId } = await start();
      for (const event of [
        { chatId: 'story', requestId, chunk: '' },
        { chatId: 'story', requestId, chunk: ' \n\t' },
        { chatId: 'other', requestId, chunk: 'Other story' },
        { chatId: 'story', requestId: 'old-request', chunk: 'Old request' },
      ]) wsHandlers.get('assistantMessageChunk')!(event);
      expect(store.replyTiming?.firstChunkAt).toBeNull();
      now = 25;
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: 'Private body', provisional: true });
      now = 30;
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: 'More private body', provisional: true });
      expect(store.replyTiming?.firstChunkAt).toBe(25);
      now = 40;
      store.recordReplyPresentation(store.replyTiming!.attempt);
      store.recordReplyPresentation(store.replyTiming!.attempt);
      const metrics = log.mock.calls.filter(call => call[1] === 'reply_performance');
      expect(metrics).toEqual([
        ['[Chat]', 'reply_performance', { phase: 'first_body_chunk', attempt: 1, selection: 0, atMs: 25, sendToFirstBodyChunkMs: 15 }],
        ['[Chat]', 'reply_performance', { phase: 'presentation_approx', attempt: 1, selection: 0, atMs: 40,
          sendToFirstBodyChunkMs: 15, firstBodyChunkToPresentationApproxMs: 15, sendToPresentationApproxMs: 30 }],
      ]);
      expect(JSON.stringify(metrics)).not.toMatch(/Private|story|temp-/);
    });

    it.each(['failed', 'conflict', 'disconnect', 'missing-done'])('reconciles %s without promoting provisional body to saved text', async mode => {
      const { store, requestId } = await start();
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: '101', clientMessageId: requestId, content: 'Private user input' });
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: 'Never saved preview', provisional: true });
      const oldAttempt = store.replyTiming!.attempt;
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [
        { id: '102', chatId: 'story', role: 'assistant', content: '数据库权威回复', createdAt: '' },
      ], hasMore: false });
      if (mode === 'disconnect') {
        wsHandlers.get('disconnected')!();
        wsHandlers.get('generationState')!({ chatId: 'story', requestId, status: 'idle' });
      } else {
        if (mode === 'conflict') wsHandlers.get('error')!({ chatId: 'story', requestId, code: 'STORY_STATE_CONFLICT', message: 'Conflict' });
        wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: mode === 'missing-done' ? 'completed' : 'failed' });
      }
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(chatApi.getMessages).toHaveBeenCalled();
      expect(store.messages.filter(message => message.role === 'assistant').map(message => message.content)).toEqual(['数据库权威回复']);
      expect(store.replyTiming).toBeNull();
      store.recordReplyPresentation(oldAttempt);
      expect(store.replyTiming).toBeNull();
      expect(store.streamingProvisional).toBe(false);
    });

    it('ignores retired requests across navigation and gives same-request retries a new timing attempt', async () => {
      const { store, requestId } = await start();
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: 'First preview', provisional: true });
      const oldAttempt = store.replyTiming!.attempt;
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable: true });
      await store.retryLastGeneration();
      expect(store.replyTiming?.attempt).toBeGreaterThan(oldAttempt);
      expect(store.replyTiming?.firstChunkAt).toBeNull();
      store.recordReplyPresentation(oldAttempt);
      expect(store.replyTiming?.presentedAt).toBeNull();
      await store.setCurrentChat(null);
      store.currentChatId = 'story';
      const revision = store.billingRevision;
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: 'Stale preview', provisional: true });
      wsHandlers.get('assistantMessageDone')!({ chatId: 'story', requestId, messageId: 'old', content: 'Stale final' });
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'completed' });
      expect(store.billingRevision).toBe(revision);
      expect(store.messages).toEqual([]);
      expect(store.isStreaming).toBe(false);
      expect(store.replyTiming).toBeNull();
    });
  });

  describe('addGreetingMessage', () => {
    it('keeps streamed text until the server acknowledges a stop', () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      store.sending = true;
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', chunk: 'A train arrives.' });
      store.abortGeneration();
      store.abortGeneration();
      expect(abortRequest).toHaveBeenCalledExactlyOnceWith('story');
      expect(store.streamingMessage).toBe('A train arrives.');
      expect(store.stopping).toBe(true);
      wsHandlers.get('assistantMessageDone')!({ chatId: 'story', messageId: '42' });
      expect(store.messages[0]).toMatchObject({ id: '42', content: 'A train arrives.' });
      expect(store.stopping).toBe(false);
      expect(store.sending).toBe(false);
    });

    it('stops a WebSocket request before the first token and keeps the user message', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      await store.sendMessage('Before the first token');
      const requestId = store.messages[0].id;
      store.abortGeneration();
      expect(abortRequest).toHaveBeenCalledExactlyOnceWith('story', requestId);
      expect(store.stopping).toBe(true);
      expect(store.sending).toBe(true);
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'stopped' });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0].content).toBe('Before the first token');
      expect(store.sending).toBe(false);
      expect(store.stopping).toBe(false);
    });

    it('keeps the input locked until the whole WebSocket round finishes', () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.currentChatId = 'story';
      store.sending = true;
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId: 'round-1', chunk: 'Alice speaks.' });
      wsHandlers.get('assistantMessageDone')!({ chatId: 'story', requestId: 'round-1', messageId: 'alice-1',
        storyRecommendations: [
          { label: '查看房间', input: '我检查房间' },
          { label: '询问角色', input: '我询问她刚才的话' },
          { label: '暂时观察', input: '我先观察情况' },
        ], storyRecommendationsSource: 'generated', storyRecommendationsLead: '你可以继续了解房间，也可以另提问题。' });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0].extra).toMatchObject({ storyRecommendationsSource: 'generated',
        storyRecommendationsLead: '你可以继续了解房间，也可以另提问题。', storyRecommendations: expect.arrayContaining([
        { label: '查看房间', input: '我检查房间' },
      ]) });
      expect(store.sending).toBe(true);
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId: 'round-1', status: 'completed' });
      expect(store.sending).toBe(false);
    });

    it('retries a failed WebSocket turn with the same request id', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      await store.sendMessage('Try this again');
      const requestId = store.messages[0].id;

      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable: true });
      expect(store.canRetryGeneration).toBe(true);

      await store.retryLastGeneration();

      expect(sendMessageRequest).toHaveBeenLastCalledWith(
        'story',
        'Try this again',
        undefined,
        undefined,
        requestId,
        undefined,
        undefined
      );
      expect(store.messages.filter(message => message.role === 'user')).toHaveLength(1);
      expect(store.canRetryGeneration).toBe(false);
    });

    it('explains output truncation and prevents resending the accepted action', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      await store.sendMessage('继续查看旧书');
      const requestId = store.messages[0].id;
      wsHandlers.get('error')!({ chatId: 'story', requestId, code: 'GENERATION_OUTPUT_TRUNCATED', message: 'provider detail' });
      expect(store.error).toBe(i18n.global.t('chat.generationTruncated'));
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable: false });
      expect(store.canRetryGeneration).toBe(false);
      expect(store.contextRecovery).toBeNull();
      expect(sendMessageRequest).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['latest', 'contextBudgetInput'], ['critical', 'contextBudgetCritical'], ['pinned', 'contextBudgetPinned'],
      ['payload', 'contextBudgetPayload'], ['template', 'contextBudgetPayload'], ['unknown', 'contextBudgetPayload'],
    ])('explains %s overflow and returns accepted text for editing without retrying', async (reason, key) => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      const accepted = vi.fn();
      await store.sendMessage('希望核对会面约定。', undefined, undefined, accepted);
      const requestId = store.messages[0].id;
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: '52', clientMessageId: requestId, content: '希望核对会面约定。' });
      wsHandlers.get('error')!({ chatId: 'story', requestId, code: 'CONTEXT_BUDGET_EXCEEDED', message: 'provider detail',
        details: { reason, contextWindow: 1000, outputTokens: 200, requiredTokens: 800, availableTokens: 700 } });
      expect(store.takeContextInput()).toBeNull();
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable: true });
      expect(store.error).toBe(i18n.global.t(`chat.${key}`));
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0].id).toBe('52');
      expect(accepted).toHaveBeenCalledOnce();
      expect(store.canRetryGeneration).toBe(false);
      await store.retryLastGeneration();
      expect(sendMessageRequest).toHaveBeenCalledTimes(1);
      expect(store.takeContextInput()).toBe('希望核对会面约定。');
      expect(store.contextRecovery).toBeNull();
      expect(store.takeContextInput()).toBeNull();
    });

    it('clears recoverable input on story changes and ignores late errors from the previous story', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      await store.sendMessage('这次故事的私密文字');
      const requestId = store.messages[0].id;
      const error = { chatId: 'story', requestId, code: 'CONTEXT_BUDGET_EXCEEDED', message: 'too long' };
      wsHandlers.get('error')!(error);
      expect(store.contextRecovery?.content).toBe('这次故事的私密文字');
      await store.setCurrentChat(null);
      expect(store.contextRecovery).toBeNull();
      wsHandlers.get('error')!(error);
      expect(store.takeContextInput()).toBeNull();
      expect(store.contextRecovery).toBeNull();
    });

    it('clears recoverable input when the account changes', async () => {
      const user = useUserStore();
      const store = useChatStore();
      store.contextRecovery = { chatId: 'story', requestId: 'request', content: 'first account text' };
      user.user = { id: 'other-user', tenantId: 'other-tenant', email: '', name: '', createdAt: '' };
      expect(store.contextRecovery).toBeNull();
      expect(store.currentChatId).toBeNull();
    });

    it.each(['STORY_STATE_CONFLICT', 'STORY_ACTION_UNAVAILABLE', 'STORY_ACTION_PRECONDITION'])(
      'preserves the unaccepted draft and requires a fresh selection after %s', async code => {
        const store = useChatStore();
        store.initWebSocket('token');
        store.wsConnected = true;
        store.currentChatId = 'story';
        const accepted = vi.fn();
        await store.sendMessage('Buy a pass', undefined, undefined, accepted, undefined, { actionId: 'buy', expectedVersion: 1 });
        const requestId = store.messages[0].id;
        const revision = store.billingRevision;
        wsHandlers.get('error')!({ chatId: 'story', requestId, code, message: 'stale action' });
        wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable: false });
        await store.retryLastGeneration();
        expect(store.error).toBe(i18n.global.t('chat.storyActionChanged'));
        expect(accepted).not.toHaveBeenCalled();
        expect(store.canRetryGeneration).toBe(false);
        expect(store.messages).toHaveLength(0);
        expect(sendMessageRequest).toHaveBeenCalledTimes(1);
        expect(store.billingRevision).toBe(revision + 1);
        await store.sendMessage('Buy a pass', undefined, undefined, accepted, undefined, { actionId: 'buy', expectedVersion: 2 });
        const nextRequestId = sendMessageRequest.mock.calls[1][4];
        expect(nextRequestId).not.toBe(requestId);
        expect(sendMessageRequest).toHaveBeenLastCalledWith('story', 'Buy a pass', undefined, undefined, nextRequestId, { actionId: 'buy', expectedVersion: 2 }, undefined);
        wsHandlers.get('userMessage')!({ chatId: 'story', messageId: '52', clientMessageId: nextRequestId, content: 'Buy a pass' });
        expect(accepted).toHaveBeenCalledOnce();
      }
    );

    it('keeps an accepted user message when a conflict happens during commit', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      await store.sendMessage('Buy a pass');
      const requestId = store.messages[0].id;
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: '52', clientMessageId: requestId, content: 'Buy a pass' });
      wsHandlers.get('error')!({ chatId: 'story', requestId, code: 'STORY_STATE_CONFLICT', message: 'Version changed during generation' });
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable: false });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0].id).toBe('52');
      expect(store.canRetryGeneration).toBe(false);
    });

    it.each([false, undefined])('does not offer retry without explicit permission (%s)', async (retryable) => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      await store.sendMessage('An action');
      const requestId = store.messages[0].id;
      wsHandlers.get('error')!({ chatId: 'story', requestId, code: 'MESSAGE_ERROR', message: 'Interrupted' });
      expect(store.sending).toBe(true);
      expect(store.canRetryGeneration).toBe(false);
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable });
      await store.retryLastGeneration();
      expect(store.sending).toBe(false);
      expect(store.canRetryGeneration).toBe(false);
      expect(sendMessageRequest).toHaveBeenCalledTimes(1);
    });

    it('preserves draft acknowledgement across a safe retry and blocks double clicks', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      const accepted = vi.fn();
      await store.sendMessage('An action', undefined, undefined, accepted);
      const requestId = store.messages[0].id;
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable: true });
      await Promise.all([store.retryLastGeneration(), store.retryLastGeneration()]);
      expect(sendMessageRequest).toHaveBeenCalledTimes(2);
      expect(accepted).not.toHaveBeenCalled();
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: '52', clientMessageId: requestId, content: 'An action' });
      expect(accepted).toHaveBeenCalledOnce();
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0].extra?.clientMessageId).toBe(requestId);
    });

    it('does not confirm a draft from another device sending identical text', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      const accepted = vi.fn();
      await store.sendMessage('Same words', undefined, undefined, accepted);
      const requestId = store.messages[0].id;
      const saved: Message = { id: '60', chatId: 'story', role: 'user', content: 'Same words', createdAt: '', extra: { clientMessageId: 'another-device' } };
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [saved], hasMore: false });
      wsHandlers.get('generationState')!({ chatId: 'story', status: 'idle' });
      await vi.waitFor(() => expect(store.sending).toBe(false));
      expect(accepted).not.toHaveBeenCalled();
      expect(store.messages.map(message => message.id)).toEqual([requestId, '60']);
      wsHandlers.get('generationState')!({ chatId: 'story', status: 'idle' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(store.messages).toHaveLength(2);
      expect(store.canRetryGeneration).toBe(false);
    });

    it('reconciles persisted messages after reconnect without resending the draft', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.currentChatId = 'story';
      await store.sendMessage('Hello again');
      const requestId = store.messages[0].id;
      store.sending = true;

      vi.mocked(chatApi.getMessages).mockResolvedValue({
        messages: [
          {
            id: '101',
            chatId: 'story',
            role: 'user',
            content: 'Hello again',
            extra: { clientMessageId: requestId },
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: '102',
            chatId: 'story',
            role: 'assistant',
            content: 'Recovered reply',
            createdAt: '2026-01-01T00:00:01.000Z',
          },
        ],
        hasMore: false,
      });

      wsHandlers.get('disconnected')!();
      wsHandlers.get('connected')!();
      wsHandlers.get('generationState')!({ chatId: 'story', status: 'idle', requestId });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(store.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: '101', role: 'user', content: 'Hello again' }),
        expect.objectContaining({ id: '102', role: 'assistant', content: 'Recovered reply' }),
      ]));
      expect(store.messages.filter(message => message.role === 'user')).toHaveLength(1);
      expect(store.sending).toBe(false);
      expect(store.error).toBeNull();
    });

    it.each([false, true])('recovers multiple forward pages without hiding a failed later page (%s)', async failure => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.currentChatId = 'story';
      store.messages = [{ id: '1', chatId: 'story', role: 'user', content: 'Earlier input', createdAt: '' }];
      const replies = Array.from({ length: 55 }, (_, index) => ({ id: String(index + 2), chatId: 'story', role: 'assistant' as const, content: `Reply ${index}`, createdAt: '' }));
      vi.mocked(chatApi.getMessages).mockResolvedValueOnce({ messages: replies.slice(0, 50), hasMore: true });
      if (failure) vi.mocked(chatApi.getMessages).mockRejectedValueOnce(new Error('second page unavailable'));
      else vi.mocked(chatApi.getMessages).mockResolvedValueOnce({ messages: replies.slice(50), hasMore: false });
      wsHandlers.get('generationState')!({ chatId: 'story', status: 'idle' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(chatApi.getMessages).toHaveBeenNthCalledWith(1, 'story', { after: 1, limit: 50 });
      expect(chatApi.getMessages).toHaveBeenNthCalledWith(2, 'story', { after: 51, limit: 50 });
      expect(store.messages).toHaveLength(failure ? 1 : 56);
      expect(store.error).toBe(failure ? i18n.global.t('chat.replyRecoveryFailed') : null);
      expect(sendMessageRequest).not.toHaveBeenCalled();
    });

    it('keeps input locked when the server reports a running generation', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.currentChatId = 'story';
      store.sending = false;
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [], hasMore: false });

      wsHandlers.get('generationState')!({ chatId: 'story', status: 'running', requestId: 'round-2' });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(store.sending).toBe(true);
      expect(store.isStreaming).toBe(false);
    });

    it('reloads the complete saved reply after reconnecting during a stream', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      await store.sendMessage('Continue');
      const requestId = store.messages[0].id;
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: '101', clientMessageId: requestId, content: 'Continue' });
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: 'Beginning. ' });
      vi.mocked(chatApi.getMessages)
        .mockResolvedValueOnce({ messages: [], hasMore: false })
        .mockResolvedValueOnce({ messages: [{ id: '102', chatId: 'story', role: 'assistant', content: 'Beginning. Missing middle. End.', createdAt: '2026-10-24T00:00:00Z' }], hasMore: false });
      wsHandlers.get('disconnected')!();
      wsHandlers.get('connected')!();
      wsHandlers.get('generationState')!({ chatId: 'story', requestId, status: 'running' });
      await new Promise(resolve => setTimeout(resolve, 0));
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, chunk: 'End.' });
      wsHandlers.get('assistantMessageDone')!({ chatId: 'story', requestId, messageId: '102' });
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'completed' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(store.messages.filter(message => message.role === 'assistant')).toEqual([
        expect.objectContaining({ id: '102', content: 'Beginning. Missing middle. End.' }),
      ]);
      expect(sendMessageRequest).toHaveBeenCalledOnce();
      expect(store.sending).toBe(false);
      expect(chatApi.getMessages).toHaveBeenLastCalledWith('story', { after: 100, limit: 50 });
    });

    it('recovers all group replies in order when an earlier acknowledgement is lost', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      await store.sendMessage('Continue');
      const requestId = store.messages[0].id;
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: '101', clientMessageId: requestId, content: 'Continue' });
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [], hasMore: false });
      wsHandlers.get('disconnected')!();
      wsHandlers.get('generationState')!({ chatId: 'story', requestId, status: 'running' });
      await new Promise(resolve => setTimeout(resolve, 0));
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, characterId: 'second', chunk: 'Tail' });
      wsHandlers.get('assistantMessageDone')!({ chatId: 'story', requestId, characterId: 'second', messageId: '103' });
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [
        { id: '102', chatId: 'story', role: 'assistant', characterId: 'first', content: 'Full first reply', createdAt: '' },
        { id: '103', chatId: 'story', role: 'assistant', characterId: 'second', content: 'Full second reply', createdAt: '' },
      ], hasMore: false });
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'completed' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(store.messages.map(message => message.id)).toEqual(['101', '102', '103']);
      expect(store.messages.slice(1).map(message => message.content)).toEqual(['Full first reply', 'Full second reply']);
      expect(sendMessageRequest).toHaveBeenCalledOnce();
    });

    it.each([false, true])('separates speakers and recovers a missing completion without a disconnect (other tab: %s)', async otherTab => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      if (!otherTab) await store.sendMessage('Continue');
      const requestId = otherTab ? 'another-tab-request' : store.messages[0].id;
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: '101', clientMessageId: requestId, content: 'Continue' });
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, characterId: 'first', chunk: 'First reply' });
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'story', requestId, characterId: 'second', chunk: 'Second reply' });
      expect(store.streamingMessage).toBe('Second reply');
      expect(store.streamingCharacterId).toBe('second');
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [
        { id: '102', chatId: 'story', role: 'assistant', characterId: 'first', content: 'First reply', createdAt: '' },
        { id: '103', chatId: 'story', role: 'assistant', characterId: 'second', content: 'Second reply', createdAt: '' },
      ], hasMore: false });
      wsHandlers.get('assistantMessageDone')!({ chatId: 'story', requestId, characterId: 'second', messageId: '103' });
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'completed' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(store.messages.map(message => message.id)).toEqual(['101', '102', '103']);
      expect(chatApi.getMessages).toHaveBeenLastCalledWith('story', { after: 100, limit: 50 });
      expect(sendMessageRequest).toHaveBeenCalledTimes(otherTab ? 0 : 1);
    });

    it('reconciles a committed group reply after later failure without a disconnect', async () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      await store.sendMessage('Continue');
      const requestId = store.messages[0].id;
      wsHandlers.get('userMessage')!({ chatId: 'story', messageId: '101', clientMessageId: requestId, content: 'Continue' });
      vi.mocked(chatApi.getMessages).mockResolvedValue({ messages: [
        { id: '102', chatId: 'story', role: 'assistant', content: 'Saved first reply', createdAt: '' },
      ], hasMore: false });
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'failed', retryable: false });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(store.messages.at(-1)?.content).toBe('Saved first reply');
      expect(store.canRetryGeneration).toBe(false);
      expect(sendMessageRequest).toHaveBeenCalledOnce();
    });

    it.each([false, true])('reports an incomplete recovery only in its own story (switched: %s)', async switched => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.wsConnected = true;
      store.currentChatId = 'story';
      await store.sendMessage('Continue');
      const requestId = store.messages[0].id;
      let rejectRecovery!: (reason: Error) => void;
      vi.mocked(chatApi.getMessages)
        .mockResolvedValueOnce({ messages: [], hasMore: false })
        .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRecovery = reject; }));
      wsHandlers.get('disconnected')!();
      wsHandlers.get('generationState')!({ chatId: 'story', requestId, status: 'running' });
      await new Promise(resolve => setTimeout(resolve, 0));
      wsHandlers.get('generationFinished')!({ chatId: 'story', requestId, status: 'completed' });
      if (switched) store.currentChatId = 'another-story';
      rejectRecovery(new Error('Read unavailable'));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(store.error).toBe(switched ? null : i18n.global.t('chat.replyRecoveryFailed'));
      expect(store.canRetryGeneration).toBe(false);
      expect(sendMessageRequest).toHaveBeenCalledOnce();
    });

    it('ignores events for other stories and duplicate persisted messages', () => {
      const store = useChatStore();
      store.initWebSocket('token');
      store.currentChatId = 'story';
      wsHandlers.get('assistantMessageChunk')!({ chatId: 'other', chunk: 'Wrong story' });
      wsHandlers.get('userMessage')!({ chatId: 'other', messageId: '9', content: 'Wrong' });
      expect(store.isStreaming).toBe(false);
      expect(store.messages).toEqual([]);
      const message = { chatId: 'story', messageId: '10', content: 'Hello' };
      wsHandlers.get('userMessage')!(message);
      wsHandlers.get('userMessage')!(message);
      expect(store.messages).toHaveLength(1);
    });

    it('aborts HTTP streaming and persists the partial response before unlocking input', async () => {
      const store = useChatStore();
      store.currentChatId = 'story';
      store.chatCharacters = [{ id: 'char', name: 'Conductor', isPublic: false, createdAt: '' }];
      vi.mocked(chatApi.sendMessage).mockImplementation(async (chatId, input) => ({
        message: { id: input.role === 'user' ? '1' : '2', chatId, role: input.role, content: input.content, createdAt: '' },
      }));
      vi.mocked(llmApi.streamChatCompletion).mockImplementationOnce(async (_request, onChunk, onDone, _onError, signal) => {
        onChunk('Partial reply');
        store.abortGeneration();
        expect(signal?.aborted).toBe(true);
        expect(store.streamingMessage).toBe('Partial reply');
        await onDone();
      });
      await store.sendMessage('Hello');
      expect(chatApi.sendMessage).toHaveBeenLastCalledWith('story', { role: 'assistant', content: 'Partial reply' });
      expect(store.messages).toHaveLength(2);
      expect(store.sending).toBe(false);
      expect(store.stopping).toBe(false);
    });

    it('should create an assistant message via the API and add to messages', async () => {
      const mockGreetingMessage: Message = {
        id: '10',
        chatId: 'chat1',
        role: 'assistant',
        content: 'Hello! I am your character.',
        createdAt: '2024-01-01',
      };

      vi.mocked(chatApi.sendMessage).mockResolvedValue({ message: mockGreetingMessage });

      const store = useChatStore();
      store.currentChatId = 'chat1';
      await store.addGreetingMessage('chat1', 'Hello! I am your character.');

      expect(chatApi.sendMessage).toHaveBeenCalledWith('chat1', {
        role: 'assistant',
        content: 'Hello! I am your character.',
      });
      expect(store.messages).toContainEqual(mockGreetingMessage);
    });

    it('should throw and not add message if API call fails', async () => {
      const error = new ApiError(500, 'SERVER_ERROR', 'Server error');
      vi.mocked(chatApi.sendMessage).mockRejectedValue(error);

      const store = useChatStore();
      await expect(store.addGreetingMessage('chat1', 'Hello!')).rejects.toThrow();

      expect(store.messages).toEqual([]);
    });
  });

  describe('currentChat getter', () => {
    it('should return current chat', () => {
      const store = useChatStore();
      store.chats = [
        {
          id: '1',
          title: 'Chat 1',
          characterId: 'char1',
          characterName: 'Character 1',
          createdAt: '2024-01-01',
        },
        {
          id: '2',
          title: 'Chat 2',
          characterId: 'char2',
          characterName: 'Character 2',
          createdAt: '2024-01-02',
        },
      ];
      store.currentChatId = '2';

      expect(store.currentChat).toEqual(store.chats[1]);
    });

    it('should return undefined if no current chat', () => {
      const store = useChatStore();
      store.chats = [
        {
          id: '1',
          title: 'Chat 1',
          characterId: 'char1',
          characterName: 'Character 1',
          createdAt: '2024-01-01',
        },
      ];

      expect(store.currentChat).toBeUndefined();
    });
  });
});
