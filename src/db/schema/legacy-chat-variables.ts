import { pgTable, uuid, jsonb } from 'drizzle-orm/pg-core';
import { chats } from './chats';

export const legacyChatVariables = pgTable('legacy_chat_variables', {
  chatId: uuid('chat_id').primaryKey().references(() => chats.id, { onDelete: 'cascade' }),
  values: jsonb('values').$type<Record<string, string>>().notNull(),
});
