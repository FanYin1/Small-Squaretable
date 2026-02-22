/**
 * Character Growth Schema
 *
 * Tracks per-user character leveling, experience, and milestones.
 */

import { pgTable, uuid, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';

export const characterGrowth = pgTable('character_growth', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  level: integer('level').default(1).notNull(),
  experience: integer('experience').default(0).notNull(),
  totalMessages: integer('total_messages').default(0).notNull(),
  totalChats: integer('total_chats').default(0).notNull(),

  milestones: jsonb('milestones').default([]).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  characterIdUserIdIdx: index('idx_character_growth_character_id_user_id').on(table.characterId, table.userId),
}));

export type CharacterGrowthRecord = typeof characterGrowth.$inferSelect;
export type NewCharacterGrowthRecord = typeof characterGrowth.$inferInsert;
