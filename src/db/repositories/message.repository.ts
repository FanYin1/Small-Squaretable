import { eq, desc, gt, lt, sql, asc, and } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { messages, type Message, type NewMessage } from '../schema/chats';

export interface MessagePagination {
  limit: number;
  before?: number;
  after?: number;
}

export class MessageRepository extends BaseRepository {
  async findByChatId(chatId: string, pagination?: MessagePagination): Promise<Message[]> {
    const conditions = [eq(messages.chatId, chatId)];

    if (pagination?.before) {
      conditions.push(lt(messages.id, pagination.before));
    }
    if (pagination?.after) {
      conditions.push(gt(messages.id, pagination.after));
    }

    let query = this.db.select().from(messages).where(and(...conditions)).$dynamic();

    if (pagination) {
      query = query.limit(pagination.limit);
    }

    // Order by sentAt ascending so oldest messages appear first (top of chat)
    return await query.orderBy(asc(messages.sentAt));
  }

  async findById(id: number): Promise<Message | null> {
    const result = await this.db.select().from(messages).where(eq(messages.id, id));
    return result[0] ?? null;
  }

  async update(id: number, data: { content: string }): Promise<Message | null> {
    const result = await this.db
      .update(messages)
      .set({ content: data.content })
      .where(eq(messages.id, id))
      .returning();
    return result[0] ?? null;
  }

  async create(data: NewMessage): Promise<Message> {
    const result = await this.db.insert(messages).values(data).returning();
    return result[0];
  }

  async createMany(data: NewMessage[]): Promise<Message[]> {
    return await this.db.insert(messages).values(data).returning();
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.delete(messages).where(eq(messages.id, id)).returning();
    return result.length > 0;
  }

  async deleteByChatId(chatId: string): Promise<number> {
    const result = await this.db.delete(messages).where(eq(messages.chatId, chatId)).returning();
    return result.length;
  }

  async searchByChatId(chatId: string, query: string, limit = 50): Promise<Message[]> {
    const escaped = query.replace(/[%_\\]/g, '\\$&');
    return await this.db.select().from(messages)
      .where(and(
        eq(messages.chatId, chatId),
        sql`${messages.content} ILIKE ${'%' + escaped + '%'}`
      ))
      .orderBy(desc(messages.sentAt))
      .limit(limit);
  }

  async countByChatId(chatId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.chatId, chatId));
    return result[0]?.count ?? 0;
  }
}

export const messageRepository = new MessageRepository(db);
