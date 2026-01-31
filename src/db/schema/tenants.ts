/**
 * 租户表 Schema
 *
 * 多租户系统的核心表，每个租户代表一个独立的组织或用户组
 */

import { pgTable, uuid, varchar, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const tenantPlanEnum = pgEnum('tenant_plan', ['free', 'personal', 'team', 'enterprise']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  plan: tenantPlanEnum('plan').default('free').notNull(),
  settings: jsonb('settings').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
