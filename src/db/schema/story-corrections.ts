import { pgTable, uuid, integer, text, jsonb, timestamp, bigint, uniqueIndex } from 'drizzle-orm/pg-core';
import { chats, messages } from './chats';
import type { StoryBranchInput } from '../../types/story-corrections';

export const storyBranches = pgTable('story_branches', {
  chatId: uuid('chat_id').primaryKey().references(() => chats.id, { onDelete: 'cascade' }),
  rootId: uuid('root_id').notNull(), parentId: uuid('parent_id').notNull(),
  throughVersion: integer('through_version').notNull(),
  mode: text('mode').$type<StoryBranchInput['mode']>().notNull(), direction: text('direction').notNull(),
  evidenceIds: jsonb('evidence_ids').$type<number[]>().notNull(),
});

export const storyReadings = pgTable('story_readings', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  messageId: bigint('message_id', { mode: 'number' }).notNull().references(() => messages.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').notNull(), kind: text('kind').$type<'annotation' | 'layout'>().notNull(), content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, table => ({ requestKey: uniqueIndex('story_readings_request_key').on(table.chatId, table.requestId) }));
