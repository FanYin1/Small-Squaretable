import { eq, and, desc } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { chats, type Chat, type NewChat } from '../schema/chats';
import type { PaginationParams } from '../../types/api';

export class ChatRepository extends BaseRepository {
  async findById(id: string): Promise<Chat | null> {
    const result = await this.db.select().from(chats).where(eq(chats.id, id));
    return result[0] ?? null;
  }

  async findByIdAndTenant(id: string, tenantId: string): Promise<Chat | null> {
    const result = await this.db
      .select()
      .from(chats)
      .where(and(eq(chats.id, id), eq(chats.tenantId, tenantId)));
    return result[0] ?? null;
  }

  async findByUserId(userId: string, pagination?: PaginationParams): Promise<Chat[]> {
    let query = this.db.select().from(chats).where(eq(chats.userId, userId)).orderBy(desc(chats.updatedAt)) as any;

    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      query = query.limit(pagination.limit).offset(offset);
    }

    return await query;
  }

  async findByCharacterId(characterId: string): Promise<Chat[]> {
    return await this.db
      .select()
      .from(chats)
      .where(eq(chats.characterId, characterId))
      .orderBy(desc(chats.updatedAt));
  }

  async create(data: NewChat): Promise<Chat> {
    const result = await this.db.insert(chats).values(data).returning();
    return result[0];
  }

  async update(id: string, tenantId: string, data: Partial<NewChat>): Promise<Chat | null> {
    const result = await this.db
      .update(chats)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(chats.id, id), eq(chats.tenantId, tenantId)))
      .returning();
    return result[0] ?? null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db
      .delete(chats)
      .where(and(eq(chats.id, id), eq(chats.tenantId, tenantId)))
      .returning();
    return result.length > 0;
  }
}

export const chatRepository = new ChatRepository(db);
