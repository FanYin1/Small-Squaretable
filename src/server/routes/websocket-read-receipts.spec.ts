/**
 * WebSocket Read Receipts Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WSMessageType } from '../../types/websocket';

// Mock all dependencies before importing
vi.mock('../services/websocket.service', () => ({
  websocketService: {
    getClientInfo: vi.fn(),
    sendToClient: vi.fn(),
    sendToUser: vi.fn(),
    joinChat: vi.fn(),
    leaveChat: vi.fn(),
    broadcastToChat: vi.fn(),
    updateHeartbeat: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
    registerClient: vi.fn(),
    unregisterClient: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock('../../db', () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock('../../db/schema/chats', () => ({
  chats: {
    id: 'id',
    userId: 'user_id',
    lastReadMessageId: 'last_read_message_id',
    unreadCount: 'unread_count',
  },
}));

vi.mock('../../db/repositories/chat.repository', () => ({
  chatRepository: { findById: vi.fn() },
}));

vi.mock('../services/logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
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
import { db } from '../../db';

describe('WebSocket Read Receipts', () => {
  let handler: WebSocketHandler;

  beforeEach(() => {
    handler = new WebSocketHandler();
    vi.clearAllMocks();
    // Re-setup the chainable mock after clearAllMocks
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);
  });

  it('should update DB with lastReadMessageId and reset unreadCount', async () => {
    vi.mocked(websocketService.getClientInfo).mockReturnValue({
      id: 'client-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    } as any);

    await (handler as any).handleChatRead('client-1', {
      type: WSMessageType.CHAT_READ,
      timestamp: new Date().toISOString(),
      data: { chatId: 'chat-1', lastReadMessageId: '42' },
    });

    expect(db.update).toHaveBeenCalled();
    const setFn = vi.mocked(db.update).mock.results[0]?.value?.set;
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        lastReadMessageId: 42,
        unreadCount: 0,
      }),
    );
  });

  it('should broadcast read receipt to user other devices', async () => {
    vi.mocked(websocketService.getClientInfo).mockReturnValue({
      id: 'client-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    } as any);

    await (handler as any).handleChatRead('client-1', {
      type: WSMessageType.CHAT_READ,
      timestamp: new Date().toISOString(),
      data: { chatId: 'chat-1', lastReadMessageId: '42' },
    });

    expect(websocketService.sendToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        type: WSMessageType.CHAT_READ,
        data: { chatId: 'chat-1', lastReadMessageId: '42' },
      }),
    );
  });

  it('should do nothing if client info not found', async () => {
    vi.mocked(websocketService.getClientInfo).mockReturnValue(null as any);

    await (handler as any).handleChatRead('client-1', {
      type: WSMessageType.CHAT_READ,
      timestamp: new Date().toISOString(),
      data: { chatId: 'chat-1', lastReadMessageId: '42' },
    });

    expect(db.update).not.toHaveBeenCalled();
    expect(websocketService.sendToUser).not.toHaveBeenCalled();
  });
});
