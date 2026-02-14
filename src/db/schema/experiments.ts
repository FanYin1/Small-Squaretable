/**
 * Experiments Schema
 *
 * Stores A/B test experiment definitions with variant configurations.
 */

import { pgTable, uuid, varchar, text, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const experimentStatusEnum = pgEnum('experiment_status', ['draft', 'running', 'completed']);

export const experiments = pgTable('experiments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: experimentStatusEnum('status').default('draft').notNull(),
  variants: jsonb('variants').notNull().$type<Array<{ name: string; weight: number; config: Record<string, unknown> }>>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;
