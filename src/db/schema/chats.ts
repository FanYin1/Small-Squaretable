/**
 * 聊天和消息表 Schema
 *
 * 存储用户与角色的对话记录
 */

import { pgTable, uuid, varchar, timestamp, jsonb, text, bigserial, bigint, integer, pgEnum, index, customType } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { characters } from './characters';

// 定义 tsvector 自定义类型
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system']);

export const chats = pgTable('chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id')
    .references(() => characters.id, { onDelete: 'set null' }),

  title: varchar('title', { length: 500 }),
  summary: text('summary'),
  metadata: jsonb('metadata').default({}).notNull(),

  lastReadMessageId: bigint('last_read_message_id', { mode: 'number' }),
  unreadCount: integer('unread_count').default(0).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('idx_chats_user_id').on(table.userId),
  characterIdIdx: index('idx_chats_character_id').on(table.characterId),
}));

export const messages = pgTable('messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),

  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  attachments: jsonb('attachments'),
  extra: jsonb('extra'),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
  parentMessageId: bigint('parent_message_id', { mode: 'number' }),

  // Full-text search vector (auto-populated by DB trigger)
  searchVector: tsvector('search_vector'),

  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  chatIdSentAtIdx: index('idx_messages_chat_id_sent_at').on(table.chatId, table.sentAt),
  parentMessageIdIdx: index('idx_messages_parent_message_id').on(table.parentMessageId),
  chatIdRoleIdx: index('idx_messages_chat_id_role').on(table.chatId, table.role),
}));

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
