/**
 * 角色 API
 *
 * 处理角色相关的 API 请求
 */

import { api } from './api';
import type { Character } from '@client/types';

export interface GetCharactersParams {
  search?: string;
  tags?: string[];
  page?: number;
  limit?: number;
}

export interface CreateCharacterRequest {
  name: string;
  description?: string;
  avatar?: string;
  tags?: string[];
  isPublic: boolean;
}

export interface UpdateCharacterRequest {
  name?: string;
  description?: string;
  avatar?: string;
  tags?: string[];
  isPublic?: boolean;
}

export const characterApi = {
  /**
   * 获取角色列表
   */
  getCharacters: (params?: GetCharactersParams) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.tags?.length) searchParams.set('tags', params.tags.join(','));
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    return api.get<{ characters: Character[] }>(
      `/characters${query ? `?${query}` : ''}`
    );
  },

  /**
   * 获取角色详情
   */
  getCharacter: (id: string) =>
    api.get<{ character: Character }>(`/characters/${id}`),

  /**
   * 创建角色
   */
  createCharacter: (data: CreateCharacterRequest) =>
    api.post<{ character: Character }>('/characters', data),

  /**
   * 更新角色
   */
  updateCharacter: (id: string, data: UpdateCharacterRequest) =>
    api.patch<{ character: Character }>(`/characters/${id}`, data),

  /**
   * 删除角色
   */
  deleteCharacter: (id: string) =>
    api.delete(`/characters/${id}`),
};
