/**
 * OAuth Accounts Schema
 *
 * Links external OAuth provider accounts (Google, GitHub) to local users.
 */

import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull(), // 'google' | 'github'
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  providerAccountUnique: uniqueIndex('oauth_provider_account_idx').on(table.provider, table.providerAccountId),
}));

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;
