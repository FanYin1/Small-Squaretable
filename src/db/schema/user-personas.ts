/**
 * User Personas Schema
 *
 * 存储用户的多个角色身份（personas），用于不同的角色扮演场景
 */

import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userPersonas = pgTable('user_personas', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Persona 基本信息
  name: varchar('name', { length: 100 }).notNull(), // Persona 名称，用于替换 {{user}} 宏
  description: text('description'), // Persona 详细描述，注入到系统提示词
  avatarUrl: text('avatar_url'), // Persona 头像 URL

  // 灵活的元数据存储（年龄、性别、性格特征等）
  metadata: jsonb('metadata').default({}).notNull(),

  // 默认 Persona 标记
  isDefault: boolean('is_default').default(false).notNull(),

  // 时间戳
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_user_personas_user_id').on(table.userId),
  isDefaultIdx: index('idx_user_personas_is_default').on(table.userId, table.isDefault),
}));

export type UserPersona = typeof userPersonas.$inferSelect;
export type NewUserPersona = typeof userPersonas.$inferInsert;
