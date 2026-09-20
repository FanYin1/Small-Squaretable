import { pgTable, uuid, jsonb, boolean, text, timestamp, index } from 'drizzle-orm/pg-core';
import { chats } from './chats';

/**
 * Chat-level parameter overrides for character cards
 * Allows temporary adjustments without modifying the original character card
 */
export const chatOverrides = pgTable(
  'chat_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),

    // Partial overrides for character card parameters
    // Can override: personality, scenario, system_prompt, post_history_instructions, etc.
    overrides: jsonb('overrides').notNull(),

    // Whether this override is currently active
    enabled: boolean('enabled').default(true).notNull(),

    // Optional note explaining why this override was created
    note: text('note'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    chatIdIdx: index('idx_chat_overrides_chat_id').on(table.chatId),
  })
);

export type ChatOverride = typeof chatOverrides.$inferSelect;
export type NewChatOverride = typeof chatOverrides.$inferInsert;
