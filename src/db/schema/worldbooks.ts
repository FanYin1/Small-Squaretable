import { pgTable, uuid, varchar, text, integer, boolean, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './users';
import { characters } from './characters';

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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
