/**
 * 点数管理服务（运营者充值 / 冲正 / 查询，P3-1）
 *
 * 热路径（预扣、结算）在 credit-billing.service.ts，这里只放低频的运营者与用户查询操作。
 *
 * 审计：充值与冲正都写 audit_logs（走 P0-6 同一条 auditService，fire-and-forget）。
 * 另外流水行自带 operator_id / created_at / amount / tenant_id，即使审计写入失败，
 * 「给谁、多少、何时、哪个运营者」在账本里也能还原。
 */

import { creditRepository } from '../../db/repositories/credit.repository';
import { userRepository } from '../../db/repositories/user.repository';
import type { CreditLedgerEntry } from '../../db/schema/credits';
import { AppError, NotFoundError, ValidationError } from '../../core/errors';
import { auditService } from './audit.service';
import { getTokensPerPoint, pointsToTokens, tokensToPoints } from './credit-units';
import type { CreditActivity, CreditLedgerFilters, CreditRange } from '../../types/credit-activity';

/** 单次充值上限（点），防止多打一个 0 */
export const MAX_TOPUP_POINTS = 100000;

export interface CreditActor {
  adminId: string;
  tenantId: string;
  actorIp?: string;
}

export interface TopUpInput {
  /** 二选一：账号 id 或邮箱 */
  userId?: string;
  email?: string;
  points: number;
  note?: string | null;
  /** 前端每次打开充值对话框生成一个，重复提交不会重复充值 */
  idempotencyKey: string;
}

export interface CreditSummary {
  unlimited?: boolean;
  tokensPerPoint: number;
  balanceTokens: number;
  heldTokens: number;
  availableTokens: number;
  balancePoints: number;
  availablePoints: number;
}

export interface TopUpResult {
  entry: CreditLedgerEntry;
  summary: CreditSummary;
  /** true = 幂等键已存在，返回的是第一次的结果，没有再次入账 */
  replayed: boolean;
}

export class CreditConflictError extends AppError {
  constructor(code: 'IDEMPOTENCY_CONFLICT' | 'CREDITS_ALREADY_SPENT' | 'ALREADY_REVERSED' | 'NOT_REVERSIBLE', message: string) {
    super(message, 409, code);
    this.name = 'CreditConflictError';
  }
}

function buildSummary(availability: { balance: number; held: number; available: number; unlimited?: boolean }): CreditSummary {
  const perPoint = getTokensPerPoint();
  return {
    ...(availability.unlimited === true ? { unlimited: true } : {}),
    tokensPerPoint: perPoint,
    balanceTokens: availability.balance,
    heldTokens: availability.held,
    availableTokens: availability.available,
    balancePoints: tokensToPoints(availability.balance, perPoint),
    availablePoints: tokensToPoints(Math.max(availability.available, 0), perPoint),
  };
}

async function resolveTargetUser(input: { userId?: string; email?: string }) {
  const user = input.userId
    ? await userRepository.findById(input.userId)
    : input.email
      ? await userRepository.findByEmail(input.email.trim().toLowerCase())
      : null;
  if (!user) throw new NotFoundError('User');
  return user;
}

