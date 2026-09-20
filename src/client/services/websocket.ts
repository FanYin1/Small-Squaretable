/**
 * WebSocket Client Service
 *
 * 前端 WebSocket 客户端，处理实时通信
 */

import {
  WSMessageType,
  WSConnectionState,
  type WSClientConfig,
  type WSMessageUnion,
  type WSUserMessage,
  type WSChatControlMessage,
  type WSTypingMessage,
  type WSPingMessage,
  type WSChatReadMessage,
  type WSAttachment,
  type WSAbortGenerationMessage,
} from '../../types/websocket';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('WebSocket');

type EventHandler = (data?: unknown) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: Required<WSClientConfig>;
  private state: WSConnectionState = WSConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();

  constructor(config: WSClientConfig) {
    this.config = {
      url: config.url,
      token: config.token,
      reconnectInterval: config.reconnectInterval || 3000,
      maxReconnectAttempts: config.maxReconnectAttempts || 5,
      heartbeatInterval: config.heartbeatInterval || 30000,
    };
  }

  /**
   * 连接到 WebSocket 服务器 (uses ticket-based auth)
   */
  connect(): void {
    if (this.state === WSConnectionState.CONNECTED || this.state === WSConnectionState.CONNECTING) {
      return;
    }

    this.state = WSConnectionState.CONNECTING;
    this.emit('stateChange', this.state);

    // Fetch a short-lived ticket, then connect with it
    this.fetchTicketAndConnect();
  }

  /**
   * Establish WebSocket connection with token-based auth
   */
  private async fetchTicketAndConnect(): Promise<void> {
    try {
      const url = `${this.config.url}?token=${encodeURIComponent(this.config.token)}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      logger.error('Failed to connect', error);
      this.state = WSConnectionState.ERROR;
      this.emit('stateChange', this.state);
      this.scheduleReconnect();
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.stopHeartbeat();
    this.stopReconnect();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = WSConnectionState.DISCONNECTED;
    this.emit('stateChange', this.state);
    this.emit('disconnected');
  }

  /**
   * 发送用户消息
   */
  sendMessage(chatId: string, content: string, attachments?: WSAttachment[], mentionedCharacterIds?: string[], messageId?: string): void {
    const message: WSUserMessage = {
      type: WSMessageType.USER_MESSAGE,
      timestamp: new Date().toISOString(),
      data: {
        chatId,
        content,
        messageId,
        attachments,
        ...(mentionedCharacterIds && mentionedCharacterIds.length > 0 && { mentionedCharacterIds }),
      },
    };

    this.send(message);
  }

  /**
   * 加入聊天室
   */
  joinChat(chatId: string): void {
    const message: WSChatControlMessage = {
      type: WSMessageType.JOIN_CHAT,
      timestamp: new Date().toISOString(),
      data: { chatId },
    };

    this.send(message);
  }

  /**
   * 离开聊天室
   */
  leaveChat(chatId: string): void {
    const message: WSChatControlMessage = {
      type: WSMessageType.LEAVE_CHAT,
      timestamp: new Date().toISOString(),
      data: { chatId },
    };

    this.send(message);
  }

  /**
   * 发送打字状态
   */
  sendTyping(chatId: string, isTyping: boolean): void {
    const message: WSTypingMessage = {
      type: isTyping ? WSMessageType.TYPING_START : WSMessageType.TYPING_STOP,
      timestamp: new Date().toISOString(),
      data: { chatId },
    };

    this.send(message);
  }

  /**
   * 发送聊天已读回执
   */
  sendChatRead(chatId: string, lastReadMessageId: string): void {
    const message: WSChatReadMessage = {
      type: WSMessageType.CHAT_READ,
      timestamp: new Date().toISOString(),
      data: { chatId, lastReadMessageId },
    };

    this.send(message);
  }

  /**
   * 发送中止生成请求
   */
  sendAbortGeneration(chatId: string): void {
    const message: WSAbortGenerationMessage = {
      type: WSMessageType.ABORT_GENERATION,
      timestamp: new Date().toISOString(),
      data: { chatId },
    };

    this.send(message);
  }

  /**
   * 获取连接状态
   */
  getState(): WSConnectionState {
    return this.state;
  }

  /**
   * 注册事件处理器
   */
  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * 移除事件处理器
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * 发送消息
   */
  private send(message: WSMessageUnion): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('WebSocket is not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to send message', error);
    }
  }

  /**
   * 处理连接打开
   */
  private handleOpen(): void {
    this.state = WSConnectionState.CONNECTED;
    this.reconnectAttempts = 0;
    this.emit('stateChange', this.state);
    this.startHeartbeat();
  }

  /**
   * 处理连接关闭
   */
  private handleClose(event: CloseEvent): void {
    this.stopHeartbeat();

    if (this.state !== WSConnectionState.DISCONNECTED) {
      this.state = WSConnectionState.RECONNECTING;
      this.emit('stateChange', this.state);
      this.emit('disconnected');
      this.scheduleReconnect();
    }
  }

  /**
   * 处理错误
   */
  private handleError(event: Event): void {
    logger.error('Error', event);
    this.state = WSConnectionState.ERROR;
    this.emit('stateChange', this.state);
    this.emit('error', { code: 'CONNECTION_ERROR', message: 'WebSocket connection error' });
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WSMessageUnion = JSON.parse(event.data);

      switch (message.type) {
        case WSMessageType.CONNECTED:
          this.emit('connected', message.data);
          break;

        case WSMessageType.USER_MESSAGE:
          this.emit('userMessage', message.data);
          break;

        case WSMessageType.ASSISTANT_MESSAGE:
          this.emit('assistantMessage', message.data);
          break;

        case WSMessageType.ASSISTANT_MESSAGE_CHUNK:
          this.emit('assistantMessageChunk', message.data);
          break;

        case WSMessageType.ASSISTANT_MESSAGE_DONE:
          this.emit('assistantMessageDone', message.data);
          break;

        case WSMessageType.USER_TYPING:
          this.emit('userTyping', message.data);
          break;

        case WSMessageType.ERROR:
          this.emit('error', message.data);
          break;

        case WSMessageType.PONG:
          // Heartbeat response received
          break;

        // Intelligence events
        case WSMessageType.INTELLIGENCE_EMOTION_CHANGE:
          this.emit('intelligenceEmotionChange', message.data);
          break;

        case WSMessageType.INTELLIGENCE_MEMORY_RETRIEVAL:
          this.emit('intelligenceMemoryRetrieval', message.data);
          break;

        case WSMessageType.INTELLIGENCE_MEMORY_EXTRACTION:
          this.emit('intelligenceMemoryExtraction', message.data);
          break;

        case WSMessageType.INTELLIGENCE_PROMPT_BUILD:
          this.emit('intelligencePromptBuild', message.data);
          break;

        // Sync events (多设备同步)
        case WSMessageType.DEVICE_CONNECTED:
          this.emit('syncDeviceConnected', message.data);
          break;

        case WSMessageType.DEVICE_DISCONNECTED:
          this.emit('syncDeviceDisconnected', message.data);
          break;

        case WSMessageType.CHAT_READ:
          this.emit('syncChatRead', message.data);
          break;

        case WSMessageType.SYNC_EVENT:
          this.emit('syncEvent', message.data);
          break;

        case WSMessageType.SYNC_DEVICES:
          this.emit('syncDevices', message.data);
          break;

        // Social notification events
        case WSMessageType.SOCIAL_NOTIFICATION:
          this.emit('social:notification', message.data);
          break;

        case WSMessageType.SOCIAL_UNREAD_COUNT:
          this.emit('social:unread_count', message.data);
          break;

        default:
          logger.warn('Unknown message type', { type: message.type });
      }
    } catch (error) {
      logger.error('Failed to parse message', error);
    }
  }

  /**
   * 触发事件
   */
  private emit(event: string, data?: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          logger.error('Error in event handler', error);
        }
      });
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached');
      this.state = WSConnectionState.ERROR;
      this.emit('stateChange', this.state);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * 停止重连
   */
  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      const message: WSPingMessage = {
        type: WSMessageType.PING,
        timestamp: new Date().toISOString(),
      };
      this.send(message);
    }, this.config.heartbeatInterval);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
