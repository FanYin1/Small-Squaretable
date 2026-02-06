/**
 * WebSocket 类型定义
 */

/**
 * WebSocket 消息类型
 */
export enum WSMessageType {
  // 客户端 -> 服务器
  USER_MESSAGE = 'user_message',
  TYPING_START = 'typing_start',
  TYPING_STOP = 'typing_stop',
  JOIN_CHAT = 'join_chat',
  LEAVE_CHAT = 'leave_chat',
  PING = 'ping',

  // 服务器 -> 客户端
  ASSISTANT_MESSAGE = 'assistant_message',
  ASSISTANT_MESSAGE_CHUNK = 'assistant_message_chunk',
  ASSISTANT_MESSAGE_DONE = 'assistant_message_done',
  USER_TYPING = 'user_typing',
  ERROR = 'error',
  PONG = 'pong',
  CONNECTED = 'connected',

  // Intelligence events
  INTELLIGENCE_EMOTION_CHANGE = 'intelligence:emotion_change',
  INTELLIGENCE_MEMORY_RETRIEVAL = 'intelligence:memory_retrieval',
  INTELLIGENCE_MEMORY_EXTRACTION = 'intelligence:memory_extraction',
  INTELLIGENCE_PROMPT_BUILD = 'intelligence:prompt_build',
}

/**
 * WebSocket 连接状态
 */
export enum WSConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * 基础 WebSocket 消息
 */
export interface WSMessage {
  type: WSMessageType;
  timestamp: string;
}

/**
 * 用户消息
 */
export interface WSUserMessage extends WSMessage {
  type: WSMessageType.USER_MESSAGE;
  data: {
    chatId: string;
    content: string;
    messageId?: string;
  };
}

/**
 * 助手消息
 */
export interface WSAssistantMessage extends WSMessage {
  type: WSMessageType.ASSISTANT_MESSAGE;
  data: {
    chatId: string;
    messageId: string;
    content: string;
  };
}

/**
 * 助手消息块（流式）
 */
export interface WSAssistantMessageChunk extends WSMessage {
  type: WSMessageType.ASSISTANT_MESSAGE_CHUNK;
  data: {
    chatId: string;
    messageId: string;
    chunk: string;
    index: number;
  };
}

/**
 * 助手消息完成
 */
export interface WSAssistantMessageDone extends WSMessage {
  type: WSMessageType.ASSISTANT_MESSAGE_DONE;
  data: {
    chatId: string;
    messageId: string;
    totalTokens?: number;
  };
}

/**
 * 打字状态
 */
export interface WSTypingMessage extends WSMessage {
  type: WSMessageType.TYPING_START | WSMessageType.TYPING_STOP | WSMessageType.USER_TYPING;
  data: {
    chatId: string;
    userId?: string;
    userName?: string;
  };
}

/**
 * 加入/离开聊天
 */
export interface WSChatControlMessage extends WSMessage {
  type: WSMessageType.JOIN_CHAT | WSMessageType.LEAVE_CHAT;
  data: {
    chatId: string;
  };
}

/**
 * 错误消息
 */
export interface WSErrorMessage extends WSMessage {
  type: WSMessageType.ERROR;
  data: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * 心跳消息
 */
export interface WSPingMessage extends WSMessage {
  type: WSMessageType.PING;
}

export interface WSPongMessage extends WSMessage {
  type: WSMessageType.PONG;
}

/**
 * 连接成功消息
 */
export interface WSConnectedMessage extends WSMessage {
  type: WSMessageType.CONNECTED;
  data: {
    userId: string;
    tenantId: string;
  };
}

/**
 * 所有消息类型的联合类型
 */
export type WSMessageUnion =
  | WSUserMessage
  | WSAssistantMessage
  | WSAssistantMessageChunk
  | WSAssistantMessageDone
  | WSTypingMessage
  | WSChatControlMessage
  | WSErrorMessage
  | WSPingMessage
  | WSPongMessage
  | WSConnectedMessage
  | WSEmotionChangeEvent
  | WSMemoryRetrievalEvent
  | WSMemoryExtractionEvent
  | WSPromptBuildEvent;

/**
 * WebSocket 客户端配置
 */
export interface WSClientConfig {
  url: string;
  token: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

/**
 * WebSocket 事件处理器
 */
export interface WSEventHandlers {
  onConnected?: (data: WSConnectedMessage['data']) => void;
  onDisconnected?: () => void;
  onError?: (error: WSErrorMessage['data']) => void;
  onUserMessage?: (data: WSUserMessage['data']) => void;
  onAssistantMessage?: (data: WSAssistantMessage['data']) => void;
  onAssistantMessageChunk?: (data: WSAssistantMessageChunk['data']) => void;
  onAssistantMessageDone?: (data: WSAssistantMessageDone['data']) => void;
  onUserTyping?: (data: WSTypingMessage['data']) => void;
}

/**
 * WebSocket 服务器配置
 */
export interface WSServerConfig {
  port?: number;
  path?: string;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

/**
 * WebSocket 客户端连接信息
 */
export interface WSClientInfo {
  id: string;
  userId: string;
  tenantId: string;
  chatId?: string;
  connectedAt: Date;
  lastHeartbeat: Date;
}

/**
 * Intelligence: Emotion Change Event
 */
export interface WSEmotionChangeEvent extends WSMessage {
  type: WSMessageType.INTELLIGENCE_EMOTION_CHANGE;
  data: {
    chatId: string;
    characterId: string;
    previous: { valence: number; arousal: number; label: string } | null;
    current: { valence: number; arousal: number; label: string };
    trigger: string;
  };
}

/**
 * Intelligence: Memory Retrieval Event
 */
export interface WSMemoryRetrievalEvent extends WSMessage {
  type: WSMessageType.INTELLIGENCE_MEMORY_RETRIEVAL;
  data: {
    chatId: string;
    query: string;
    results: Array<{ id: string; content: string; score: number }>;
    latencyMs: number;
  };
}

/**
 * Intelligence: Memory Extraction Event
 */
export interface WSMemoryExtractionEvent extends WSMessage {
  type: WSMessageType.INTELLIGENCE_MEMORY_EXTRACTION;
  data: {
    chatId: string;
    extracted: Array<{ type: string; content: string; importance: number }>;
    messageCount: number;
  };
}

/**
 * Intelligence: Prompt Build Event
 */
export interface WSPromptBuildEvent extends WSMessage {
  type: WSMessageType.INTELLIGENCE_PROMPT_BUILD;
  data: {
    chatId: string;
    tokenCount: number;
    memoriesIncluded: number;
    emotionIncluded: boolean;
    latencyMs: number;
  };
}
