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
} from '../../types/websocket';

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
   * 连接到 WebSocket 服务器
   */
  connect(): void {
    if (this.state === WSConnectionState.CONNECTED || this.state === WSConnectionState.CONNECTING) {
      return;
    }

    this.state = WSConnectionState.CONNECTING;
    this.emit('stateChange', this.state);

    const url = `${this.config.url}?token=${encodeURIComponent(this.config.token)}`;
    console.log('[WebSocket Client] Connecting to:', url);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      console.error('[WebSocket Client] Failed to create WebSocket:', error);
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
  sendMessage(chatId: string, content: string, messageId?: string): void {
    const message: WSUserMessage = {
      type: WSMessageType.USER_MESSAGE,
      timestamp: new Date().toISOString(),
      data: {
        chatId,
        content,
        messageId,
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
      console.warn('WebSocket is not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  /**
   * 处理连接打开
   */
  private handleOpen(): void {
    console.log('[WebSocket Client] Connected successfully');
    this.state = WSConnectionState.CONNECTED;
    this.reconnectAttempts = 0;
    this.emit('stateChange', this.state);
    this.startHeartbeat();
  }

  /**
   * 处理连接关闭
   */
  private handleClose(event: CloseEvent): void {
    console.log('[WebSocket Client] Closed:', event.code, event.reason);
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
    console.error('[WebSocket Client] Error:', event);
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

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
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
          console.error('Error in event handler:', error);
        }
      });
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      this.state = WSConnectionState.ERROR;
      this.emit('stateChange', this.state);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

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
