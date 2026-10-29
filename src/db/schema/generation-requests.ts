import { pgTable, uuid, varchar, timestamp, bigint, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { chats, messages } from './chats';

export const generationRequests = pgTable('generation_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  requestId: varchar('request_id', { length: 200 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  status: varchar('status', { length: 16 })
    .$type<'accepted' | 'running' | 'completed' | 'stopped' | 'failed'>()
    .notNull().default('accepted'),
  userMessageId: bigint('user_message_id', { mode: 'number' })
    .references(() => messages.id, { onDelete: 'set null' }),
  errorCode: varchar('error_code', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (table) => ({
  requestKey: uniqueIndex('idx_generation_requests_chat_request').on(table.chatId, table.requestId),
  statusCheck: check('generation_requests_status_check', sql`${table.status} IN ('accepted', 'running', 'completed', 'stopped', 'failed')`),
}));

export type GenerationRequest = typeof generationRequests.$inferSelect;
