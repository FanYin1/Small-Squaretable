/**
 * 角色表 Schema
 *
 * 存储 AI 角色卡数据，支持公开分享和市场功能
 */

import { pgTable, uuid, varchar, timestamp, jsonb, boolean, integer, decimal, text, customType } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

// 定义 tsvector 自定义类型
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

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
  // Use text type to support base64 encoded images (data URLs can be very large)
  avatarUrl: text('avatar_url'),

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

  // 五维度评分平均值
  ratingQualityAvg: decimal('rating_quality_avg', { precision: 3, scale: 2 }),
  ratingCreativityAvg: decimal('rating_creativity_avg', { precision: 3, scale: 2 }),
  ratingInteractivityAvg: decimal('rating_interactivity_avg', { precision: 3, scale: 2 }),
  ratingAccuracyAvg: decimal('rating_accuracy_avg', { precision: 3, scale: 2 }),
  ratingEntertainmentAvg: decimal('rating_entertainment_avg', { precision: 3, scale: 2 }),
  ratingOverallAvg: decimal('rating_overall_avg', { precision: 3, scale: 2 }),

  // 时间戳
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

  // 全文搜索向量
  searchVector: tsvector('search_vector'),
});

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
