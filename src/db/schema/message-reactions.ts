import { pgTable, uuid, bigint, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { messages } from './chats';
import { users } from './users';

export const messageReactions = pgTable('message_reactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: bigint('message_id', { mode: 'bigint' }).notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: varchar('emoji', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueReaction: uniqueIndex('unique_reaction_idx').on(table.messageId, table.userId, table.emoji),
}));
