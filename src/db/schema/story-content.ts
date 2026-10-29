import { pgTable, uuid, jsonb } from 'drizzle-orm/pg-core';
import { chats } from './chats';
import type { StoryContentSnapshot } from '../../types/story-content';

export const storyContent = pgTable('story_content', {
  chatId: uuid('chat_id').primaryKey().references(() => chats.id, { onDelete: 'cascade' }),
  snapshot: jsonb('snapshot').$type<StoryContentSnapshot>().notNull(),
});
