/**
 * 预付点数账本 Schema（backlog P3-1）
 *
 * 两张表，职责严格分开：
 *
 * - credit_ledger：追加式流水，**是余额的唯一真相**。余额 = SUM(amount)，
 *   没有可改写的余额字段。充值、扣费、冲正都是新增一行，从不 UPDATE / DELETE。
 *   （迁移里另有一个触发器拒绝 UPDATE，作为第二道防线；drizzle-kit push 不会建触发器。）
 * - credit_reservations：生成前的预扣冻结。冻结不是余额，只是"这笔额度先别动"，
 *   可用余额 = SUM(ledger) - SUM(活动冻结)。状态会变，但丢了它只会让额度早一点释放，
 *   不会让账出错。
 *
 * 计量单位是 token 的整数，展示时才按 CREDIT_TOKENS_PER_POINT 换算成点数，
 * 所以账本里没有小数。
 *
 * 计费主体是 tenant，与 usage 表一致（usage-meter 按 tenantId 计量）。
 * 目前注册会为每个账号各建一个 tenant，所以一个用户 = 一个计费主体。
 */

import {
  pgTable,
  uuid,
  varchar,
  bigint,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { users } from './users';

export const CREDIT_LEDGER_KINDS = ['topup', 'charge', 'reversal'] as const;
export type CreditLedgerKind = (typeof CREDIT_LEDGER_KINDS)[number];

export const CREDIT_RESERVATION_STATUSES = ['active', 'settled', 'released', 'expired'] as const;
export type CreditReservationStatus = (typeof CREDIT_RESERVATION_STATUSES)[number];

export const creditLedger = pgTable('credit_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 16 }).notNull().$type<CreditLedgerKind>(),
  /** 带符号的 token 数：充值为正，扣费为负，冲正与被冲正的那行符号相反 */
  amount: bigint('amount', { mode: 'number' }).notNull(),
  /** 扣费对应的预扣记录。唯一：一次预扣最多结算成一笔扣费 */
  reservationId: uuid('reservation_id'),
  /** 冲正指向被冲正的流水。唯一：一笔充值最多被冲正一次 */
  reversesId: uuid('reverses_id').references((): AnyPgColumn => creditLedger.id),
  /** 运营者操作的幂等键（前端每次打开充值对话框生成一个），防止重复提交重复充值 */
  idempotencyKey: varchar('idempotency_key', { length: 64 }),
  /** 追溯用，不设外键：聊天或消息被删除后，账仍要留着 */
  chatId: uuid('chat_id'),
  messageId: bigint('message_id', { mode: 'number' }),
  /** 充值/冲正的运营者。账号被删后置空，审计日志里仍有记录 */
  operatorId: uuid('operator_id').references(() => users.id, { onDelete: 'set null' }),
  note: varchar('note', { length: 200 }),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tenantCreatedIdx: index('idx_credit_ledger_tenant_created').on(table.tenantId, table.createdAt),
  reservationUq: uniqueIndex('uq_credit_ledger_reservation')
    .on(table.reservationId)
    .where(sql`${table.reservationId} IS NOT NULL`),
  reversesUq: uniqueIndex('uq_credit_ledger_reverses')
    .on(table.reversesId)
    .where(sql`${table.reversesId} IS NOT NULL`),
  idempotencyUq: uniqueIndex('uq_credit_ledger_idempotency')
    .on(table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
  kindCheck: check('chk_credit_ledger_kind', sql`${table.kind} IN ('topup', 'charge', 'reversal')`),
  // 符号与类型必须匹配：充值只能加，扣费只能减，冲正必须指向某一行且不为 0
  amountSignCheck: check(
    'chk_credit_ledger_amount_sign',
    sql`(${table.kind} = 'topup' AND ${table.amount} > 0)
      OR (${table.kind} = 'charge' AND ${table.amount} < 0)
      OR (${table.kind} = 'reversal' AND ${table.amount} <> 0)`,
  ),
  reversalLinkCheck: check(
    'chk_credit_ledger_reversal_link',
    sql`(${table.kind} = 'reversal') = (${table.reversesId} IS NOT NULL)`,
  ),
}));

export const creditReservations = pgTable('credit_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  /** 冻结的 token 数 = 输入估算 x 余量 + 输出上限 */
  tokens: bigint('tokens', { mode: 'number' }).notNull(),
  status: varchar('status', { length: 12 })
    .notNull()
    .default('active')
    .$type<CreditReservationStatus>(),
  chatId: uuid('chat_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** 结算 / 释放 / 过期清扫的时间 */
  closedAt: timestamp('closed_at', { withTimezone: true }),
  /** 最终扣了多少（结算后写入，便于核对"冻结了多少、实扣了多少"） */
  chargedTokens: integer('charged_tokens'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  activeTenantIdx: index('idx_credit_reservations_active_tenant')
    .on(table.tenantId)
    .where(sql`${table.status} = 'active'`),
  activeExpiryIdx: index('idx_credit_reservations_active_expiry')
    .on(table.expiresAt)
    .where(sql`${table.status} = 'active'`),
  tokensPositive: check('chk_credit_reservations_tokens', sql`${table.tokens} > 0`),
  statusCheck: check(
    'chk_credit_reservations_status',
    sql`${table.status} IN ('active', 'settled', 'released', 'expired')`,
  ),
}));

export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert;
export type CreditReservation = typeof creditReservations.$inferSelect;
export type NewCreditReservation = typeof creditReservations.$inferInsert;
