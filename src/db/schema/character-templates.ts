import { pgTable, uuid, varchar, text, jsonb, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const characterTemplates = pgTable('character_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  avatarUrl: text('avatar_url'),
  cardData: jsonb('card_data').notNull(),
  category: varchar('category', { length: 50 }),
  tags: text('tags').array(),
  isPublic: boolean('is_public').default(true).notNull(),
  usageCount: integer('usage_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CharacterTemplate = typeof characterTemplates.$inferSelect;
export type NewCharacterTemplate = typeof characterTemplates.$inferInsert;
