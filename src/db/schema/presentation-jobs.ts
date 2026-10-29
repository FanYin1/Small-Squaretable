import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';
import { tenants } from './tenants';
import type { PresentationDraft } from '../../types/story-presentation';
import type { PresentationJobStatus, PresentationUsage } from '../../types/presentation-job';

export const presentationJobs = pgTable('presentation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  sourceRevision: text('source_revision').notNull(),
  status: text('status').$type<PresentationJobStatus>().notNull().default('queued'),
  dispatchId: uuid('dispatch_id'), dispatchUntil: timestamp('dispatch_until', { withTimezone: true }),
  draft: jsonb('draft').$type<PresentationDraft>(), usage: jsonb('usage').$type<PresentationUsage>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  source: uniqueIndex('presentation_job_source').on(table.characterId, table.sourceRevision),
  pending: index('presentation_job_pending').on(table.status, table.createdAt),
}));
