/**
 * 角色表 Schema
 *
 * 存储 AI 角色卡数据，支持公开分享和市场功能
 */

import { pgTable, uuid, varchar, timestamp, jsonb, boolean, integer, decimal, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  creatorId: uuid('creator_id')
    .references(() => users.id, { onDelete: 'set null' }),

  // 基本信息
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  avatarUrl: varchar('avatar_url', { length: 500 }),

  // 角色卡数据 (完整的 SillyTavern 角色卡 JSON)
  cardData: jsonb('card_data').notNull(),

  // 分类和标签
  tags: text('tags').array(),
  category: varchar('category', { length: 50 }),

  // 公开和分享
  isPublic: boolean('is_public').default(false).notNull(),
  isNsfw: boolean('is_nsfw').default(false).notNull(),

  // 统计数据
  downloadCount: integer('download_count').default(0).notNull(),
  viewCount: integer('view_count').default(0).notNull(),
  ratingAvg: decimal('rating_avg', { precision: 3, scale: 2 }),
  ratingCount: integer('rating_count').default(0).notNull(),

  // 时间戳
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
