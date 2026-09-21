/**
 * Reports Schema
 *
 * Stores user-submitted reports for content moderation.
 */

import { pgTable, uuid, varchar, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { violationCategoryEnum } from './moderation-enums';

export const reportStatusEnum = pgEnum('report_status', ['pending', 'resolved', 'dismissed']);

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: varchar('target_type', { length: 20 }).notNull(), // 'character' | 'comment' | 'user'
  targetId: uuid('target_id').notNull(),
  // 分类是必填的枚举，reason 退为补充说明。
  // 此前只有自由文本 reason，审核后台无法按违规类型统计或筛选。
  // 历史数据由迁移填 'other'。
  category: violationCategoryEnum('category').default('other').notNull(),
  reason: text('reason').notNull(),
  status: reportStatusEnum('status').default('pending').notNull(),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // 后台默认只看 pending，按时间倒序
  statusCreatedAtIdx: index('idx_reports_status_created_at').on(table.status, table.createdAt),
  // 同一个目标被反复举报是重要信号
  targetIdx: index('idx_reports_target').on(table.targetType, table.targetId),
}));

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
