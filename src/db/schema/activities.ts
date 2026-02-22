/**
 * 活动动态表 Schema
 *
 * 存储用户活动记录，用于生成关注者动态流
 */

import { pgTable, uuid, varchar, text, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // 'follow', 'favorite', 'comment', 'character_created'
  targetType: varchar('target_type', { length: 50 }), // 'user', 'character', 'comment'
  targetId: uuid('target_id'),
  metadata: jsonb('metadata'), // extra context (character name, comment preview, etc.)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_activities_user').on(table.userId),
  createdAtIdx: index('idx_activities_created_at').on(table.createdAt),
  typeIdx: index('idx_activities_type').on(table.type),
}));

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
