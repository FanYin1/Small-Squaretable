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
    const { query, sort, filter, category, tags, isNsfw, userId, page, limit, dateFrom, dateTo } = options;
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

    // 是否只搜索调用方自己的角色。作者需要能找到自己被标记的角色才能修正，
    // 所以只有这种情况跳过 NSFW 排除。
    const isOwnScope = filter === 'my' && !!userId;

    // 过滤条件
    if (filter === 'my' && userId) {
      conditions.push(eq(characters.creatorId, userId));
    } else if (filter === 'all' && userId) {
      const orCondition = or(
        eq(characters.isPublic, true),
        eq(characters.creatorId, userId)
      );
      if (orCondition) {
        conditions.push(orCondition);
      }
    } else {
      // filter === 'public' 以及未指定 filter 都走这里。
      // 此前未指定时不加任何条件，等于搜索全库——包括其他租户的私有角色。
      conditions.push(eq(characters.isPublic, true));
    }

    // 分类过滤
    if (category) {
      conditions.push(eq(characters.category, category));
    }

    // NSFW 排除：平台不允许色情内容，所以这是硬性条件而不是用户偏好。
    //
    // 原先是 `if (isNsfw !== undefined) push(eq(isNsfw, isNsfw))`，有两个问题：
    // 调用方不传就完全不过滤（客户端传的正是 `showNsfw || undefined`，
    // false || undefined === undefined，于是默认搜索返回 NSFW）；
    // 传 true 时反而变成「只返回 NSFW」。
    //
    // isNsfw 入参因此不再被采纳——保留在签名里只为不破坏现有调用方。
    if (!isOwnScope) {
      conditions.push(eq(characters.isNsfw, false));
    }

    // 标签过滤 - 使用数组重叠操作符
    if (tags && tags.length > 0) {
      conditions.push(sql`${characters.tags} && ARRAY[${sql.join(tags.map(t => sql`${t}`), sql`, `)}]`);
    }

    // 日期范围过滤
    if (dateFrom) {
      conditions.push(sql`${characters.createdAt} >= ${dateFrom}::timestamptz`);
    }
    if (dateTo) {
      conditions.push(sql`${characters.createdAt} <= ${dateTo}::timestamptz`);
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
        snippet: tsQuery
          ? sql<string>`ts_headline('english', coalesce(${characters.description}, ''), ${tsQuery}, 'MaxWords=35, MinWords=15, MaxFragments=1, StartSel=''<mark class="search-highlight">'', StopSel=''</mark>''')`
          : sql<string>`substring(coalesce(${characters.description}, '') from 1 for 150)`,
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
      snippet: result.snippet || undefined,
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
