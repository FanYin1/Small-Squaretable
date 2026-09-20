/**
 * User Persona Repository
 *
 * 数据访问层：用户 Persona CRUD 操作
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '..';
import { userPersonas, type UserPersona, type NewUserPersona } from '../schema/user-personas';

export class UserPersonaRepository {
  /**
   * 创建 Persona
   */
  async create(data: NewUserPersona): Promise<UserPersona> {
    const [persona] = await db.insert(userPersonas).values(data).returning();
    return persona;
  }

  /**
   * 根据 ID 查找 Persona
   */
  async findById(id: string): Promise<UserPersona | null> {
    const [persona] = await db.select().from(userPersonas).where(eq(userPersonas.id, id));
    return persona || null;
  }

  /**
   * 查找用户的所有 Personas（默认 Persona 排在前面）
   */
  async findByUserId(userId: string): Promise<UserPersona[]> {
    return db
      .select()
      .from(userPersonas)
      .where(eq(userPersonas.userId, userId))
      .orderBy(desc(userPersonas.isDefault), desc(userPersonas.createdAt));
  }

  /**
   * 查找用户的默认 Persona
   */
  async findDefaultByUserId(userId: string): Promise<UserPersona | null> {
    const [persona] = await db
      .select()
      .from(userPersonas)
      .where(and(eq(userPersonas.userId, userId), eq(userPersonas.isDefault, true)));
    return persona || null;
  }

  /**
   * 更新 Persona
   */
  async update(id: string, data: Partial<NewUserPersona>): Promise<UserPersona | null> {
    const [updated] = await db
      .update(userPersonas)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userPersonas.id, id))
      .returning();
    return updated || null;
  }

  /**
   * 删除 Persona
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.delete(userPersonas).where(eq(userPersonas.id, id));
    return result.length > 0;
  }

  /**
   * 清除用户的所有默认标记
   */
  async clearDefaultForUser(userId: string): Promise<void> {
    await db
      .update(userPersonas)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(userPersonas.userId, userId), eq(userPersonas.isDefault, true)));
  }

  /**
   * 设置为默认 Persona（使用事务确保原子性）
   */
  async setDefault(id: string, userId: string): Promise<UserPersona | null> {
    return db.transaction(async (tx) => {
      // 清除该用户的所有默认标记
      await tx
        .update(userPersonas)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(userPersonas.userId, userId), eq(userPersonas.isDefault, true)));

      // 设置新的默认 Persona
      const [updated] = await tx
        .update(userPersonas)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(and(eq(userPersonas.id, id), eq(userPersonas.userId, userId)))
        .returning();

      return updated || null;
    });
  }

  /**
   * 统计用户的 Persona 数量
   */
  async countByUserId(userId: string): Promise<number> {
    const result = await db
      .select({ count: db.$count() })
      .from(userPersonas)
      .where(eq(userPersonas.userId, userId));
    return result[0]?.count || 0;
  }
}

export const userPersonaRepository = new UserPersonaRepository();
