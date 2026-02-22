/**
 * 聊天角色关联表 Schema
 *
 * 多角色聊天的 join table，将多个角色关联到单个聊天
 */

import { pgTable, uuid, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { chats } from './chats';
import { characters } from './characters';

export const chatCharacters = pgTable('chat_characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueIdx: uniqueIndex('idx_chat_characters_unique').on(table.chatId, table.characterId),
  chatIdx: index('idx_chat_characters_chat').on(table.chatId),
}));

export type ChatCharacter = typeof chatCharacters.$inferSelect;
export type NewChatCharacter = typeof chatCharacters.$inferInsert;
