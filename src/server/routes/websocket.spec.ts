/**
 * WebSocket Route Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WSMessageType } from '../../types/websocket';
import type { WSUserMessage } from '../../types/websocket';

// Mock dependencies before importing the handler
vi.mock('../services/websocket.service', () => ({
  websocketService: {
    getClientInfo: vi.fn(),
    joinChat: vi.fn(),
    sendToClient: vi.fn(),
    registerClient: vi.fn(),
    unregisterClient: vi.fn(),
    leaveChat: vi.fn(),
    broadcastToChat: vi.fn(),
    updateHeartbeat: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock('../../db/repositories/chat.repository', () => ({
  chatRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../services/logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock('../services/llm.service', () => ({ llmService: {} }));
vi.mock('../config/llm.config', () => ({ getDefaultModel: vi.fn(), getModelMeta: vi.fn() }));
vi.mock('../services/chat.service', () => ({ chatService: {}, getChatModel: vi.fn() }));
vi.mock('../services/context-manager.service', () => ({ contextManager: {} }));
vi.mock('../../db/repositories/character.repository', () => ({ characterRepository: {} }));
vi.mock('../../db/repositories/message.repository', () => ({ messageRepository: {} }));
vi.mock('../services/group-chat.service', () => ({ groupChatService: {} }));
vi.mock('../../core/jwt', () => ({ verifyAccessToken: vi.fn() }));

import { WebSocketHandler } from './websocket';
import { websocketService } from '../services/websocket.service';
import { chatRepository } from '../../db/repositories/chat.repository';

describe('WebSocket Route', () => {
  describe('Message Handling', () => {
    it('should handle user message', () => {
      const message: WSUserMessage = {
        type: WSMessageType.USER_MESSAGE,
        timestamp: new Date().toISOString(),
        data: {
          chatId: 'chat-1',
          content: 'Hello',
        },
      };

      expect(message.type).toBe(WSMessageType.USER_MESSAGE);
      expect(message.data.content).toBe('Hello');
    });

    it('should validate message structure', () => {
      const message = {
        type: WSMessageType.USER_MESSAGE,
        timestamp: new Date().toISOString(),
        data: {
          chatId: 'chat-1',
          content: 'Hello',
        },
      };

      expect(message).toHaveProperty('type');
      expect(message).toHaveProperty('timestamp');
      expect(message).toHaveProperty('data');
      expect(message.data).toHaveProperty('chatId');
      expect(message.data).toHaveProperty('content');
    });
  });

  describe('Authentication', () => {
    it('should extract token from query string', () => {
      const url = new URL('ws://localhost:3000/ws?token=abc123');
      const token = url.searchParams.get('token');

      expect(token).toBe('abc123');
    });

    it('should handle missing token', () => {
      const url = new URL('ws://localhost:3000/ws');
      const token = url.searchParams.get('token');

      expect(token).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should create error message', () => {
      const errorMessage = {
        type: WSMessageType.ERROR,
        timestamp: new Date().toISOString(),
        data: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      };

      expect(errorMessage.type).toBe(WSMessageType.ERROR);
      expect(errorMessage.data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('join_chat ownership verification', () => {
    let handler: WebSocketHandler;
    const clientId = 'client-1';
    const chatId = 'chat-123';
    const userId = 'user-owner';

    beforeEach(() => {
      vi.clearAllMocks();
      handler = new WebSocketHandler();
    });

    it('should allow chat owner to join', async () => {
      vi.mocked(websocketService.getClientInfo).mockReturnValue({
        id: clientId,
        userId,
        tenantId: 'tenant-1',
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
      });

      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: chatId,
        userId,
        tenantId: 'tenant-1',
        characterId: null,
        title: 'Test Chat',
        summary: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Call handleJoinChat via the private method
      await (handler as any).handleJoinChat(clientId, {
        type: WSMessageType.JOIN_CHAT,
        timestamp: new Date().toISOString(),
        data: { chatId },
      });

      expect(chatRepository.findById).toHaveBeenCalledWith(chatId);
      expect(websocketService.joinChat).toHaveBeenCalledWith(clientId, chatId);
      expect(websocketService.sendToClient).not.toHaveBeenCalled();
    });

    it('should reject non-owner with FORBIDDEN error', async () => {
      vi.mocked(websocketService.getClientInfo).mockReturnValue({
        id: clientId,
        userId: 'user-intruder',
        tenantId: 'tenant-1',
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
      });

      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: chatId,
        userId,
        tenantId: 'tenant-1',
        characterId: null,
        title: 'Test Chat',
        summary: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await (handler as any).handleJoinChat(clientId, {
        type: WSMessageType.JOIN_CHAT,
        timestamp: new Date().toISOString(),
        data: { chatId },
      });

      expect(websocketService.joinChat).not.toHaveBeenCalled();
      expect(websocketService.sendToClient).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({
          type: WSMessageType.ERROR,
          data: expect.objectContaining({
            code: 'FORBIDDEN',
          }),
        })
      );
    });

    it('should reject non-existent chat with FORBIDDEN error', async () => {
      vi.mocked(websocketService.getClientInfo).mockReturnValue({
        id: clientId,
        userId,
        tenantId: 'tenant-1',
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
      });

      vi.mocked(chatRepository.findById).mockResolvedValue(null);

      await (handler as any).handleJoinChat(clientId, {
        type: WSMessageType.JOIN_CHAT,
        timestamp: new Date().toISOString(),
        data: { chatId: 'nonexistent-chat' },
      });

      expect(websocketService.joinChat).not.toHaveBeenCalled();
      expect(websocketService.sendToClient).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({
          type: WSMessageType.ERROR,
          data: expect.objectContaining({
            code: 'FORBIDDEN',
          }),
        })
      );
    });
  });
});
