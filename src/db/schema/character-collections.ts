import { pgTable, uuid, varchar, text, timestamp, integer, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import { characters } from './characters';

export const characterCollections = pgTable('character_collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 7 }),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_collections_user').on(table.userId),
}));

export const characterCollectionItems = pgTable('character_collection_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionId: uuid('collection_id').notNull().references(() => characterCollections.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0).notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  collectionIdx: index('idx_collection_items_collection').on(table.collectionId),
  characterIdx: index('idx_collection_items_character').on(table.characterId),
  uniqueItem: unique('uq_collection_character').on(table.collectionId, table.characterId),
}));

export type CharacterCollection = typeof characterCollections.$inferSelect;
export type NewCharacterCollection = typeof characterCollections.$inferInsert;
export type CharacterCollectionItem = typeof characterCollectionItems.$inferSelect;
export type NewCharacterCollectionItem = typeof characterCollectionItems.$inferInsert;
