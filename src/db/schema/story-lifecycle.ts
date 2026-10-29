import { sql } from 'drizzle-orm';
import { boolean, check, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const storyRestoreLineage = pgTable('story_restore_lineage', {
  singleton: boolean('singleton').primaryKey().default(true),
  id: uuid('id').notNull().unique().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({ singletonCheck: check('story_restore_lineage_singleton_check', sql`${table.singleton}`) }));

export const storyIdReservations = pgTable('story_id_reservations', {
  chatId: uuid('chat_id').primaryKey(),
});

export const storyDeletions = pgTable('story_deletions', {
  chatId: uuid('chat_id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  creationRequests: jsonb('creation_requests').$type<Array<{ id: string; requestId: string; payloadHash: string; createdAt: string }>>().notNull().default([]),
}, table => ({ requestsCheck: check('story_deletions_creation_requests_check', sql`jsonb_typeof(${table.creationRequests}) = 'array'`) }));
