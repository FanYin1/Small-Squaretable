import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { chats } from './chats';

export const chatCreationRequests = pgTable('chat_creation_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  chatId: uuid('chat_id').references(() => chats.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => ({
  requestKey: uniqueIndex('idx_chat_creation_requests_owner_request').on(table.tenantId, table.userId, table.requestId),
}));
