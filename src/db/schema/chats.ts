/**
 * 聊天和消息表 Schema
 *
 * 存储用户与角色的对话记录
 */

import { pgTable, uuid, varchar, timestamp, jsonb, text, bigserial, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { characters } from './characters';

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

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),

  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  attachments: jsonb('attachments'),
  extra: jsonb('extra'),

  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
