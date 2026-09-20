/**
 * Character Emotion Schema
 *
 * Tracks emotional state using 2D Valence-Arousal model
 */

import { pgTable, uuid, decimal, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';
import { chats } from './chats';
import { sql } from 'drizzle-orm';

export const characterEmotions = pgTable('character_emotions', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  chatId: uuid('chat_id')
    .references(() => chats.id, { onDelete: 'cascade' }),

  // 2D emotion values
  valence: decimal('valence', { precision: 4, scale: 3 }).notNull(), // -1 to 1
  arousal: decimal('arousal', { precision: 4, scale: 3 }).notNull(), // 0 to 1

  // Trigger info
  triggerMessageId: integer('trigger_message_id'),
  triggerContent: text('trigger_content'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Partial unique index: one emotion per character-user-chat combination (when chat_id is not null)
  uniqueEmotionPerChat: uniqueIndex('character_emotions_unique_per_chat')
    .on(table.characterId, table.userId, table.chatId)
    .where(sql`${table.chatId} IS NOT NULL`),
}));

export type CharacterEmotion = typeof characterEmotions.$inferSelect;
export type NewCharacterEmotion = typeof characterEmotions.$inferInsert;
