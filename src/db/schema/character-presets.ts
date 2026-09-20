import { pgTable, uuid, varchar, text, jsonb, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { characters } from './characters';

/**
 * Parameter presets for character cards
 * Allows users to save and reuse common parameter combinations
 */
export const characterPresets = pgTable(
  'character_presets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'cascade' }),

    // Preset name and description
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),

    // Preset parameters (partial character card overrides)
    preset: jsonb('preset').notNull(),

    // Whether this is a global preset (applies to all characters)
    isGlobal: boolean('is_global').default(false).notNull(),

    // Usage statistics
    useCount: integer('use_count').default(0).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('idx_character_presets_user_id').on(table.userId),
    characterIdIdx: index('idx_character_presets_character_id').on(table.characterId),
  })
);

export type CharacterPreset = typeof characterPresets.$inferSelect;
export type NewCharacterPreset = typeof characterPresets.$inferInsert;
