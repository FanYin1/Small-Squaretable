/**
 * Reports Schema
 *
 * Stores user-submitted reports for content moderation.
 */

import { pgTable, uuid, varchar, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './users';

export const reportStatusEnum = pgEnum('report_status', ['pending', 'resolved', 'dismissed']);

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: varchar('target_type', { length: 20 }).notNull(), // 'character' | 'comment' | 'user'
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(),
  status: reportStatusEnum('status').default('pending').notNull(),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
