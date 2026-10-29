import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, timestamp, primaryKey, check } from 'drizzle-orm/pg-core';
import { characters } from './characters';

export const characterImportRepairs = pgTable('character_import_repairs', {
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  reviewFingerprint: varchar('review_fingerprint', { length: 64 }).notNull(),
  bookId: uuid('book_id').notNull(),
  entryCount: integer('entry_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.characterId, table.reviewFingerprint] }),
  check('character_import_repairs_fingerprint', sql`${table.reviewFingerprint} ~ '^[0-9a-f]{64}$'`),
  check('character_import_repairs_entries', sql`${table.entryCount} > 0`),
]);
