/**
 * 搜索系统类型定义
 */

import { z } from 'zod';

/**
 * 搜索查询参数验证 Schema
 */
export const searchCharactersSchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  sort: z.enum(['relevance', 'rating', 'popular', 'newest']).default('relevance'),
  filter: z.enum(['public', 'my', 'all']).default('public'),
  category: z.string().optional(),
  tags: z.string().optional(), // 逗号分隔
  isNsfw: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SearchCharactersQuery = z.infer<typeof searchCharactersSchema>;

/**
 * 搜索选项接口
 */
export interface SearchOptions {
  query: string;
  sort: 'relevance' | 'rating' | 'popular' | 'newest';
  filter: 'public' | 'my' | 'all';
  category?: string;
  tags?: string[];
  isNsfw?: boolean;
  tenantId?: string;
  userId?: string;
  page: number;
  limit: number;
}

/**
 * 搜索结果项
 */
export interface SearchResultItem {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  category?: string;
  tags?: string[];
  isPublic: boolean;
  isNsfw: boolean;
  downloadCount: number;
  viewCount: number;
  ratingAvg?: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
  rank?: number;
}

/**
 * 分页信息
 */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  items: SearchResultItem[];
  pagination: PaginationInfo;
}
