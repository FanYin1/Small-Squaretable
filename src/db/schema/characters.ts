/**
 * 角色表 Schema
 *
 * 存储 AI 角色卡数据，支持公开分享和市场功能
 */

import { pgTable, uuid, varchar, timestamp, jsonb, boolean, integer, decimal, text, customType, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { moderationStatusEnum, violationCategoryEnum } from './moderation-enums';

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

  // Prompt template (default, alpaca, chatml, vicuna, llama2)
  promptTemplate: varchar('prompt_template', { length: 50 }).default('default'),

  // 分类和标签
  tags: text('tags').array(),
  category: varchar('category', { length: 50 }),

  // 公开和分享
  isPublic: boolean('is_public').default(false).notNull(),
  isNsfw: boolean('is_nsfw').default(false).notNull(),

  // 审核状态。默认 draft：新角色要走发布申请才进公开入口。
  // 已存在的公开角色由迁移一次性标为 approved，不回溯审核，
  // 否则现有数据会在部署瞬间全部下架。
  moderationStatus: moderationStatusEnum('moderation_status').default('draft').notNull(),
  // 被驳回/下架时的违规分类，供审核后台统计口径使用。
  violationCategory: violationCategoryEnum('violation_category'),
  // 给作者看的处置说明，作者需要知道改什么才能重新提交。
  moderationNote: text('moderation_note'),
  moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  moderatedBy: uuid('moderated_by').references(() => users.id, { onDelete: 'set null' }),
  shareToken: varchar('share_token', { length: 64 }),
  forkedFromId: uuid('forked_from_id'),

  // 统计数据
  downloadCount: integer('download_count').default(0).notNull(),
  viewCount: integer('view_count').default(0).notNull(),
  ratingAvg: decimal('rating_avg', { precision: 3, scale: 2 }),
  ratingCount: integer('rating_count').default(0).notNull(),
  favoriteCount: integer('favorite_count').default(0).notNull(),
  commentCount: integer('comment_count').default(0).notNull(),

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
}, (table) => ({
  tenantIdIdx: index('idx_characters_tenant_id').on(table.tenantId),
  creatorIdIdx: index('idx_characters_creator_id').on(table.creatorId),
  isPublicIdx: index('idx_characters_is_public').on(table.isPublic),
  isPublicCreatedAtIdx: index('idx_characters_is_public_created_at').on(table.isPublic, table.createdAt),
  isPublicDownloadsIdx: index('idx_characters_public_downloads').on(table.isPublic, table.downloadCount),
  // 公开发现入口现在同时过滤 is_public / is_nsfw / moderation_status
  moderationStatusIdx: index('idx_characters_moderation_status').on(table.moderationStatus),
  publicVisibleIdx: index('idx_characters_public_visible')
    .on(table.isPublic, table.isNsfw, table.moderationStatus),
}));

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
