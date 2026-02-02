/**
 * WebSocket Client Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketClient } from './websocket';
import { WSMessageType, WSConnectionState } from '../../types/websocket';

// Mock WebSocket
class MockWebSocket {
  public readyState = WebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection after a short delay
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  });

  // Helper to simulate receiving a message
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }
}

describe('WebSocketClient', () => {
  let wsClient: WebSocketClient;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    // Mock global WebSocket
    global.WebSocket = MockWebSocket as any;
    mockWs = new MockWebSocket('ws://localhost:3000/ws');
  });

  afterEach(() => {
    if (wsClient) {
      wsClient.disconnect();
    }
  });

  describe('Connection', () => {
    it('should connect with token', async () => {
      wsClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        token: 'test-token',
      });

      const connectPromise = new Promise<void>((resolve) => {
        wsClient.on('connected', () => resolve());
      });

      wsClient.connect();

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(wsClient.getState()).toBe(WSConnectionState.CONNECTED);
    });

    it('should disconnect', async () => {
      wsClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        token: 'test-token',
      });

      wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 20));

      wsClient.disconnect();

      expect(wsClient.getState()).toBe(WSConnectionState.DISCONNECTED);
    });

    it('should handle connection error', async () => {
      wsClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        token: 'test-token',
      });

      const errorPromise = new Promise<void>((resolve) => {
        wsClient.on('error', () => resolve());
      });

      wsClient.connect();

      // Simulate error
      const ws = (wsClient as any).ws;
      if (ws && ws.onerror) {
        ws.onerror(new Event('error'));
      }

      await errorPromise;
    });
  });

  describe('Message Sending', () => {
    beforeEach(async () => {
      wsClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        token: 'test-token',
      });
      wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    it('should send user message', () => {
      wsClient.sendMessage('chat-1', 'Hello');

      const ws = (wsClient as any).ws;
      expect(ws.send).toHaveBeenCalled();

      const sentData = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentData.type).toBe(WSMessageType.USER_MESSAGE);
      expect(sentData.data.content).toBe('Hello');
    });

    it('should join chat', () => {
      wsClient.joinChat('chat-1');

      const ws = (wsClient as any).ws;
      expect(ws.send).toHaveBeenCalled();

      const sentData = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentData.type).toBe(WSMessageType.JOIN_CHAT);
      expect(sentData.data.chatId).toBe('chat-1');
    });

    it('should leave chat', () => {
      wsClient.leaveChat('chat-1');

      const ws = (wsClient as any).ws;
      expect(ws.send).toHaveBeenCalled();

      const sentData = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentData.type).toBe(WSMessageType.LEAVE_CHAT);
    });

    it('should send typing status', () => {
      wsClient.sendTyping('chat-1', true);

      const ws = (wsClient as any).ws;
      expect(ws.send).toHaveBeenCalled();

      const sentData = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentData.type).toBe(WSMessageType.TYPING_START);
    });
  });

  describe('Message Receiving', () => {
    beforeEach(async () => {
      wsClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        token: 'test-token',
      });
      wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    it('should receive assistant message', async () => {
      const messagePromise = new Promise<void>((resolve) => {
        wsClient.on('assistantMessage', (data) => {
          expect(data.content).toBe('Hello from assistant');
          resolve();
        });
      });

      const ws = (wsClient as any).ws;
      ws.simulateMessage({
        type: WSMessageType.ASSISTANT_MESSAGE,
        timestamp: new Date().toISOString(),
        data: {
          chatId: 'chat-1',
          messageId: 'msg-1',
          content: 'Hello from assistant',
        },
      });

      await messagePromise;
    });

    it('should receive assistant message chunk', async () => {
      const chunkPromise = new Promise<void>((resolve) => {
        wsClient.on('assistantMessageChunk', (data) => {
          expect(data.chunk).toBe('Hello');
          resolve();
        });
      });

      const ws = (wsClient as any).ws;
      ws.simulateMessage({
        type: WSMessageType.ASSISTANT_MESSAGE_CHUNK,
        timestamp: new Date().toISOString(),
        data: {
          chatId: 'chat-1',
          messageId: 'msg-1',
          chunk: 'Hello',
          index: 0,
        },
      });

      await chunkPromise;
    });

    it('should receive error message', async () => {
      const errorPromise = new Promise<void>((resolve) => {
        wsClient.on('error', (data) => {
          expect(data.code).toBe('TEST_ERROR');
          resolve();
        });
      });

      const ws = (wsClient as any).ws;
      ws.simulateMessage({
        type: WSMessageType.ERROR,
        timestamp: new Date().toISOString(),
        data: {
          code: 'TEST_ERROR',
          message: 'Test error message',
        },
      });

      await errorPromise;
    });
  });

  describe('Reconnection', () => {
    it('should attempt to reconnect on disconnect', async () => {
      wsClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        token: 'test-token',
        reconnectInterval: 100,
        maxReconnectAttempts: 2,
      });

      wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Simulate disconnect
      const ws = (wsClient as any).ws;
      if (ws && ws.onclose) {
        ws.onclose(new CloseEvent('close'));
      }

      expect(wsClient.getState()).toBe(WSConnectionState.RECONNECTING);

      // Wait for reconnection attempt
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
  });

  describe('Heartbeat', () => {
    it('should send ping messages', async () => {
      wsClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        token: 'test-token',
        heartbeatInterval: 100,
      });

      wsClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 20));

      const ws = (wsClient as any).ws;
      ws.send.mockClear();

      // Wait for heartbeat
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(ws.send).toHaveBeenCalled();
      const sentData = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sentData.type).toBe(WSMessageType.PING);
    });
  });
});
