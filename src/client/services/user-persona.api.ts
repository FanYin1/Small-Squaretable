/**
 * User Persona API
 *
 * 处理用户 Persona 相关的 API 请求
 */

import { api } from './api';

export interface UserPersona {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  metadata: Record<string, any>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonaInput {
  name: string;
  description?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
  isDefault?: boolean;
}

export interface UpdatePersonaInput {
  name?: string;
  description?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
  isDefault?: boolean;
}

export const userPersonaApi = {
  /**
   * 获取用户的所有 Personas
   */
  async list(): Promise<UserPersona[]> {
    const response = await api.get<UserPersona[]>('/personas');
    return response;
  },

  /**
   * 获取用户的默认 Persona
   */
  async getDefault(): Promise<UserPersona | null> {
    const response = await api.get<UserPersona | null>('/personas/default');
    return response;
  },

  /**
   * 创建 Persona
   */
  async create(input: CreatePersonaInput): Promise<UserPersona> {
    const response = await api.post<UserPersona>('/personas', input);
    return response;
  },

  /**
   * 获取单个 Persona
   */
  async getById(id: string): Promise<UserPersona> {
    const response = await api.get<UserPersona>(`/personas/${id}`);
    return response;
  },

  /**
   * 更新 Persona
   */
  async update(id: string, input: UpdatePersonaInput): Promise<UserPersona> {
    const response = await api.patch<UserPersona>(`/personas/${id}`, input);
    return response;
  },

  /**
   * 删除 Persona
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/personas/${id}`);
  },

  /**
   * 设置为默认 Persona
   */
  async setDefault(id: string): Promise<UserPersona> {
    const response = await api.post<UserPersona>(`/personas/${id}/set-default`);
    return response;
  },
};
