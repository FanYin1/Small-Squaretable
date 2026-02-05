/**
 * 聊天 API
 *
 * 处理聊天和消息相关的 API 请求
 */

import { api } from './api';
import type { Chat, Message } from '@client/types';

export interface CreateChatRequest {
  characterId: string;
  title?: string;
}

export interface GetMessagesParams {
  cursor?: string;
  limit?: number;
}

export interface SendMessageRequest {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Backend chat format
interface BackendChat {
  id: string;
  tenantId: string;
  userId: string;
  characterId: string;
  title: string;
  summary?: string | null;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// Backend message format
interface BackendMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sentAt: string;  // Backend uses sentAt, not createdAt
}

// Backend paginated response
interface BackendPaginatedChats {
  items: BackendChat[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface BackendPaginatedMessages {
  items: BackendMessage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Transform backend chat to frontend format
function transformChat(item: BackendChat): Chat {
  return {
    id: item.id,
    title: item.title,
    characterId: item.characterId,
    characterName: '', // Will be populated separately if needed
    characterAvatar: undefined,
    lastMessage: item.summary || undefined,
    lastMessageAt: item.updatedAt,
    createdAt: item.createdAt,
  };
}

// Transform backend message to frontend format
function transformMessage(item: BackendMessage): Message {
  return {
    id: String(item.id),  // Backend returns bigint as number, convert to string
    chatId: item.chatId,
    role: item.role,
    content: item.content,
    createdAt: item.sentAt,  // Map sentAt to createdAt for frontend
  };
}

export const chatApi = {
  /**
   * 获取聊天列表
   */
  getChats: async (): Promise<{ chats: Chat[] }> => {
    const response = await api.get<BackendPaginatedChats>('/chats');
    return {
      chats: (response.items || []).map(transformChat),
    };
  },

  /**
   * 获取聊天详情
   */
  getChat: async (id: string): Promise<{ chat: Chat }> => {
    const response = await api.get<BackendChat>(`/chats/${id}`);
    return { chat: transformChat(response) };
  },

  /**
   * 创建聊天
   */
  createChat: async (data: CreateChatRequest): Promise<{ chat: Chat }> => {
    const response = await api.post<BackendChat>('/chats', data);
    return { chat: transformChat(response) };
  },

  /**
   * 删除聊天
   */
  deleteChat: (id: string) =>
    api.delete(`/chats/${id}`),

  /**
   * 获取聊天消息
   */
  getMessages: async (chatId: string, params?: GetMessagesParams): Promise<{ messages: Message[] }> => {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    // Backend returns messages array directly, not wrapped in { items, pagination }
    const response = await api.get<BackendMessage[] | BackendPaginatedMessages>(
      `/chats/${chatId}/messages${query ? `?${query}` : ''}`
    );

    // Handle both array and paginated response formats
    const messagesArray = Array.isArray(response) ? response : (response.items || []);
    return {
      messages: messagesArray.map(transformMessage),
    };
  },

  /**
   * 发送消息
   */
  sendMessage: async (chatId: string, data: SendMessageRequest): Promise<{ message: Message }> => {
    const response = await api.post<BackendMessage>(`/chats/${chatId}/messages`, data);
    return { message: transformMessage(response) };
  },
};
