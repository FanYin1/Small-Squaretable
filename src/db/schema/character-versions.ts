/**
 * 角色版本历史表 Schema
 *
 * 存储角色卡数据的版本快照，支持撤销和恢复
 */

import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';

export const characterVersions = pgTable('character_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  cardData: jsonb('card_data').notNull(),
  changeNote: text('change_note'),
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  characterIdx: index('idx_character_versions_character').on(table.characterId),
  versionIdx: index('idx_character_versions_version').on(table.characterId, table.version),
}));

export type CharacterVersion = typeof characterVersions.$inferSelect;
export type NewCharacterVersion = typeof characterVersions.$inferInsert;
