import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';
import { tenants } from './tenants';
import type { PresentationDraft } from '../../types/story-presentation';

export const characterPresentations = pgTable('character_presentations', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').notNull(),
  sourceRevision: text('source_revision').notNull(),
  draft: jsonb('draft').$type<PresentationDraft>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  request: uniqueIndex('character_presentation_request').on(table.characterId, table.userId, table.requestId),
  versions: index('character_presentation_versions').on(table.characterId, table.sourceRevision, table.createdAt),
}));
