/**
 * Quick Replies Schema
 *
 * 存储用户的快速回复预设
 */

import { pgTable, uuid, varchar, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';

export const quickReplies = pgTable('quick_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // 快速回复内容
  label: varchar('label', { length: 100 }).notNull(), // 按钮显示文本
  message: text('message').notNull(), // 实际发送的消息内容

  // 排序和分组
  order: integer('order').default(0).notNull(), // 显示顺序
  category: varchar('category', { length: 50 }), // 分类（可选）

  // 启用状态
  isEnabled: boolean('is_enabled').default(true).notNull(),

  // 时间戳
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type QuickReply = typeof quickReplies.$inferSelect;
export type NewQuickReply = typeof quickReplies.$inferInsert;
