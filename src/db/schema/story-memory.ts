import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, timestamp, jsonb, bigint, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { chats, messages } from './chats';
import { characters } from './characters';
import { characterMemories } from './memories';
import { storyEvents } from './story-state';

export const storyMemoryProgress = pgTable('story_memory_progress', {
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  eventIds: uuid('event_ids').array().notNull().default([]),
}, table => [primaryKey({ columns: [table.chatId, table.characterId] })]);

export const storyMemoryJobs = pgTable('story_memory_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  sourceEventIds: uuid('source_event_ids').array().notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leaseToken: uuid('lease_token'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  extracted: jsonb('extracted'),
  sourceDigest: text('source_digest'),
  errorCode: text('error_code'),
  replayHistory: jsonb('replay_history').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, table => [
  uniqueIndex('story_memory_jobs_source_key').on(table.chatId, table.characterId, table.sourceEventIds),
  index('story_memory_jobs_available').on(table.availableAt).where(sql`${table.status} IN ('pending', 'retry', 'running')`),
]);

export const storyMemoryLinks = pgTable('story_memory_links', {
  memoryId: uuid('memory_id').notNull().references(() => characterMemories.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => storyMemoryJobs.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => storyEvents.id, { onDelete: 'cascade' }),
  messageId: bigint('message_id', { mode: 'number' }).notNull().references(() => messages.id, { onDelete: 'cascade' }),
}, table => [
  primaryKey({ columns: [table.memoryId, table.eventId, table.messageId] }),
  index('story_memory_links_job').on(table.jobId), index('story_memory_links_event').on(table.eventId),
  index('story_memory_links_message').on(table.messageId),
]);
