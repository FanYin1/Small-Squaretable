import { pgTable, uuid, varchar, text, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';
import { chats } from './chats';
import { users } from './users';

export const chatSnapshots = pgTable('chat_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  shareToken: varchar('share_token', { length: 64 }).notNull().unique(),
  title: varchar('title', { length: 500 }),
  messages: jsonb('messages').notNull().default([]),
  messageCount: integer('message_count').notNull().default(0),
  characterName: varchar('character_name', { length: 255 }),
  characterAvatar: text('character_avatar'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ChatSnapshot = typeof chatSnapshots.$inferSelect;
export type NewChatSnapshot = typeof chatSnapshots.$inferInsert;
