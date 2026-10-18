/**
 * 邀请码 Repository
 */

import { eq, and, or, isNull, gt, desc, sql } from 'drizzle-orm';
import { BaseRepository, type DbExecutor, type DbTransaction } from './base.repository';
import { db } from '../index';
import { users } from '../schema/users';
import {
  inviteCodes,
  inviteCodeUses,
  type InviteCode,
  type NewInviteCode,
} from '../schema/invite-codes';

export interface InviteCodeUseDetail {
  id: string;
  userId: string | null;
  userEmail: string | null;
  usedAt: Date;
}

export class InviteCodeRepository extends BaseRepository {
  /**
   * 在一个事务里执行 fn。fn 抛错则整体回滚。
   * 注册路径用它把「消费邀请码 + 建租户 + 建用户 + 记录使用」绑在一起。
   */
  async withTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /**
   * 原子消费一次邀请码。
   *
   * 所有有效性条件都在同一条 UPDATE 的 WHERE 里，由数据库一次判定：
   * 先 SELECT 校验再 UPDATE 自增，两个并发请求会同时读到 used_count=0 然后都通过。
   * 条件更新会在行上加锁，后到的请求等前一个事务结束后按最新值重新判断
   * （READ COMMITTED 下 UPDATE 的 EvalPlanQual 重检），单次码只会有一个拿到返回行。
   *
   * 注意：调用方必须传入事务，且事务要覆盖后续的建号——否则建号失败时
   * 码已经被扣掉了。
   *
   * @returns 命中返回码 id；不存在 / 已过期 / 已用尽 / 已禁用 一律返回 null
   */
  async consume(code: string, executor: DbExecutor = this.db): Promise<{ id: string } | null> {
    const rows = await executor
      .update(inviteCodes)
      .set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
      .where(
        and(
          eq(inviteCodes.code, code),
          sql`${inviteCodes.usedCount} < ${inviteCodes.maxUses}`,
          or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, sql`now()`)),
          eq(inviteCodes.disabled, false),
        ),
      )
      .returning({ id: inviteCodes.id });

    return rows[0] ?? null;
  }

  /** 记录谁用了哪个码。与建号同一事务。 */
  async recordUse(
    data: { codeId: string; userId: string },
    executor: DbExecutor = this.db,
  ): Promise<void> {
    await executor.insert(inviteCodeUses).values(data);
  }

  async createMany(rows: NewInviteCode[]): Promise<InviteCode[]> {
    if (rows.length === 0) return [];
    return this.db.insert(inviteCodes).values(rows).returning();
  }

  async list(params: { page: number; limit: number }): Promise<{ items: InviteCode[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const [items, [{ count }]] = await Promise.all([
      this.db
        .select()
        .from(inviteCodes)
        .orderBy(desc(inviteCodes.createdAt))
        .limit(params.limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(inviteCodes),
    ]);
    return { items, total: Number(count) };
  }

  /** 停用一个码。已注册的账号不受影响，只是不能再被新注册使用。 */
  async disable(id: string): Promise<InviteCode | null> {
    const rows = await this.db
      .update(inviteCodes)
      .set({ disabled: true })
      .where(eq(inviteCodes.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<InviteCode | null> {
    const rows = await this.db.select().from(inviteCodes).where(eq(inviteCodes.id, id));
    return rows[0] ?? null;
  }

  /** 某个码被谁用过（追溯「这个人是谁邀请的」的反向查询） */
  async findUses(codeId: string): Promise<InviteCodeUseDetail[]> {
    return this.db
      .select({
        id: inviteCodeUses.id,
        userId: inviteCodeUses.userId,
        userEmail: users.email,
        usedAt: inviteCodeUses.usedAt,
      })
      .from(inviteCodeUses)
      .leftJoin(users, eq(users.id, inviteCodeUses.userId))
      .where(eq(inviteCodeUses.codeId, codeId))
      .orderBy(desc(inviteCodeUses.usedAt));
  }
}

export const inviteCodeRepository = new InviteCodeRepository(db);
