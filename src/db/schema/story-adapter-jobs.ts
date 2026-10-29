import { pgTable, uuid, text, integer, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';
import { tenants } from './tenants';
import type { AdapterArtifact, AdapterJobStatus, AdapterJobView } from '../../types/story-adapter';

export const storyAdapterJobs = pgTable('story_adapter_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').notNull(), sourceRevision: text('source_revision').notNull(),
  status: text('status').$type<AdapterJobStatus>().notNull().default('queued'),
  stage: text('stage').$type<AdapterJobView['stage']>().notNull().default('collect'),
  attempt: integer('attempt').notNull().default(0), leaseId: uuid('lease_id'), leaseUntil: timestamp('lease_until', { withTimezone: true }),
  artifact: jsonb('artifact').$type<AdapterArtifact>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({ requestKey: uniqueIndex('story_adapter_request_key').on(table.characterId, table.userId, table.requestId),
  pending: index('story_adapter_pending').on(table.status, table.leaseUntil),
  versions: index('story_adapter_versions').on(table.characterId, table.createdAt) }));
