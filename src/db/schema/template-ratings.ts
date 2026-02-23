import { pgTable, uuid, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { characterTemplates } from './character-templates';
import { users } from './users';

export const templateRatings = pgTable('template_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => characterTemplates.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(), // 1-5
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueTemplateUser: unique().on(table.templateId, table.userId),
}));

export type TemplateRating = typeof templateRatings.$inferSelect;
export type NewTemplateRating = typeof templateRatings.$inferInsert;
