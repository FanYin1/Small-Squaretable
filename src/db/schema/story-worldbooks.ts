import { pgTable, uuid, jsonb } from 'drizzle-orm/pg-core';
import { chats } from './chats';
import type { StoryWorldbooksSnapshot } from '../../types/story-worldbooks';

export const storyWorldbooks = pgTable('story_worldbooks', {
  chatId: uuid('chat_id').primaryKey().references(() => chats.id, { onDelete: 'cascade' }),
  snapshot: jsonb('snapshot').$type<StoryWorldbooksSnapshot>().notNull(),
});
