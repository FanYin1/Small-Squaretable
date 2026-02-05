import { eq, and, desc, asc, sql, gt, lt } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { characters, type Character, type NewCharacter } from '../schema/characters';
import type { PaginationParams } from '../../types/api';

export interface CharacterFilters {
  tenantId?: string;
  creatorId?: string;
  isPublic?: boolean;
  isNsfw?: boolean;
  category?: string;
  tags?: string[];
}

export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
  direction?: 'forward' | 'backward';
}

export interface CursorPaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasMore: boolean;
}

export class CharacterRepository extends BaseRepository {
  async findById(id: string): Promise<Character | null> {
    const result = await this.db.select().from(characters).where(eq(characters.id, id));
    return result[0] ?? null;
  }

  async findByTenantId(tenantId: string, pagination?: PaginationParams): Promise<Character[]> {
    let query: any = this.db.select().from(characters).where(eq(characters.tenantId, tenantId));

    if (pagination?.sortBy) {
      if (pagination.sortBy === 'downloadCount') {
        query = pagination.sortOrder === 'asc'
          ? query.orderBy(asc(characters.downloadCount))
          : query.orderBy(desc(characters.downloadCount));
      } else if (pagination.sortBy === 'viewCount') {
        query = pagination.sortOrder === 'asc'
          ? query.orderBy(asc(characters.viewCount))
          : query.orderBy(desc(characters.viewCount));
      } else if (pagination.sortBy === 'createdAt') {
        query = pagination.sortOrder === 'asc'
          ? query.orderBy(asc(characters.createdAt))
          : query.orderBy(desc(characters.createdAt));
      } else if (pagination.sortBy === 'updatedAt') {
        query = pagination.sortOrder === 'asc'
          ? query.orderBy(asc(characters.updatedAt))
          : query.orderBy(desc(characters.updatedAt));
      }
    }

    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      query = query.limit(pagination.limit).offset(offset);
    }

    return await query;
  }

  async findPublic(pagination?: PaginationParams): Promise<Character[]> {
    let query: any = this.db.select().from(characters).where(eq(characters.isPublic, true)).orderBy(desc(characters.downloadCount));

    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      query = query.limit(pagination.limit).offset(offset);
    }

    return await query;
  }

  /**
   * Cursor-based pagination for marketplace (more efficient for large datasets)
   * Uses download_count as the cursor for consistent ordering
   */
  async findPublicWithCursor(params: CursorPaginationParams): Promise<CursorPaginatedResult<Character>> {
    const limit = params.limit ?? 20;

    // Build base conditions
    const conditions = [eq(characters.isPublic, true)];

    // Apply cursor condition if provided
    if (params.cursor) {
      const [downloadCount, id] = params.cursor.split('_');
      const cursorDownloadCount = parseInt(downloadCount, 10);

      // Get items after cursor (lower download count or same count but different id)
      conditions.push(
        sql`(${characters.downloadCount}, ${characters.id}) < (${cursorDownloadCount}, ${id})`
      );
    }

    // Execute query with all conditions
    const results = await this.db
      .select()
      .from(characters)
      .where(and(...conditions))
      .orderBy(desc(characters.downloadCount), desc(characters.id))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    // Generate cursors
    let nextCursor: string | undefined;
    let prevCursor: string | undefined;

    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      const firstItem = items[0];

      if (hasMore) {
        nextCursor = `${lastItem.downloadCount}_${lastItem.id}`;
      }

      if (params.cursor) {
        prevCursor = `${firstItem.downloadCount}_${firstItem.id}`;
      }
    }

    return {
      items,
      nextCursor,
      prevCursor,
      hasMore,
    };
  }

  async create(data: NewCharacter): Promise<Character> {
    const result = await this.db.insert(characters).values(data).returning();
    return result[0];
  }

  async update(id: string, tenantId: string, data: Partial<NewCharacter>): Promise<Character | null> {
    const result = await this.db
      .update(characters)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(characters.id, id), eq(characters.tenantId, tenantId)))
      .returning();
    return result[0] ?? null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db
      .delete(characters)
      .where(and(eq(characters.id, id), eq(characters.tenantId, tenantId)))
      .returning();
    return result.length > 0;
  }

  async incrementDownloadCount(id: string): Promise<void> {
    await this.db
      .update(characters)
      .set({ downloadCount: sql`${characters.downloadCount} + 1` })
      .where(eq(characters.id, id));
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.db
      .update(characters)
      .set({ viewCount: sql`${characters.viewCount} + 1` })
      .where(eq(characters.id, id));
  }

  async countByTenantId(tenantId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(characters)
      .where(eq(characters.tenantId, tenantId));
    return result[0]?.count ?? 0;
  }

  async countPublic(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(characters)
      .where(eq(characters.isPublic, true));
    return result[0]?.count ?? 0;
  }

  /**
   * Batch fetch characters by IDs (avoids N+1 queries)
   */
  async findByIds(ids: string[]): Promise<Character[]> {
    if (ids.length === 0) return [];

    const result = await this.db
      .select()
      .from(characters)
      .where(sql`${characters.id} = ANY(ARRAY[${sql.join(ids.map(id => sql`${id}::uuid`), sql`, `)}])`);

    return result;
  }

  /**
   * Get characters with their ratings in a single query (avoids N+1)
   */
  async findPublicWithRatings(pagination?: PaginationParams): Promise<Character[]> {
    // The ratings are already denormalized in the characters table
    // (ratingAvg, ratingCount), so no join needed
    return this.findPublic(pagination);
  }
}

export const characterRepository = new CharacterRepository(db);
