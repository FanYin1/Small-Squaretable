/**
 * 聊天服务测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatService } from './chat.service';
import { chatRepository } from '../../db/repositories/chat.repository';
import { messageRepository } from '../../db/repositories/message.repository';
import { NotFoundError } from '../../core/errors';

vi.mock('../../db/repositories/chat.repository');
vi.mock('../../db/repositories/message.repository');

describe('ChatService', () => {
  let chatService: ChatService;

  beforeEach(() => {
    chatService = new ChatService(chatRepository, messageRepository);
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new chat', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const createData = {
        characterId: 'char-123',
        title: 'Test Chat',
        metadata: { theme: 'dark' },
      };

      const mockCreatedChat = {
        id: 'chat-123',
        ...createData,
        tenantId,
        userId,
        summary: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(chatRepository.create).mockResolvedValue(mockCreatedChat as any);

      const result = await chatService.create(userId, tenantId, createData);

      expect(result).toEqual(mockCreatedChat);
      expect(chatRepository.create).toHaveBeenCalledWith({
        ...createData,
        tenantId,
        userId,
      });
    });
  });

  describe('getById', () => {
    it('should return chat by id if user has access', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const mockChat = {
        id: 'chat-123',
        userId,
        tenantId,
        characterId: 'char-123',
        title: 'Test Chat',
      };

      vi.mocked(chatRepository.findByIdAndTenant).mockResolvedValue(mockChat as any);

      const result = await chatService.getById('chat-123', userId, tenantId);

      expect(result).toEqual(mockChat);
    });

    it('should throw NotFoundError if chat does not exist', async () => {
      vi.mocked(chatRepository.findByIdAndTenant).mockResolvedValue(null);

      await expect(chatService.getById('non-existent', 'user-123', 'tenant-123')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('getByUserId', () => {
    it('should return user chats with pagination', async () => {
      const userId = 'user-123';
      const mockChats = [
        {
          id: 'chat-1',
          userId,
          title: 'Chat 1',
        },
        {
          id: 'chat-2',
          userId,
          title: 'Chat 2',
        },
      ];

      vi.mocked(chatRepository.findByUserId).mockResolvedValue(mockChats as any);

      const result = await chatService.getByUserId(userId, { page: 1, limit: 20 });

      expect(result.items).toEqual(mockChats);
      expect(result.pagination.total).toBe(2);
    });
  });

  describe('update', () => {
    it('should update chat if user has access', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const updateData = { title: 'Updated Title' };

      const mockChat = {
        id: 'chat-123',
        userId,
        tenantId,
        title: 'Test Chat',
      };

      const mockUpdatedChat = {
        ...mockChat,
        ...updateData,
      };

      vi.mocked(chatRepository.findByIdAndTenant).mockResolvedValue(mockChat as any);
      vi.mocked(chatRepository.update).mockResolvedValue(mockUpdatedChat as any);

      const result = await chatService.update('chat-123', userId, tenantId, updateData);

      expect(result).toEqual(mockUpdatedChat);
    });

    it('should throw NotFoundError if chat does not exist', async () => {
      vi.mocked(chatRepository.findByIdAndTenant).mockResolvedValue(null);

      await expect(
        chatService.update('non-existent', 'user-123', 'tenant-123', { title: 'New Title' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete chat if user has access', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockChat = {
        id: 'chat-123',
        userId,
        tenantId,
      };

      vi.mocked(chatRepository.findByIdAndTenant).mockResolvedValue(mockChat as any);
      vi.mocked(chatRepository.delete).mockResolvedValue(true);

      await chatService.delete('chat-123', userId, tenantId);

      expect(chatRepository.delete).toHaveBeenCalledWith('chat-123', tenantId);
    });

    it('should throw NotFoundError if chat does not exist', async () => {
      vi.mocked(chatRepository.findByIdAndTenant).mockResolvedValue(null);

      await expect(chatService.delete('non-existent', 'user-123', 'tenant-123')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('addMessage', () => {
    it('should add message to chat', async () => {
      const chatId = 'chat-123';
      const messageData = {
        role: 'user' as const,
        content: 'Hello',
        attachments: [],
      };

      const mockMessage = {
        id: 1,
        chatId,
        ...messageData,
        extra: null,
        sentAt: new Date(),
      };

      vi.mocked(messageRepository.create).mockResolvedValue(mockMessage as any);

      const result = await chatService.addMessage(chatId, messageData);

      expect(result).toEqual(mockMessage);
      expect(messageRepository.create).toHaveBeenCalledWith({
        chatId,
        ...messageData,
      });
    });
  });

  describe('getMessages', () => {
    it('should return messages for chat with cursor pagination', async () => {
      const chatId = 'chat-123';
      const mockMessages = [
        {
          id: 2,
          chatId,
          role: 'assistant',
          content: 'Hi there',
          sentAt: new Date(),
        },
        {
          id: 1,
          chatId,
          role: 'user',
          content: 'Hello',
          sentAt: new Date(),
        },
      ];

      vi.mocked(messageRepository.findByChatId).mockResolvedValue(mockMessages as any);

      const result = await chatService.getMessages(chatId, { limit: 20 });

      expect(result).toEqual(mockMessages);
    });
  });
});
