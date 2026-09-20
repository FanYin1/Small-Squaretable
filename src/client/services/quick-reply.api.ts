/**
 * Quick Reply API Service
 *
 * 前端 API 服务：快速回复 CRUD 操作
 */

import { api } from './api';

export interface QuickReply {
  id: string;
  userId: string;
  label: string;
  message: string;
  order: number;
  category?: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuickReplyInput {
  label: string;
  message: string;
  category?: string;
  order?: number;
  isEnabled?: boolean;
}

export interface UpdateQuickReplyInput {
  label?: string;
  message?: string;
  category?: string;
  order?: number;
  isEnabled?: boolean;
}

export interface UpdateOrderInput {
  updates: Array<{ id: string; order: number }>;
}

/**
 * 获取所有快速回复
 */
export async function getQuickReplies(): Promise<QuickReply[]> {
  return api.get<QuickReply[]>('/quick-replies');
}

/**
 * 获取启用的快速回复
 */
export async function getEnabledQuickReplies(): Promise<QuickReply[]> {
  return api.get<QuickReply[]>('/quick-replies/enabled');
}

/**
 * 创建快速回复
 */
export async function createQuickReply(input: CreateQuickReplyInput): Promise<QuickReply> {
  return api.post<QuickReply>('/quick-replies', input);
}

/**
 * 获取单个快速回复
 */
export async function getQuickReply(id: string): Promise<QuickReply> {
  return api.get<QuickReply>(`/quick-replies/${id}`);
}

/**
 * 更新快速回复
 */
export async function updateQuickReply(id: string, input: UpdateQuickReplyInput): Promise<QuickReply> {
  return api.patch<QuickReply>(`/quick-replies/${id}`, input);
}

/**
 * 删除快速回复
 */
export async function deleteQuickReply(id: string): Promise<void> {
  await api.delete(`/quick-replies/${id}`);
}

/**
 * 批量更新排序
 */
export async function updateQuickReplyOrder(input: UpdateOrderInput): Promise<void> {
  await api.post('/quick-replies/reorder', input);
}
