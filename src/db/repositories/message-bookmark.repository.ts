import { eq, and, desc, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { messageBookmarks, type MessageBookmark, type NewMessageBookmark } from '../schema/message-bookmarks';
import { messages } from '../schema/chats';

export class MessageBookmarkRepository extends BaseRepository {
  async findByUser(userId: string, limit = 50, offset = 0) {
    return await this.db.select({
      id: messageBookmarks.id,
      userId: messageBookmarks.userId,
      messageId: messageBookmarks.messageId,
      note: messageBookmarks.note,
      createdAt: messageBookmarks.createdAt,
      chatId: messages.chatId,
    }).from(messageBookmarks)
      .innerJoin(messages, eq(messages.id, messageBookmarks.messageId))
      .where(eq(messageBookmarks.userId, userId))
      .orderBy(desc(messageBookmarks.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async findByMessage(userId: string, messageId: number): Promise<MessageBookmark | null> {
    const [row] = await this.db.select().from(messageBookmarks)
      .where(and(
        eq(messageBookmarks.userId, userId),
        eq(messageBookmarks.messageId, messageId)
      ));
    return row ?? null;
  }

  async create(data: NewMessageBookmark): Promise<MessageBookmark> {
    const [row] = await this.db.insert(messageBookmarks).values(data).returning();
    return row;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db.delete(messageBookmarks)
      .where(and(
        eq(messageBookmarks.id, id),
        eq(messageBookmarks.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  async deleteByMessage(userId: string, messageId: number): Promise<boolean> {
    const result = await this.db.delete(messageBookmarks)
      .where(and(
        eq(messageBookmarks.userId, userId),
        eq(messageBookmarks.messageId, messageId)
      ))
      .returning();
    return result.length > 0;
  }

  async countByUser(userId: string): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` })
      .from(messageBookmarks)
      .where(eq(messageBookmarks.userId, userId));
    return result[0]?.count ?? 0;
  }
}

export const messageBookmarkRepository = new MessageBookmarkRepository(db);
