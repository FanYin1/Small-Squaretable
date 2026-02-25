/**
 * 聊天 API
 *
 * 处理聊天和消息相关的 API 请求
 */

import { api } from './api';
import type { Chat, Message } from '@client/types';

export interface CreateChatRequest {
  characterId?: string;
  characterIds?: string[];
  title?: string;
}

export interface GetMessagesParams {
  before?: number;
  after?: number;
  limit?: number;
}

export interface SendMessageRequest {
  role: 'user' | 'assistant' | 'system';
  content: string;
  extra?: Record<string, unknown>;
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
  characterId?: string;
  characterName?: string;
  parentMessageId?: number;
  extra?: Record<string, unknown>;
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
    metadata: item.metadata,
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
    characterId: item.characterId,
    characterName: item.characterName,
    parentMessageId: item.parentMessageId,
    extra: item.extra as Message['extra'],
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
   * 更新聊天
   */
  updateChat: async (id: string, data: { title?: string }): Promise<{ chat: Chat }> => {
    const response = await api.patch<BackendChat>(`/chats/${id}`, data);
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
  getMessages: async (chatId: string, params?: GetMessagesParams): Promise<{ messages: Message[]; hasMore: boolean }> => {
    const searchParams = new URLSearchParams();
    if (params?.before) searchParams.set('before', params.before.toString());
    if (params?.after) searchParams.set('after', params.after.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    // Backend returns messages array directly, not wrapped in { items, pagination }
    const response = await api.get<BackendMessage[] | BackendPaginatedMessages>(
      `/chats/${chatId}/messages${query ? `?${query}` : ''}`
    );

    // Handle both array and paginated response formats
    const messagesArray = Array.isArray(response) ? response : (response.items || []);
    const limit = params?.limit ?? 20;

    return {
      messages: messagesArray.map(transformMessage),
      hasMore: messagesArray.length >= limit,
    };
  },

  /**
   * 发送消息
   */
  sendMessage: async (chatId: string, data: SendMessageRequest): Promise<{ message: Message }> => {
    const response = await api.post<BackendMessage>(`/chats/${chatId}/messages`, data);
    return { message: transformMessage(response) };
  },

  /**
   * 删除单条消息
   */
  deleteMessage: (chatId: string, messageId: string) =>
    api.delete(`/chats/${chatId}/messages/${messageId}`),

  /**
   * 编辑消息
   */
  editMessage: async (chatId: string, messageId: string, content: string): Promise<{ message: Message }> => {
    const response = await api.patch<BackendMessage>(`/chats/${chatId}/messages/${messageId}`, { content });
    return { message: transformMessage(response) };
  },

  /**
   * 获取聊天角色列表（群聊）
   */
  getChatCharacters: (chatId: string) =>
    api.get<{ id: string; name: string; avatarUrl?: string; cardData?: Record<string, unknown>; sortOrder: number }[]>(`/chats/${chatId}/characters`),

  /**
   * 添加角色到聊天（群聊）
   */
  addChatCharacter: (chatId: string, characterId: string) =>
    api.post(`/chats/${chatId}/characters`, { characterId }),

  /**
   * 从聊天移除角色（群聊）
   */
  removeChatCharacter: (chatId: string, characterId: string) =>
    api.delete(`/chats/${chatId}/characters/${characterId}`),

  /**
   * 搜索聊天消息
   */
  searchMessages: async (chatId: string, q: string, limit = 50): Promise<Message[]> => {
    const params = new URLSearchParams({ q, limit: String(limit) });
    const response = await api.get<BackendMessage[]>(`/chats/${chatId}/messages/search?${params}`);
    return (Array.isArray(response) ? response : []).map(transformMessage);
  },

  /**
   * 导出聊天（返回 Blob 用于下载）
   */
  exportChat: async (chatId: string, format: 'json' | 'markdown' | 'txt' = 'json'): Promise<Blob> => {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/v1/chats/${chatId}/export?format=${format}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error('Export failed');
    return response.blob();
  },

  /**
   * 更新聊天使用的模型
   */
  updateChatModel: (chatId: string, model: string) =>
    api.patch(`/chats/${chatId}/model`, { model }),

  /**
   * 回滚聊天到指定消息
   */
  rollbackChat: async (chatId: string, messageId: number): Promise<{ deletedCount: number }> => {
    return api.post<{ deletedCount: number }>(`/chats/${chatId}/rollback`, { messageId });
  },

  /**
   * 收藏消息
   */
  bookmarkMessage: (chatId: string, messageId: string) =>
    api.post(`/chats/${chatId}/messages/${messageId}/bookmark`),

  /**
   * 取消收藏消息
   */
  unbookmarkMessage: (chatId: string, messageId: string) =>
    api.delete(`/chats/${chatId}/messages/${messageId}/bookmark`),

  /**
   * 获取用户收藏列表
   */
  getBookmarks: async (limit = 50, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return api.get<any[]>(`/chats/bookmarks?${params}`);
  },

  /**
   * 获取消息的分支兄弟节点
   */
  getBranches: async (chatId: string, messageId: number): Promise<Message[]> => {
    const response = await api.get<BackendMessage[]>(`/chats/${chatId}/branches/${messageId}`);
    return (Array.isArray(response) ? response : []).map(transformMessage);
  },
};
