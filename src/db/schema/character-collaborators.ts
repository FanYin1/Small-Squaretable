import { pgTable, uuid, varchar, timestamp, unique } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';

export const characterCollaborators = pgTable('character_collaborators', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default('editor'),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueCollaborator: unique().on(table.characterId, table.userId),
}));

export type CharacterCollaborator = typeof characterCollaborators.$inferSelect;
export type NewCharacterCollaborator = typeof characterCollaborators.$inferInsert;
