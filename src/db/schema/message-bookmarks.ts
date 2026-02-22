/**
 * メッセージブックマーク Schema
 *
 * ユーザーがメッセージをブックマークして後で参照できるようにする
 */

import { pgTable, uuid, integer, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { messages } from './chats';

export const messageBookmarks = pgTable('message_bookmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageId: integer('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_message_bookmarks_user_id').on(table.userId),
}));

export type MessageBookmark = typeof messageBookmarks.$inferSelect;
export type NewMessageBookmark = typeof messageBookmarks.$inferInsert;
