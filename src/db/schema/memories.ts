/**
 * Character Memory Schema
 *
 * Stores long-term memories extracted from conversations
 */

import { pgTable, uuid, varchar, text, decimal, integer, timestamp, customType } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';
import { chats } from './chats';

// Custom type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(384)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value.replace(/^\[/, '[').replace(/\]$/, ']'));
  },
});

export const characterMemories = pgTable('character_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Memory content
  type: varchar('type', { length: 20 }).notNull(), // 'fact' | 'preference' | 'relationship' | 'event'
  content: text('content').notNull(),

  // Weight factors
  importance: decimal('importance', { precision: 3, scale: 2 }).default('0.5'),
  accessCount: integer('access_count').default(0),

  // Source tracking
  sourceChatId: uuid('source_chat_id').references(() => chats.id, { onDelete: 'set null' }),
  sourceMessageId: integer('source_message_id'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastAccessed: timestamp('last_accessed', { withTimezone: true }).defaultNow().notNull(),
});

export const characterMemoryVectors = pgTable('character_memory_vectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  memoryId: uuid('memory_id')
    .notNull()
    .references(() => characterMemories.id, { onDelete: 'cascade' }),
  embedding: vector('embedding'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CharacterMemory = typeof characterMemories.$inferSelect;
export type NewCharacterMemory = typeof characterMemories.$inferInsert;
export type CharacterMemoryVector = typeof characterMemoryVectors.$inferSelect;
export type NewCharacterMemoryVector = typeof characterMemoryVectors.$inferInsert;
