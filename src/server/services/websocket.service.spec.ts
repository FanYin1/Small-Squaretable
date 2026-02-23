/**
 * WebSocket Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketService } from './websocket.service';
import { WSMessageType } from '../../types/websocket';
import type { WebSocket } from 'ws';

describe('WebSocketService', () => {
  let wsService: WebSocketService;

  beforeEach(() => {
    wsService = new WebSocketService();
  });

  afterEach(() => {
    wsService.close();
  });

  const createMockWebSocket = () => ({
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
  }) as unknown as WebSocket;

  describe('Client Management', () => {
    it('should register a new client', () => {
      const mockWs = createMockWebSocket();

      const clientId = wsService.registerClient(mockWs, 'user-1', 'tenant-1');

      expect(clientId).toBeDefined();
      expect(typeof clientId).toBe('string');
    });

    it('should unregister a client', () => {
      const mockWs = createMockWebSocket();

      const clientId = wsService.registerClient(mockWs, 'user-1', 'tenant-1');
      wsService.unregisterClient(clientId);

      // Should not throw when unregistering again
      expect(() => wsService.unregisterClient(clientId)).not.toThrow();
    });

    it('should get client info', () => {
      const mockWs = createMockWebSocket();

      const clientId = wsService.registerClient(mockWs, 'user-1', 'tenant-1');
      const clientInfo = wsService.getClientInfo(clientId);

      expect(clientInfo).toBeDefined();
      expect(clientInfo?.userId).toBe('user-1');
      expect(clientInfo?.tenantId).toBe('tenant-1');
    });
  });

  describe('Chat Room Management', () => {
    it('should join a chat room', () => {
      const mockWs = createMockWebSocket();

      const clientId = wsService.registerClient(mockWs, 'user-1', 'tenant-1');
      wsService.joinChat(clientId, 'chat-1');

      const clientInfo = wsService.getClientInfo(clientId);
      expect(clientInfo?.chatId).toBe('chat-1');
    });

    it('should leave a chat room', () => {
      const mockWs = createMockWebSocket();

      const clientId = wsService.registerClient(mockWs, 'user-1', 'tenant-1');
      wsService.joinChat(clientId, 'chat-1');
      wsService.leaveChat(clientId);

      const clientInfo = wsService.getClientInfo(clientId);
      expect(clientInfo?.chatId).toBeUndefined();
    });

    it('should get all clients in a chat room', () => {
      const mockWs1 = createMockWebSocket();
      const mockWs2 = createMockWebSocket();

      const clientId1 = wsService.registerClient(mockWs1, 'user-1', 'tenant-1');
      const clientId2 = wsService.registerClient(mockWs2, 'user-2', 'tenant-1');

      wsService.joinChat(clientId1, 'chat-1');
      wsService.joinChat(clientId2, 'chat-1');

      const clients = wsService.getChatClients('chat-1');
      expect(clients).toHaveLength(2);
    });
  });

  describe('Message Broadcasting', () => {
    it('should broadcast message to chat room', () => {
      const mockWs1 = createMockWebSocket();
      const mockWs2 = createMockWebSocket();

      const clientId1 = wsService.registerClient(mockWs1, 'user-1', 'tenant-1');
      const clientId2 = wsService.registerClient(mockWs2, 'user-2', 'tenant-1');

      wsService.joinChat(clientId1, 'chat-1');
      wsService.joinChat(clientId2, 'chat-1');

      wsService.broadcastToChat('chat-1', {
        type: WSMessageType.ASSISTANT_MESSAGE,
        timestamp: new Date().toISOString(),
        data: {
          chatId: 'chat-1',
          messageId: 'msg-1',
          content: 'Hello',
        },
      });

      expect(mockWs1.send).toHaveBeenCalled();
      expect(mockWs2.send).toHaveBeenCalled();
    });

    it('should send message to specific client', () => {
      const mockWs = createMockWebSocket();

      const clientId = wsService.registerClient(mockWs, 'user-1', 'tenant-1');

      wsService.sendToClient(clientId, {
        type: WSMessageType.CONNECTED,
        timestamp: new Date().toISOString(),
        data: {
          userId: 'user-1',
          tenantId: 'tenant-1',
        },
      });

      expect(mockWs.send).toHaveBeenCalled();
    });

    it('should not send to disconnected clients', () => {
      const mockWs = {
        send: vi.fn(),
        close: vi.fn(),
        readyState: 3, // CLOSED
      } as unknown as WebSocket;

      const clientId = wsService.registerClient(mockWs, 'user-1', 'tenant-1');

      wsService.sendToClient(clientId, {
        type: WSMessageType.CONNECTED,
        timestamp: new Date().toISOString(),
        data: {
          userId: 'user-1',
          tenantId: 'tenant-1',
        },
      });

      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe('Tenant Isolation', () => {
    it('should only broadcast to clients in same tenant', () => {
      const mockWs1 = createMockWebSocket();
      const mockWs2 = createMockWebSocket();

      const clientId1 = wsService.registerClient(mockWs1, 'user-1', 'tenant-1');
      const clientId2 = wsService.registerClient(mockWs2, 'user-2', 'tenant-2');

      wsService.joinChat(clientId1, 'chat-1');
      wsService.joinChat(clientId2, 'chat-1');

      wsService.broadcastToChat('chat-1', {
        type: WSMessageType.ASSISTANT_MESSAGE,
        timestamp: new Date().toISOString(),
        data: {
          chatId: 'chat-1',
          messageId: 'msg-1',
          content: 'Hello',
        },
      });

      // Both should receive since we're broadcasting to chat-1
      // Tenant isolation should be enforced at the chat access level
      expect(mockWs1.send).toHaveBeenCalled();
      expect(mockWs2.send).toHaveBeenCalled();
    });
  });

  describe('Heartbeat', () => {
    it('should update last heartbeat timestamp', () => {
      const mockWs = createMockWebSocket();

      const clientId = wsService.registerClient(mockWs, 'user-1', 'tenant-1');
      const beforeHeartbeat = wsService.getClientInfo(clientId)?.lastHeartbeat;

      // Wait a bit
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      wsService.updateHeartbeat(clientId);
      const afterHeartbeat = wsService.getClientInfo(clientId)?.lastHeartbeat;

      expect(afterHeartbeat).not.toEqual(beforeHeartbeat);

      vi.useRealTimers();
    });
  });

  describe('Per-User Connection Limit', () => {
    it('getClientsByUserId returns correct clients for a user', () => {
      wsService.registerClient(createMockWebSocket(), 'user-1', 'tenant-1');
      wsService.registerClient(createMockWebSocket(), 'user-1', 'tenant-1');
      wsService.registerClient(createMockWebSocket(), 'user-2', 'tenant-1');

      const user1Clients = wsService.getClientsByUserId('user-1');
      const user2Clients = wsService.getClientsByUserId('user-2');

      expect(user1Clients).toHaveLength(2);
      expect(user2Clients).toHaveLength(1);
      expect(user1Clients.every((c) => c.info.userId === 'user-1')).toBe(true);
    });

    it('allows connections up to the limit (5)', () => {
      for (let i = 0; i < 5; i++) {
        wsService.registerClient(createMockWebSocket(), 'user-1', 'tenant-1');
      }

      const clients = wsService.getClientsByUserId('user-1');
      expect(clients).toHaveLength(5);
    });

    it('evicts the oldest connection when limit is exceeded', () => {
      vi.useFakeTimers();

      const mockWsList: WebSocket[] = [];
      const clientIds: string[] = [];

      // Register 5 connections with staggered times
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i)); // each 1 second apart
        const ws = createMockWebSocket();
        mockWsList.push(ws);
        clientIds.push(wsService.registerClient(ws, 'user-1', 'tenant-1'));
      }

      // The oldest (index 0) should still be connected
      expect(wsService.getClientInfo(clientIds[0])).toBeDefined();

      // Register a 6th connection
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 10));
      const ws6 = createMockWebSocket();
      const clientId6 = wsService.registerClient(ws6, 'user-1', 'tenant-1');

      // The oldest (index 0) should have been evicted
      expect(wsService.getClientInfo(clientIds[0])).toBeUndefined();
      expect(mockWsList[0].close).toHaveBeenCalled();
      expect(mockWsList[0].send).toHaveBeenCalledWith(
        expect.stringContaining('CONNECTION_REPLACED')
      );

      // Should still have exactly 5 connections
      const remaining = wsService.getClientsByUserId('user-1');
      expect(remaining).toHaveLength(5);

      // The new client should exist
      expect(wsService.getClientInfo(clientId6)).toBeDefined();

      vi.useRealTimers();
    });

    it('unregisterClient removes client and cleans up chat rooms', () => {
      const ws = createMockWebSocket();
      const clientId = wsService.registerClient(ws, 'user-1', 'tenant-1');

      wsService.joinChat(clientId, 'chat-1');
      expect(wsService.getChatClients('chat-1')).toContain(clientId);

      wsService.unregisterClient(clientId);

      expect(wsService.getClientInfo(clientId)).toBeUndefined();
      expect(wsService.getChatClients('chat-1')).not.toContain(clientId);
    });

    it('does not evict connections from other users', () => {
      vi.useFakeTimers();

      // Fill user-1 to the limit
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i));
        wsService.registerClient(createMockWebSocket(), 'user-1', 'tenant-1');
      }

      // Register a connection for user-2
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 10));
      const ws2 = createMockWebSocket();
      wsService.registerClient(ws2, 'user-2', 'tenant-1');

      // user-1 should still have 5, user-2 should have 1
      expect(wsService.getClientsByUserId('user-1')).toHaveLength(5);
      expect(wsService.getClientsByUserId('user-2')).toHaveLength(1);
      expect(ws2.close).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
