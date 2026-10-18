/**
 * 邀请码表 Schema
 *
 * 注册采用邀请码制（backlog P0-6）：码由运营者在后台生成，
 * 可限定最大使用次数与过期时间。
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const inviteCodes = pgTable('invite_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 统一存大写；校验时对输入做同样的归一化 */
  code: varchar('code', { length: 64 }).notNull(),
  maxUses: integer('max_uses').notNull().default(1),
  usedCount: integer('used_count').notNull().default(0),
  /** NULL 表示永不过期 */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  /** 生成者。管理员账号被删除后码与使用记录仍要保留，所以是 set null 而非 cascade */
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  note: varchar('note', { length: 200 }),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  codeIdx: uniqueIndex('uq_invite_codes_code').on(table.code),
  createdAtIdx: index('idx_invite_codes_created_at').on(table.createdAt),
  // 消费用的条件更新是并发正确性的第一道防线，这条约束是第二道：
  // 万一哪天有人绕过 repository 直接写库，也不会出现 used_count 超过上限。
  usageWithinLimit: check('chk_invite_codes_usage', sql`${table.usedCount} <= ${table.maxUses}`),
  maxUsesPositive: check('chk_invite_codes_max_uses', sql`${table.maxUses} >= 1`),
}));

/**
 * 邀请码使用记录。
 *
 * 与建号在同一事务里写入，所以「这个账号用了哪个码」一定和账号本身同生共死。
 * 审计日志是 fire-and-forget 且有保留期清理，不能单独承担这个追溯责任。
 */
export const inviteCodeUses = pgTable('invite_code_uses', {
  id: uuid('id').primaryKey().defaultRandom(),
  codeId: uuid('code_id')
    .notNull()
    .references(() => inviteCodes.id, { onDelete: 'restrict' }),
  /** 账号被删（GDPR）后置空，保留「该码被使用过」的事实但不留个人关联 */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  codeIdx: index('idx_invite_code_uses_code').on(table.codeId),
  // 一个账号只能消耗一个码
  userUq: uniqueIndex('uq_invite_code_uses_user').on(table.userId),
}));

export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
export type InviteCodeUse = typeof inviteCodeUses.$inferSelect;
export type NewInviteCodeUse = typeof inviteCodeUses.$inferInsert;
