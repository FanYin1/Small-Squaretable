/**
 * Character Emotion Schema
 *
 * Tracks emotional state using 2D Valence-Arousal model
 */

import { pgTable, uuid, decimal, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';
import { chats } from './chats';

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
});

export type CharacterEmotion = typeof characterEmotions.$inferSelect;
export type NewCharacterEmotion = typeof characterEmotions.$inferInsert;
