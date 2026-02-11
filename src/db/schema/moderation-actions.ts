/**
 * Moderation Actions Schema
 *
 * Logs actions taken by moderators/admins on reported content.
 */

import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const moderationActions = pgTable('moderation_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  moderatorId: uuid('moderator_id').notNull().references(() => users.id),
  targetType: varchar('target_type', { length: 20 }).notNull(),
  targetId: uuid('target_id').notNull(),
  action: varchar('action', { length: 20 }).notNull(), // 'approve' | 'reject' | 'hide' | 'suspend' | 'unsuspend'
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ModerationAction = typeof moderationActions.$inferSelect;
export type NewModerationAction = typeof moderationActions.$inferInsert;
