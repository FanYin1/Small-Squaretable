import { pgTable, uuid, varchar, decimal, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';

export const characterRelationships = pgTable('character_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  targetCharacterId: uuid('target_character_id').references(() => characters.id, { onDelete: 'cascade' }),

  type: varchar('type', { length: 50 }).notNull(),
  affinity: decimal('affinity', { precision: 4, scale: 3 }).default('0.500').notNull(),
  label: varchar('label', { length: 100 }),
  description: text('description'),

  interactionCount: integer('interaction_count').default(0).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CharacterRelationship = typeof characterRelationships.$inferSelect;
export type NewCharacterRelationship = typeof characterRelationships.$inferInsert;
