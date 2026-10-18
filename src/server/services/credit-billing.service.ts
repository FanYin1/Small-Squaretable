/**
 * 预付点数计费（热路径，P3-1）
 *
 * 一次生成的生命周期：
 *
 *   reserve（预扣）  ->  生成  ->  settle（按实际用量结算）
 *                          \->  release（连接都没建立就失败，一个 token 没产生）
 *
 * 为什么先预扣：生成是流式、耗时几十秒的。如果只在结束后扣费，同一个租户同时发起
 * 的多个生成会各自看到「余额够」，结束后一起扣，余额变负。预扣把「检查余额」和
 * 「占住额度」放进同一个租户级串行区（事务咨询锁），后到的请求看到的是已经扣掉
 * 前面冻结之后的可用额度。
 *
 * 可用额度 = 账本合计 - 活动冻结合计。冻结不写账本，所以账本始终只记真正发生的扣费。
 *
 * 不变式：账本合计永不为负。
 *   - reserve 保证 冻结 <= 可用额度
 *   - settle 的扣费额被钳到 min(冻结额, 当前余额)，估算误差或迟到的结算都不会击穿余额
 *   - 冲正充值时同样检查可用额度（见 credit.service）
 * 钳制的代价由平台承担（用户少付了），钳制发生时在流水 metadata 里留 actualTokens。
 *
 * 冻结会过期：进程崩溃、连接被掐等没走到 settle / release 的路径，由清扫任务
 * （sweepExpired，挂在 scheduler 上）把过期冻结标成 expired，额度自动回到可用。
 * 这类生成没有被扣费（见 sweepExpired 的日志）。
 */

import { sql } from 'drizzle-orm';
import { AppError } from '../../core/errors';
import { config } from '../../core/config';
import { creditRepository } from '../../db/repositories/credit.repository';
import { logger } from './logger.service';
import { tokensToPoints } from './credit-units';

const creditLogger = logger.child({ module: 'credit-billing' });

/** 输入估算相对真实 tokenizer 的余量（估算偏低时多冻一点，减少钳制） */
export const INPUT_ESTIMATE_MARGIN = 1.2;
/** 请求没指定 max_tokens 时使用的输出上限，同时也是冻结额的一部分 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
/** 单次生成的输出上限天花板，避免请求带一个巨大的 max_tokens 把冻结额撑爆 */
export const HARD_MAX_OUTPUT_TOKENS = 16384;
/** 单次清扫最多处理多少条 */
const SWEEP_BATCH = 500;

export class InsufficientCreditsError extends AppError {
  constructor(details: { requiredTokens: number; availableTokens: number }) {
    super('Insufficient credits', 402, 'INSUFFICIENT_CREDITS', {
      ...details,
      requiredPoints: tokensToPoints(details.requiredTokens),
      availablePoints: tokensToPoints(Math.max(details.availableTokens, 0)),
    });
    this.name = 'InsufficientCreditsError';
  }
}

export interface CreditHold {
  id: string;
  tenantId: string;
  /** 冻结的 token 总数 */
  tokens: number;
  /** 本次生成允许的输出上限（调用方必须把它作为 max_tokens 传给 provider） */
  maxOutputTokens: number;
}

export interface ReserveInput {
  tenantId: string;
  chatId?: string | null;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  metadata?: Record<string, unknown>;
}

export interface SettleInput {
  inputTokens: number;
  outputTokens: number;
  chatId?: string | null;
  messageId?: number | null;
}

export interface SettleResult {
  /** 实际写入账本的扣费（token，正数） */
  chargedTokens: number;
  /** 用量本身超过了冻结额或余额，被钳制 */
  clamped: boolean;
}

