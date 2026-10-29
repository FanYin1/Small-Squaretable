import { eq, desc, gt, lt, sql, asc, and } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { messages, chats, type Message, type NewMessage } from '../schema/chats';

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
    if (pagination?.after != null) {
      conditions.push(gt(messages.id, pagination.after));
    }

    const query = this.db.select().from(messages).where(and(...conditions)).$dynamic();

    if (pagination) {
      const page = await query.limit(pagination.limit).orderBy(pagination.after != null ? asc(messages.id) : desc(messages.id));
      return pagination.after != null ? page : page.reverse();
    }
    return await query.orderBy(asc(messages.sentAt), asc(messages.id));
  }

  async findById(id: number): Promise<Message | null> {
    const result = await this.db.select().from(messages).where(eq(messages.id, id));
    return result[0] ?? null;
  }

  async findByClientMessageId(chatId: string, clientMessageId: string): Promise<Message | null> {
    const result = await this.db
      .select()
      .from(messages)
      .where(and(
        eq(messages.chatId, chatId),
        sql`${messages.extra}->>'clientMessageId' = ${clientMessageId}`
      ))
      .limit(1);
    return result[0] ?? null;
  }

  async update(
    id: number,
    data: { content?: string; pinned?: boolean; importance?: number }
  ): Promise<Message | null> {
    // 只写入明确传入的字段，避免 undefined 覆盖现有值，也避免编辑 pinned/importance 被静默丢弃
    const changes: Partial<Pick<NewMessage, 'content' | 'pinned' | 'importance'>> = {};
    if (data.content !== undefined) changes.content = data.content;
    if (data.pinned !== undefined) changes.pinned = data.pinned;
    if (data.importance !== undefined) changes.importance = data.importance;

    if (Object.keys(changes).length === 0) {
      return this.findById(id);
    }

    const result = await this.db
      .update(messages)
      .set(changes)
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
    // For very short queries (1-2 chars), tsvector doesn't work well — fall back to ILIKE
    if (query.length < 3) {
      const escaped = query.replace(/[%_\\]/g, '\\$&');
      return await this.db.select().from(messages)
        .where(and(
          eq(messages.chatId, chatId),
          sql`${messages.content} ILIKE ${'%' + escaped + '%'}`
        ))
        .orderBy(desc(messages.sentAt))
        .limit(limit);
    }

    return await this.db.select().from(messages)
      .where(and(
        eq(messages.chatId, chatId),
        sql`${messages.searchVector} @@ plainto_tsquery('simple', ${query})`
      ))
      .orderBy(sql`ts_rank(${messages.searchVector}, plainto_tsquery('simple', ${query})) DESC`)
      .limit(limit);
  }

  async searchGlobal(userId: string, query: string, limit = 50): Promise<(Message & { chatTitle: string | null })[]> {
    // For very short queries (1-2 chars), fall back to ILIKE
    if (query.length < 3) {
      const escaped = query.replace(/[%_\\]/g, '\\$&');
      return await this.db
        .select({
          id: messages.id,
          chatId: messages.chatId,
          role: messages.role,
          content: messages.content,
          attachments: messages.attachments,
          extra: messages.extra,
          characterId: messages.characterId,
          parentMessageId: messages.parentMessageId,
          pinned: messages.pinned,
          importance: messages.importance,
          searchVector: messages.searchVector,
          sentAt: messages.sentAt,
          chatTitle: chats.title,
        })
        .from(messages)
        .innerJoin(chats, eq(messages.chatId, chats.id))
        .where(and(
          eq(chats.userId, userId),
          sql`${messages.content} ILIKE ${'%' + escaped + '%'}`
        ))
        .orderBy(desc(messages.sentAt))
        .limit(limit);
    }

    return await this.db
      .select({
        id: messages.id,
        chatId: messages.chatId,
        role: messages.role,
        content: messages.content,
        attachments: messages.attachments,
        extra: messages.extra,
        characterId: messages.characterId,
        parentMessageId: messages.parentMessageId,
        pinned: messages.pinned,
        importance: messages.importance,
        searchVector: messages.searchVector,
        sentAt: messages.sentAt,
        chatTitle: chats.title,
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(and(
        eq(chats.userId, userId),
        sql`${messages.searchVector} @@ plainto_tsquery('simple', ${query})`
      ))
      .orderBy(sql`ts_rank(${messages.searchVector}, plainto_tsquery('simple', ${query})) DESC`)
      .limit(limit);
  }

  async deleteAfter(chatId: string, messageId: number): Promise<number> {
    const result = await this.db.delete(messages)
      .where(and(
        eq(messages.chatId, chatId),
        gt(messages.id, messageId)
      ))
      .returning();
    return result.length;
  }

  async countByChatId(chatId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.chatId, chatId));
    return result[0]?.count ?? 0;
  }

  async findBranch(chatId: string, leafMessageId: number): Promise<Message[]> {
    const result = await this.db.execute(sql`
      WITH RECURSIVE branch AS (
        SELECT * FROM messages WHERE id = ${leafMessageId} AND chat_id = ${chatId}
        UNION ALL
        SELECT m.* FROM messages m
        INNER JOIN branch b ON m.id = b.parent_message_id
        WHERE m.chat_id = ${chatId}
      )
      SELECT * FROM branch ORDER BY sent_at ASC
    `);
    return result as unknown as Message[];
  }

  async findSiblings(messageId: number): Promise<Message[]> {
    const [msg] = await this.db.select().from(messages)
      .where(eq(messages.id, messageId));
    if (!msg || !msg.parentMessageId) return [msg].filter(Boolean);

    return this.db.select().from(messages)
      .where(eq(messages.parentMessageId, msg.parentMessageId))
      .orderBy(messages.sentAt);
  }

  async createWithParent(data: NewMessage & { parentMessageId?: number }): Promise<Message> {
    const [row] = await this.db.insert(messages)
      .values({
        chatId: data.chatId,
        role: data.role,
        content: data.content,
        attachments: data.attachments,
        characterId: data.characterId,
        parentMessageId: data.parentMessageId,
      })
      .returning();
    return row;
  }

  async countSiblings(parentMessageId: number): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.parentMessageId, parentMessageId));
    return Number(result[0]?.count || 0);
  }
}

export const messageRepository = new MessageRepository(db);
