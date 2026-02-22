import { eq, and, desc, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { chatTemplates, type ChatTemplate, type NewChatTemplate } from '../schema/chat-templates';

export class ChatTemplateRepository extends BaseRepository {
  async findById(id: string): Promise<ChatTemplate | null> {
    const [row] = await this.db.select().from(chatTemplates)
      .where(eq(chatTemplates.id, id));
    return row ?? null;
  }

  async findByUser(userId: string): Promise<ChatTemplate[]> {
    return await this.db.select().from(chatTemplates)
      .where(eq(chatTemplates.userId, userId))
      .orderBy(desc(chatTemplates.createdAt));
  }

  async findPublic(limit = 20, offset = 0): Promise<ChatTemplate[]> {
    return await this.db.select().from(chatTemplates)
      .where(eq(chatTemplates.isPublic, true))
      .orderBy(desc(chatTemplates.usageCount))
      .limit(limit)
      .offset(offset);
  }

  async create(data: NewChatTemplate): Promise<ChatTemplate> {
    const [row] = await this.db.insert(chatTemplates).values(data).returning();
    return row;
  }

  async update(
    id: string,
    userId: string,
    data: Partial<Pick<ChatTemplate, 'name' | 'description' | 'systemPrompt' | 'firstMessage' | 'tags' | 'isPublic'>>,
  ): Promise<ChatTemplate | null> {
    const [row] = await this.db.update(chatTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(chatTemplates.id, id), eq(chatTemplates.userId, userId)))
      .returning();
    return row ?? null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db.delete(chatTemplates)
      .where(and(eq(chatTemplates.id, id), eq(chatTemplates.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async incrementUsageCount(id: string): Promise<void> {
    await this.db.update(chatTemplates)
      .set({ usageCount: sql`${chatTemplates.usageCount} + 1` })
      .where(eq(chatTemplates.id, id));
  }
}

export const chatTemplateRepository = new ChatTemplateRepository(db);
