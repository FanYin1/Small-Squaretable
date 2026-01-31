/**
 * 评分表 Schema
 *
 * 存储用户对角色的五维度评分
 */

import { pgTable, uuid, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';

export const ratings = pgTable('ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // 五维度评分 (1-5 星)
  quality: integer('quality').notNull(),
  creativity: integer('creativity').notNull(),
  interactivity: integer('interactivity').notNull(),
  accuracy: integer('accuracy').notNull(),
  entertainment: integer('entertainment').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // 每个用户对每个角色只能评分一次
  uniqueCharacterUser: unique().on(table.characterId, table.userId),
}));

export type Rating = typeof ratings.$inferSelect;
export type NewRating = typeof ratings.$inferInsert;
