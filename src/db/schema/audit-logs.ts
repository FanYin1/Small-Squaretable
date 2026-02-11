/**
 * Audit Logs Schema
 *
 * Stores immutable audit trail entries for security and compliance.
 */

import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: varchar('actor_id', { length: 36 }).notNull(), // userId or 'system'
  actorIp: varchar('actor_ip', { length: 64 }), // SHA-256 hashed
  action: varchar('action', { length: 50 }).notNull(),
  targetType: varchar('target_type', { length: 20 }),
  targetId: varchar('target_id', { length: 36 }),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('audit_tenant_idx').on(table.tenantId),
  actorIdx: index('audit_actor_idx').on(table.actorId),
  actionIdx: index('audit_action_idx').on(table.action),
  createdAtIdx: index('audit_created_at_idx').on(table.createdAt),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
