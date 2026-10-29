import { pgTable, uuid, integer, text, varchar, jsonb, timestamp, bigint, uniqueIndex } from 'drizzle-orm/pg-core';
import { chats, messages } from './chats';
import type { StoryValues, StoryNoteInput } from '../../types/story-state';

export const storyStates = pgTable('story_states', {
  chatId: uuid('chat_id').primaryKey().references(() => chats.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(0),
  values: jsonb('values').$type<StoryValues>().notNull(),
  completedActions: jsonb('completed_actions').$type<string[]>().notNull().default([]),
  sources: jsonb('sources').$type<Record<string, string>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const storyEvents = pgTable('story_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  requestId: varchar('request_id', { length: 200 }).notNull(), version: integer('version').notNull(),
  actionId: varchar('action_id', { length: 64 }), actionLabel: text('action_label'), outcome: text('outcome'),
  status: varchar('status', { length: 20 }).$type<'confirmed' | 'interrupted' | 'proposed'>().notNull(),
  inputMessageId: bigint('input_message_id', { mode: 'number' }).references(() => messages.id, { onDelete: 'set null' }),
  messageId: bigint('message_id', { mode: 'number' }).references(() => messages.id, { onDelete: 'set null' }),
  changes: jsonb('changes').$type<Record<string, { before: unknown; after: unknown }>>().notNull(),
  excerpt: text('excerpt').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  requestKey: uniqueIndex('story_events_request_key').on(table.chatId, table.requestId),
  versionKey: uniqueIndex('story_events_version_key').on(table.chatId, table.version),
}));

export const storyNotes = pgTable('story_notes', {
  id: uuid('id').primaryKey().defaultRandom(), chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 20 }).$type<StoryNoteInput['kind']>().notNull(), content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
