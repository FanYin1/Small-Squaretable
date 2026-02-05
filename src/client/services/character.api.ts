/**
 * 角色 API
 *
 * 处理角色相关的 API 请求
 */

import { api } from './api';
import type { Character } from '@client/types';
import type { SearchResult, SearchResultItem } from '@/types/search';

export interface GetCharactersParams {
  search?: string;
  tags?: string[];
  page?: number;
  limit?: number;
}

export interface SearchCharactersParams {
  q?: string;
  sort?: string;
  filter?: string;
  page?: number;
  limit?: number;
  category?: string;
  tags?: string[];
  isNsfw?: boolean;
}

const toIsoString = (value?: Date | string): string | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

export const mapSearchItemToCharacter = (item: SearchResultItem): Character => ({
  id: item.id,
  name: item.name,
  description: item.description,
  avatar: item.avatarUrl,
  tags: item.tags,
  category: item.category,
  rating: item.ratingAvg,
  ratingCount: item.ratingCount,
  downloadCount: item.downloadCount,
  viewCount: item.viewCount,
  isPublic: item.isPublic,
  isNsfw: item.isNsfw,
  createdAt: toIsoString(item.createdAt) || new Date().toISOString(),
  updatedAt: toIsoString(item.updatedAt),
});

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

// Backend character format
interface BackendCharacter {
  id: string;
  tenantId: string;
  creatorId?: string | null;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  cardData?: Record<string, any> | null;
  tags?: string[] | null;
  category?: string | null;
  isPublic: boolean;
  isNsfw: boolean;
  downloadCount: number;
  viewCount: number;
  ratingAvg?: string | null;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

// Backend paginated response format
interface BackendPaginatedResponse {
  items: BackendCharacter[];
  pagination: {
    page: number;
    limit: number;
    total: string | number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Transform backend character to frontend format
function transformCharacter(item: BackendCharacter): Character {
  return {
    id: item.id,
    name: item.name,
    description: item.description || undefined,
    avatar: item.avatarUrl || undefined,
    tags: item.tags || undefined,
    category: item.category || undefined,
    rating: item.ratingAvg ? Number(item.ratingAvg) : undefined,
    ratingCount: item.ratingCount,
    downloadCount: item.downloadCount,
    viewCount: item.viewCount,
    isPublic: item.isPublic,
    isNsfw: item.isNsfw,
    cardData: item.cardData || undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const characterApi = {
  /**
   * 获取角色列表
   */
  getCharacters: async (params?: GetCharactersParams): Promise<{ characters: Character[] }> => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.tags?.length) searchParams.set('tags', params.tags.join(','));
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    const response = await api.get<BackendPaginatedResponse>(
      `/characters${query ? `?${query}` : ''}`
    );
    return {
      characters: (response.items || []).map(transformCharacter),
    };
  },

  /**
   * 搜索角色（市场 + 公共）
   */
  searchCharacters: (params?: SearchCharactersParams) => {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set('q', params.q);
    if (params?.sort) searchParams.set('sort', params.sort);
    if (params?.filter) searchParams.set('filter', params.filter);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.category) searchParams.set('category', params.category);
    if (params?.tags?.length) searchParams.set('tags', params.tags.join(','));
    if (params?.isNsfw) searchParams.set('isNsfw', 'true');

    const query = searchParams.toString();
    return api.get<SearchResult>(
      `/characters/search${query ? `?${query}` : ''}`
    );
  },

  /**
   * 获取角色详情
   * 注意：API wrapper 会自动提取 response.data，所以直接返回 Character
   */
  getCharacter: (id: string) =>
    api.get<Character>(`/characters/${id}`),

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
