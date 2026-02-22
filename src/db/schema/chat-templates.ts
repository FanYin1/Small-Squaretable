/**
 * Chat Templates Schema
 *
 * Reusable chat templates with system prompts, first messages, and tags.
 */

import { pgTable, uuid, varchar, text, jsonb, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const chatTemplates = pgTable('chat_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt'),
  firstMessage: text('first_message'),
  tags: jsonb('tags').default([]).notNull(),
  isPublic: boolean('is_public').default(false).notNull(),
  usageCount: integer('usage_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ChatTemplate = typeof chatTemplates.$inferSelect;
export type NewChatTemplate = typeof chatTemplates.$inferInsert;
