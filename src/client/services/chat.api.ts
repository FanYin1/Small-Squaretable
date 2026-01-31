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
  content: string;
}

export const chatApi = {
  /**
   * 获取聊天列表
   */
  getChats: () =>
    api.get<{ chats: Chat[] }>('/chats'),

  /**
   * 获取聊天详情
   */
  getChat: (id: string) =>
    api.get<{ chat: Chat }>(`/chats/${id}`),

  /**
   * 创建聊天
   */
  createChat: (data: CreateChatRequest) =>
    api.post<{ chat: Chat }>('/chats', data),

  /**
   * 删除聊天
   */
  deleteChat: (id: string) =>
    api.delete(`/chats/${id}`),

  /**
   * 获取聊天消息
   */
  getMessages: (chatId: string, params?: GetMessagesParams) => {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    return api.get<{ messages: Message[] }>(
      `/chats/${chatId}/messages${query ? `?${query}` : ''}`
    );
  },

  /**
   * 发送消息
   */
  sendMessage: (chatId: string, data: SendMessageRequest) =>
    api.post<{ message: Message }>(`/chats/${chatId}/messages`, data),
};
