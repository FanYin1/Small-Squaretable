import { eq, desc, gt, lt, sql } from 'drizzle-orm';
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
    let query: any = this.db.select().from(messages).where(eq(messages.chatId, chatId));

    if (pagination) {
      if (pagination.before) {
        query = query.where(lt(messages.id, pagination.before));
      }
      if (pagination.after) {
        query = query.where(gt(messages.id, pagination.after));
      }
      query = query.limit(pagination.limit);
    }

    return await query.orderBy(desc(messages.sentAt));
  }

  async findById(id: number): Promise<Message | null> {
    const result = await this.db.select().from(messages).where(eq(messages.id, id));
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

  async countByChatId(chatId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.chatId, chatId));
    return result[0]?.count ?? 0;
  }
}

export const messageRepository = new MessageRepository(db);