export const creditService = {
  /** 某租户的余额概览 */
  async getSummary(tenantId: string): Promise<CreditSummary> {
    return buildSummary(await creditRepository.getAvailability(tenantId));
  },

  /** 运营者按账号查余额（后台充值页先查再充） */
  async lookupUser(input: { userId?: string; email?: string }) {
    const user = await resolveTargetUser(input);
    return {
      user: { id: user.id, email: user.email, tenantId: user.tenantId },
      summary: await this.getSummary(user.tenantId),
    };
  },

  /** 用户自己的流水（分页，新的在前） */
  listLedger(tenantId: string, params: { page: number; limit: number } & CreditLedgerFilters) {
    return creditRepository.listLedger(tenantId, params);
  },

  async getActivity(tenantId: string, range: CreditRange): Promise<CreditActivity> {
    const result = await creditRepository.getActivity(tenantId, range);
    return { ...range, spentPoints: tokensToPoints(result.spentTokens), creditedPoints: tokensToPoints(result.creditedTokens),
      adjustmentPoints: tokensToPoints(result.adjustmentTokens), chargeCount: result.chargeCount,
      knownUsageCount: result.knownUsageCount, unknownUsageCount: result.unknownUsageCount,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  },

  /** 运营者操作记录（充值 + 冲正），带账号邮箱 */
  listOperatorEntries(params: { page: number; limit: number }) {
    return creditRepository.listOperatorEntries(params);
  },

  /**
   * 运营者手动充值。点数 -> token 取整后入账；账本加一行 topup。
   * 幂等键已存在且内容一致 -> 返回第一次的结果（replayed: true）；内容不一致 -> 409。
   */
  async topUp(input: TopUpInput, actor: CreditActor): Promise<TopUpResult> {
    if (input.points > MAX_TOPUP_POINTS) {
      throw new ValidationError(`Top-up must not exceed ${MAX_TOPUP_POINTS} points`);
    }
    const tokens = pointsToTokens(input.points);
    if (tokens === null) {
      throw new ValidationError('Top-up amount must be a positive number of points');
    }

    const user = await resolveTargetUser(input);

    const { entry, replayed, availability } = await creditRepository.withTransaction(async (tx) => {
      await creditRepository.lockTenant(user.tenantId, tx);

      const existing = await creditRepository.findLedgerByIdempotencyKey(input.idempotencyKey, tx);
      if (existing) {
        if (existing.tenantId !== user.tenantId || existing.kind !== 'topup' || existing.amount !== tokens) {
          throw new CreditConflictError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used for a different top-up',
          );
        }
        return {
          entry: existing,
          replayed: true,
          availability: await creditRepository.getAvailability(user.tenantId, tx),
        };
      }

      const inserted = await creditRepository.insertLedger(
        {
          tenantId: user.tenantId,
          kind: 'topup',
          amount: tokens,
          idempotencyKey: input.idempotencyKey,
          operatorId: actor.adminId,
          note: input.note ?? null,
          metadata: { points: input.points, targetUserId: user.id },
        },
        tx,
      );
      return {
        entry: inserted,
        replayed: false,
        availability: await creditRepository.getAvailability(user.tenantId, tx),
      };
    });

    if (!replayed) {
      auditService.log({
        tenantId: actor.tenantId,
        actorId: actor.adminId,
        actorIp: actor.actorIp,
        action: 'credit_topup',
        targetType: 'credit_ledger',
        targetId: entry.id,
        metadata: {
          targetUserId: user.id,
          targetTenantId: user.tenantId,
          tokens,
          points: input.points,
          note: input.note ?? null,
        },
      });
    }

    return { entry, summary: buildSummary(availability), replayed };
  },

  /**
   * 冲正一笔充值（运营者录错了）。只允许冲正 topup，且每笔最多冲正一次。
   * 冲正额要从可用额度里扣得出来；用户已经花掉的部分不能倒扣（会把余额扣成负数），
   * 此时返回 409 CREDITS_ALREADY_SPENT，运营者需要线下处理。
   */
  async reverse(
    ledgerId: string,
    input: { note?: string | null },
    actor: CreditActor,
  ): Promise<TopUpResult> {
    const target = await creditRepository.findLedgerById(ledgerId);
    if (!target) throw new NotFoundError('Ledger entry');
    if (target.kind !== 'topup') {
      throw new CreditConflictError('NOT_REVERSIBLE', 'Only top-ups can be reversed');
    }

    const { entry, availability } = await creditRepository.withTransaction(async (tx) => {
      await creditRepository.lockTenant(target.tenantId, tx);

      if (await creditRepository.findReversalOf(ledgerId, tx)) {
        throw new CreditConflictError('ALREADY_REVERSED', 'This top-up was already reversed');
      }

      const current = await creditRepository.getAvailability(target.tenantId, tx);
      if (current.available < target.amount) {
        throw new CreditConflictError(
          'CREDITS_ALREADY_SPENT',
          'The credited points have already been spent or are reserved by running generations',
        );
      }

      const inserted = await creditRepository.insertLedger(
        {
          tenantId: target.tenantId,
          kind: 'reversal',
          amount: -target.amount,
          reversesId: target.id,
          operatorId: actor.adminId,
          note: input.note ?? null,
          metadata: { reversedKind: target.kind },
        },
        tx,
      );
      return { entry: inserted, availability: await creditRepository.getAvailability(target.tenantId, tx) };
    });

    auditService.log({
      tenantId: actor.tenantId,
      actorId: actor.adminId,
      actorIp: actor.actorIp,
      action: 'credit_reversal',
      targetType: 'credit_ledger',
      targetId: entry.id,
      metadata: {
        reversesId: target.id,
        targetTenantId: target.tenantId,
        tokens: target.amount,
        note: input.note ?? null,
      },
    });

    return { entry, summary: buildSummary(availability), replayed: false };
  },
};
