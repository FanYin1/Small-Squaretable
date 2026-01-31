import { eq, and, desc, asc, sql } from 'drizzle-orm';
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

export class CharacterRepository extends BaseRepository {
  async findById(id: string): Promise<Character | null> {
    const result = await this.db.select().from(characters).where(eq(characters.id, id));
    return result[0] ?? null;
  }

  async findByTenantId(tenantId: string, pagination?: PaginationParams): Promise<Character[]> {
    let query = this.db.select().from(characters).where(eq(characters.tenantId, tenantId)) as any;

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
    let query = this.db.select().from(characters).where(eq(characters.isPublic, true)).orderBy(desc(characters.downloadCount)) as any;

    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      query = query.limit(pagination.limit).offset(offset);
    }

    return await query;
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
}

export const characterRepository = new CharacterRepository(db);
