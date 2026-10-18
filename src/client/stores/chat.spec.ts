/**
 * Chat Store 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from './chat';
import { chatApi, llmApi, ApiError } from '@client/services';
import { showInsufficientCreditsAlert } from '@client/utils/credit-alert';
import type { Chat, Message } from '@client/types';

// 捕获 store 注册到 WebSocketClient 的事件处理器，测试里手动触发
const wsHandlers = vi.hoisted(() => new Map<string, (data: unknown) => void>());

vi.mock('@client/services/websocket', () => ({
  WebSocketClient: class {
    on(event: string, handler: (data: unknown) => void) {
      wsHandlers.set(event, handler);
    }
    connect() {}
    disconnect() {}
    joinChat() {}
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
    createChat: vi.fn(),
    deleteChat: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
  },
  llmApi: {
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
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('fetchChats', () => {
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

      expect(store.error).toBe('You are out of points. Ask an operator to top up before continuing.');
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

      expect(store.error).toBe('You are out of points. Ask an operator to top up before continuing.');
      expect(store.sending).toBe(false);
      expect(store.isStreaming).toBe(false);
      expect(showInsufficientCreditsAlert).toHaveBeenCalledWith(details);
    });
  });

  describe('createChat', () => {
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

  describe('addGreetingMessage', () => {
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
