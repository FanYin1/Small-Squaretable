/**
 * 搜索服务
 *
 * 提供全文搜索功能，支持关键词搜索、过滤和排序
 */

import { sql, and, or, eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { characters } from '@/db/schema/characters';
import type { SearchOptions, SearchResult, SearchResultItem } from '@/types/search';

export class SearchService {
  /**
   * 搜索角色
   *
   * @param options 搜索选项
   * @returns 搜索结果
   */
  async searchCharacters(options: SearchOptions): Promise<SearchResult> {
    const { query, sort, filter, category, tags, isNsfw, userId, page, limit } = options;
    const offset = (page - 1) * limit;

    // 检查是否为通配符查询或空查询（浏览所有角色）
    const isWildcardQuery = !query || query.trim() === '' || query.trim() === '*';

    // 构建搜索查询 - 使用 plainto_tsquery 进行安全的文本搜索
    const tsQuery = isWildcardQuery ? null : sql`plainto_tsquery('english', ${query})`;

    // 基础条件
    const conditions: ReturnType<typeof sql>[] = [];

    // 只有在非通配符查询时才添加全文搜索条件
    if (tsQuery) {
      conditions.push(sql`${characters.searchVector} @@ ${tsQuery}`);
    }

    // 过滤条件
    if (filter === 'public') {
      conditions.push(eq(characters.isPublic, true));
    } else if (filter === 'my' && userId) {
      conditions.push(eq(characters.creatorId, userId));
    } else if (filter === 'all' && userId) {
      const orCondition = or(
        eq(characters.isPublic, true),
        eq(characters.creatorId, userId)
      );
      if (orCondition) {
        conditions.push(orCondition);
      }
    }

    // 分类过滤
    if (category) {
      conditions.push(eq(characters.category, category));
    }

    // NSFW 过滤
    if (isNsfw !== undefined) {
      conditions.push(eq(characters.isNsfw, isNsfw));
    }

    // 标签过滤 - 使用数组重叠操作符
    if (tags && tags.length > 0) {
      conditions.push(sql`${characters.tags} && ARRAY[${sql.join(tags.map(t => sql`${t}`), sql`, `)}]`);
    }

    // 排序
    let orderBy;
    switch (sort) {
      case 'relevance':
        // 如果是通配符查询，按下载量排序；否则按相关性排序
        orderBy = tsQuery
          ? sql`ts_rank(${characters.searchVector}, ${tsQuery}) DESC`
          : desc(characters.downloadCount);
        break;
      case 'rating':
        orderBy = desc(characters.ratingAvg);
        break;
      case 'popular':
        orderBy = desc(characters.downloadCount);
        break;
      case 'newest':
        orderBy = desc(characters.createdAt);
        break;
      default:
        orderBy = tsQuery
          ? sql`ts_rank(${characters.searchVector}, ${tsQuery}) DESC`
          : desc(characters.downloadCount);
    }

    // 执行搜索查询
    const results = await db
      .select({
        id: characters.id,
        name: characters.name,
        description: characters.description,
        avatarUrl: characters.avatarUrl,
        category: characters.category,
        tags: characters.tags,
        isPublic: characters.isPublic,
        isNsfw: characters.isNsfw,
        downloadCount: characters.downloadCount,
        viewCount: characters.viewCount,
        ratingAvg: characters.ratingAvg,
        ratingCount: characters.ratingCount,
        createdAt: characters.createdAt,
        updatedAt: characters.updatedAt,
        rank: tsQuery
          ? sql<number>`ts_rank(${characters.searchVector}, ${tsQuery})`
          : sql<number>`1`,
      })
      .from(characters)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // 执行计数查询
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(characters)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count ?? 0;

    // 转换结果为 SearchResultItem 类型
    const items: SearchResultItem[] = results.map((result) => ({
      id: result.id,
      name: result.name,
      description: result.description || undefined,
      avatarUrl: result.avatarUrl || undefined,
      category: result.category || undefined,
      tags: result.tags || undefined,
      isPublic: result.isPublic,
      isNsfw: result.isNsfw,
      downloadCount: result.downloadCount,
      viewCount: result.viewCount,
      ratingAvg: result.ratingAvg ? Number(result.ratingAvg) : undefined,
      ratingCount: result.ratingCount,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      rank: result.rank,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}

// 导出单例
export const searchService = new SearchService();
