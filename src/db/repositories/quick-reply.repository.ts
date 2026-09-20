/**
 * Quick Reply Repository
 *
 * 数据访问层：快速回复 CRUD 操作
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '..';
import { quickReplies, type QuickReply, type NewQuickReply } from '../schema/quick-replies';

export class QuickReplyRepository {
  /**
   * 创建快速回复
   */
  async create(data: NewQuickReply): Promise<QuickReply> {
    const [reply] = await db.insert(quickReplies).values(data).returning();
    return reply;
  }

  /**
   * 根据 ID 查找快速回复
   */
  async findById(id: string): Promise<QuickReply | null> {
    const [reply] = await db.select().from(quickReplies).where(eq(quickReplies.id, id));
    return reply || null;
  }

  /**
   * 查找用户的所有快速回复（按 order 排序）
   */
  async findByUserId(userId: string): Promise<QuickReply[]> {
    return db
      .select()
      .from(quickReplies)
      .where(eq(quickReplies.userId, userId))
      .orderBy(asc(quickReplies.order));
  }

  /**
   * 查找用户的启用快速回复
   */
  async findEnabledByUserId(userId: string): Promise<QuickReply[]> {
    return db
      .select()
      .from(quickReplies)
      .where(and(eq(quickReplies.userId, userId), eq(quickReplies.isEnabled, true)))
      .orderBy(asc(quickReplies.order));
  }

  /**
   * 更新快速回复
   */
  async update(id: string, data: Partial<NewQuickReply>): Promise<QuickReply | null> {
    const [updated] = await db
      .update(quickReplies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(quickReplies.id, id))
      .returning();
    return updated || null;
  }

  /**
   * 删除快速回复
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.delete(quickReplies).where(eq(quickReplies.id, id));
    return result.length > 0;
  }

  /**
   * 批量更新排序
   */
  async updateOrder(updates: Array<{ id: string; order: number }>): Promise<void> {
    await db.transaction(async (tx) => {
      for (const { id, order } of updates) {
        await tx
          .update(quickReplies)
          .set({ order, updatedAt: new Date() })
          .where(eq(quickReplies.id, id));
      }
    });
  }
}

export const quickReplyRepository = new QuickReplyRepository();
