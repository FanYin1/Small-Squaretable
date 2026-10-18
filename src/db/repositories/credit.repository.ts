/**
 * 预付点数 Repository（P3-1）
 *
 * 只放数据访问原语，不含业务规则。并发正确性依赖的那几条语句（余额与冻结的合计、
 * 预扣的状态翻转）集中在这里，写成单条 SQL，由 service 在事务 + 租户级咨询锁内调用。
 *
 * 账本 credit_ledger 只有 INSERT 和 SELECT；这里没有任何 UPDATE / DELETE 账本的方法。
 */

import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { BaseRepository, type DbExecutor, type DbTransaction } from './base.repository';
import { db } from '../index';
import {
  creditLedger,
  creditReservations,
  type CreditLedgerEntry,
  type CreditReservation,
  type CreditReservationStatus,
  type NewCreditLedgerEntry,
  type NewCreditReservation,
} from '../schema/credits';

export interface CreditAvailability {
  /** 账本合计（token） */
  balance: number;
  /** 活动冻结合计（token） */
  held: number;
  /** balance - held，可能为负时按 0 处理由调用方决定；这里原样返回 */
  available: number;
}

export interface CreditLedgerRow extends CreditLedgerEntry {
  /** 该租户下最早注册的账号邮箱（运营者对账用） */
  tenantEmail: string | null;
  operatorEmail: string | null;
}

export class CreditRepository extends BaseRepository {
  async withTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /**
   * 租户级事务咨询锁。同一租户上的「检查可用额度 + 写冻结」「结算」「冲正」都先拿它，
   * 串行化后才能保证并发生成不会把余额扣成负数。事务结束自动释放。
   *
   * 用 hashtextextended(…, 0) 得到 bigint 键，不同租户几乎不会撞锁；
   * 即使撞了也只是多等一会儿，不影响正确性。
   */
  async lockTenant(tenantId: string, executor: DbExecutor): Promise<void> {
    await executor.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`credit:${tenantId}`}, 0))`,
    );
  }

  /** 余额与活动冻结在同一条语句里取，保证看到的是同一个快照。 */
  async getAvailability(tenantId: string, executor: DbExecutor = this.db): Promise<CreditAvailability> {
    const rows = (await executor.execute(sql`
      SELECT
        COALESCE((SELECT SUM(amount) FROM credit_ledger WHERE tenant_id = ${tenantId}), 0)::bigint AS balance,
        COALESCE((SELECT SUM(tokens) FROM credit_reservations
                  WHERE tenant_id = ${tenantId} AND status = 'active'), 0)::bigint AS held
    `)) as unknown as Array<{ balance: string | number; held: string | number }>;

    const balance = Number(rows[0]?.balance ?? 0);
    const held = Number(rows[0]?.held ?? 0);
    return { balance, held, available: balance - held };
  }

  async insertReservation(
    // expiresAt 允许传 SQL 表达式：过期时间用数据库时钟算（now() + ttl），和清扫任务同源
    data: Omit<NewCreditReservation, 'expiresAt'> & { expiresAt: Date | SQL },
    executor: DbExecutor = this.db,
  ): Promise<CreditReservation> {
    const rows = await executor.insert(creditReservations).values(data).returning();
    return rows[0];
  }

  async findReservation(id: string, executor: DbExecutor = this.db): Promise<CreditReservation | null> {
    const rows = await executor.select().from(creditReservations).where(eq(creditReservations.id, id));
    return rows[0] ?? null;
  }

  /**
   * 关闭一笔冻结（结算 / 释放）。状态翻转写成条件 UPDATE ... RETURNING：
   * 只有当前状态在 from 里才会命中，所以重复结算、结算与清扫赛跑都最多生效一次。
   * 未命中返回 null。
   */
  async closeReservation(
    id: string,
    from: CreditReservationStatus[],
    to: CreditReservationStatus,
    chargedTokens: number | null,
    executor: DbExecutor = this.db,
  ): Promise<CreditReservation | null> {
    const rows = await executor
      .update(creditReservations)
      .set({ status: to, closedAt: sql`now()`, chargedTokens })
      .where(and(eq(creditReservations.id, id), inArray(creditReservations.status, from)))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * 清扫过期未关闭的冻结，返回清扫条数。
   * SKIP LOCKED：多实例同时清扫时互不阻塞，也不会重复处理同一行。
   */
  async expireDue(limit: number, executor: DbExecutor = this.db): Promise<number> {
    const rows = (await executor.execute(sql`
      UPDATE credit_reservations
      SET status = 'expired', closed_at = now()
      WHERE id IN (
        SELECT id FROM credit_reservations
        WHERE status = 'active' AND expires_at <= now()
        ORDER BY expires_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
    return rows.length;
  }

  /** 追加一行流水。账本唯一的写入口。 */
  async insertLedger(data: NewCreditLedgerEntry, executor: DbExecutor = this.db): Promise<CreditLedgerEntry> {
    const rows = await executor.insert(creditLedger).values(data).returning();
    return rows[0];
  }

  async findLedgerById(id: string, executor: DbExecutor = this.db): Promise<CreditLedgerEntry | null> {
    const rows = await executor.select().from(creditLedger).where(eq(creditLedger.id, id));
    return rows[0] ?? null;
  }

  async findLedgerByIdempotencyKey(
    key: string,
    executor: DbExecutor = this.db,
  ): Promise<CreditLedgerEntry | null> {
    const rows = await executor
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.idempotencyKey, key));
    return rows[0] ?? null;
  }

  async findReversalOf(ledgerId: string, executor: DbExecutor = this.db): Promise<CreditLedgerEntry | null> {
    const rows = await executor
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.reversesId, ledgerId));
    return rows[0] ?? null;
  }

  /** 某租户的流水，新的在前。 */
  async listLedger(
    tenantId: string,
    params: { page: number; limit: number },
  ): Promise<{ items: CreditLedgerEntry[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const [items, [{ count }]] = await Promise.all([
      this.db
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.tenantId, tenantId))
        .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
        .limit(params.limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(creditLedger)
        .where(eq(creditLedger.tenantId, tenantId)),
    ]);
    return { items, total: Number(count) };
  }

  /**
   * 运营者操作（充值 / 冲正）的全局列表，带账号邮箱，给后台对账页用。
   * 扣费流水量大且对运营者没有对账价值，不在这里列。
   */
  async listOperatorEntries(params: {
    page: number;
    limit: number;
  }): Promise<{ items: CreditLedgerRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = (await this.db.execute(sql`
      SELECT
        l.id, l.tenant_id AS "tenantId", l.kind, l.amount, l.reservation_id AS "reservationId",
        l.reverses_id AS "reversesId", l.idempotency_key AS "idempotencyKey",
        l.chat_id AS "chatId", l.message_id AS "messageId", l.operator_id AS "operatorId",
        l.note, l.metadata, l.created_at AS "createdAt",
        (SELECT u.email FROM users u WHERE u.tenant_id = l.tenant_id ORDER BY u.created_at LIMIT 1) AS "tenantEmail",
        (SELECT o.email FROM users o WHERE o.id = l.operator_id) AS "operatorEmail"
      FROM credit_ledger l
      WHERE l.kind IN ('topup', 'reversal')
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ${params.limit} OFFSET ${offset}
    `)) as unknown as CreditLedgerRow[];

    const countRows = (await this.db.execute(sql`
      SELECT count(*)::int AS count FROM credit_ledger WHERE kind IN ('topup', 'reversal')
    `)) as unknown as Array<{ count: number }>;

    return { items: rows, total: Number(countRows[0]?.count ?? 0) };
  }
}

export const creditRepository = new CreditRepository(db);