function toNonNegativeInt(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

export const creditBilling = {
  /** 当前是否为预付点数模式 */
  isEnabled(): boolean {
    return config.billingMode === 'credits';
  },

  /**
   * 本次生成允许的输出上限。请求自带 max_tokens 就尊重它（但不超过天花板）；
   * 没带就用默认值。provider 不设上限时输出量不可控，预扣就失去意义，所以必须有。
   */
  resolveMaxOutputTokens(requested?: number | null): number {
    if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0) {
      return Math.min(Math.floor(requested), HARD_MAX_OUTPUT_TOKENS);
    }
    return DEFAULT_MAX_OUTPUT_TOKENS;
  },

  /** 冻结额 = 输入估算 x 余量 + 输出上限 */
  computeHoldTokens(estimatedInputTokens: number, maxOutputTokens: number): number {
    return Math.ceil(toNonNegativeInt(estimatedInputTokens) * INPUT_ESTIMATE_MARGIN) + maxOutputTokens;
  },

  /**
   * 轻量前置检查：可用额度是否 > 0。不占额度，只用来在做任何有副作用的事（比如保存
   * 用户消息）之前挡掉明显没余额的请求。真正的并发安全由 reserve 保证。
   */
  async assertHasCredits(tenantId: string): Promise<void> {
    const { available } = await creditRepository.getAvailability(tenantId);
    if (available <= 0) {
      throw new InsufficientCreditsError({ requiredTokens: 1, availableTokens: available });
    }
  },

  /**
   * 预扣。可用额度不足抛 InsufficientCreditsError（402）。
   * 检查和写冻结在同一个事务、同一把租户锁里，并发请求会排队，不会同时看到「够」。
   */
  async reserve(input: ReserveInput): Promise<CreditHold> {
    const tokens = this.computeHoldTokens(input.estimatedInputTokens, input.maxOutputTokens);

    const reservation = await creditRepository.withTransaction(async (tx) => {
      await creditRepository.lockTenant(input.tenantId, tx);

      const { available } = await creditRepository.getAvailability(input.tenantId, tx);
      if (available < tokens) {
        throw new InsufficientCreditsError({ requiredTokens: tokens, availableTokens: available });
      }

      return creditRepository.insertReservation(
        {
          tenantId: input.tenantId,
          tokens,
          chatId: input.chatId ?? null,
          // 用数据库时钟，和清扫任务里的 now() 同源，避免多实例时钟偏差
          expiresAt: sql`now() + make_interval(secs => ${config.creditReservationTtlSeconds})`,
          metadata: {
            ...(input.metadata ?? {}),
            estimatedInputTokens: input.estimatedInputTokens,
            maxOutputTokens: input.maxOutputTokens,
          },
        },
        tx,
      );
    });

    return {
      id: reservation.id,
      tenantId: reservation.tenantId,
      tokens: reservation.tokens,
      maxOutputTokens: input.maxOutputTokens,
    };
  },

  /**
   * 结算：把冻结换成一笔真实扣费。幂等（重复调用、与清扫赛跑都只生效一次）。
   *
   * 也接受已过期（expired）的冻结：生成比 TTL 还久时额度虽然已被清扫放回，
   * 但这次生成确实发生了，应当照常扣费；此时按当前余额钳制，保证账本不为负。
   * 已 released / settled 的冻结返回 null，不重复扣。
   */
  async settle(holdId: string, input: SettleInput): Promise<SettleResult | null> {
    const used = toNonNegativeInt(input.inputTokens) + toNonNegativeInt(input.outputTokens);

    return creditRepository.withTransaction(async (tx) => {
      const reservation = await creditRepository.findReservation(holdId, tx);
      if (!reservation) return null;

      await creditRepository.lockTenant(reservation.tenantId, tx);
      const wasExpired = reservation.status === 'expired';

      const { balance } = await creditRepository.getAvailability(reservation.tenantId, tx);
      const cap = Math.min(reservation.tokens, Math.max(balance, 0));
      const charged = Math.min(used, cap);

      const closed = await creditRepository.closeReservation(
        holdId,
        ['active', 'expired'],
        'settled',
        charged,
        tx,
      );
      if (!closed) return null;

      if (charged > 0) {
        await creditRepository.insertLedger(
          {
            tenantId: reservation.tenantId,
            kind: 'charge',
            amount: -charged,
            reservationId: holdId,
            chatId: input.chatId ?? reservation.chatId ?? null,
            messageId: input.messageId ?? null,
            metadata: {
              inputTokens: toNonNegativeInt(input.inputTokens),
              outputTokens: toNonNegativeInt(input.outputTokens),
              reservedTokens: reservation.tokens,
              ...(used > charged ? { actualTokens: used, clamped: true } : {}),
              ...(wasExpired ? { lateSettle: true } : {}),
            },
          },
          tx,
        );
      }

      if (used > charged) {
        creditLogger.warn('Credit charge clamped', {
          holdId,
          tenantId: reservation.tenantId,
          actualTokens: used,
          chargedTokens: charged,
          reservedTokens: reservation.tokens,
        });
      }

      return { chargedTokens: charged, clamped: used > charged };
    });
  },

  /**
   * 释放：生成根本没开始（连接 provider 失败、被拒绝）。不扣费，额度立即回到可用。
   * 只放开 active 的冻结；已结算 / 已过期的不动。幂等。
   */
  async release(holdId: string): Promise<boolean> {
    const closed = await creditRepository.closeReservation(holdId, ['active'], 'released', 0);
    return closed !== null;
  },

  /** 清扫过期冻结（挂在 scheduler 上）。返回清扫条数。 */
  async sweepExpired(): Promise<number> {
    const swept = await creditRepository.expireDue(SWEEP_BATCH);
    if (swept > 0) {
      // 走到这里说明有生成既没结算也没释放（进程崩溃、连接被掐等）：这些生成没被扣费
      creditLogger.warn('Expired unsettled credit reservations', { count: swept });
    }
    return swept;
  },
};
