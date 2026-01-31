/**
 * 用量追踪表 Schema
 *
 * 记录租户的资源使用情况，用于计费和配额管理
 */

import { pgTable, uuid, varchar, timestamp, integer, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const resourceTypeEnum = pgEnum('resource_type', ['llm_tokens', 'messages', 'images', 'api_calls']);

export const usage = pgTable('usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  resourceType: resourceTypeEnum('resource_type').notNull(),
  amount: integer('amount').notNull(),
  period: varchar('period', { length: 7 }).notNull(), // 格式: YYYY-MM
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdIdx: index('usage_tenant_id_idx').on(table.tenantId),
  periodIdx: index('usage_period_idx').on(table.period),
  tenantPeriodIdx: index('usage_tenant_period_idx').on(table.tenantId, table.period),
}));

export type Usage = typeof usage.$inferSelect;
export type NewUsage = typeof usage.$inferInsert;
