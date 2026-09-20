import { pgTable, uuid, varchar, text, integer, boolean, timestamp, jsonb, pgEnum, customType, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { characters } from './characters';

// Define tsvector custom type for full-text search
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const worldbookScopeEnum = pgEnum('worldbook_scope', ['global', 'character', 'persona', 'chat']);

export const worldbooks = pgTable('worldbooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  scope: worldbookScopeEnum('scope').default('character').notNull(),
  isEnabled: boolean('is_enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const worldbookEntries = pgTable('worldbook_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  worldbookId: uuid('worldbook_id').notNull().references(() => worldbooks.id, { onDelete: 'cascade' }),
  keyword: varchar('keyword', { length: 255 }).notNull(),
  content: text('content').notNull(),
  position: integer('position').default(0).notNull(),
  isEnabled: boolean('is_enabled').default(true).notNull(),
  priority: integer('priority').default(0).notNull(),
  settings: jsonb('settings').default({}).notNull(),
  characterFilter: jsonb('character_filter').default([]).notNull(), // Array of character IDs
  scanDepth: integer('scan_depth'), // Number of recent messages to scan
  contextPercentage: integer('context_percentage'), // Max % of context budget
  recursive: boolean('recursive').default(true).notNull(), // Content will be scanned for keywords
  preventRecursion: boolean('prevent_recursion').default(false).notNull(), // Won't be triggered by recursive scans
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  searchVector: tsvector('search_vector'),
}, (table) => ({
  characterFilterIdx: index('idx_worldbook_entries_character_filter').using('gin', table.characterFilter),
}));
