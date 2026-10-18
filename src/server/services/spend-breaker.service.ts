/**
 * 平台花费熔断（P0-7）
 *
 * 与套餐配额、用量计量完全无关的独立保险：按自然日累计「全平台」的 LLM token，
 * 超过 PLATFORM_DAILY_TOKEN_LIMIT 后拒绝新的生成请求，并通知运营者。
 * 在预付点数（P3-1）上线前，它是平台推理账单的最后一道闸。
 *
 * 语义约定：
 * 1. 检查只在请求开始前做（assertAllowed）。已经在流式输出的回复不会被中途切断，
 *    所以实际花费可能超出阈值最多「检查通过时仍在途的那批生成」的量。
 * 2. Redis 不可用时失败关闭：看不见花费就不放行。
 * 3. 累加失败（record）只记日志、绝不抛——回复已经生成并发给用户了，
 *    抛出去只会让用户看到假失败。代价是这一笔在计数里丢失，日志里可查。
 * 4. 阈值未配置：非 production 禁用（启动时 warn 一次）；production 由
 *    core/config.ts 在启动时拒绝（见 loadConfig）。
 */

import { config } from '../../core/config';
import { getRedisClient } from '../../core/redis';
import { AppError } from '../../core/errors';
import { logger } from './logger.service';
import { captureMessage } from './sentry.service';

const breakerLogger = logger.child({ module: 'spend-breaker' });

const COUNTER_KEY_PREFIX = 'spend-breaker:tokens:';
const NOTIFIED_KEY_PREFIX = 'spend-breaker:notified:';

/**
 * 计数与通知标记的过期时间：72h（要求 ≥ 48h）。
 * 按自然日分 key，过期只是回收空间；多留一天是为了时区配置或时钟漂移时
 * 不会在当天内提前丢计数。
 */
const KEY_TTL_SECONDS = 72 * 3600;

export const PLATFORM_SPEND_LIMIT_CODE = 'PLATFORM_SPEND_LIMIT';

export class SpendBreaker {
  private startupWarned = false;

  /** 是否启用：未配置阈值即禁用 */
  isEnabled(): boolean {
    return this.getLimit() !== undefined;
  }

  private getLimit(): number | undefined {
    const limit = config.platformDailyTokenLimit;
    return typeof limit === 'number' && limit > 0 ? limit : undefined;
  }

  /** 按 SPEND_BREAKER_TZ 取「当天」的日期串（YYYY-MM-DD） */
  private getDayString(now: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: config.spendBreakerTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  }

  /** 当天计数器的 Redis key */
  getDayKey(now: Date = new Date()): string {
    return `${COUNTER_KEY_PREFIX}${this.getDayString(now)}`;
  }

  private getNotifiedKey(now: Date): string {
    return `${NOTIFIED_KEY_PREFIX}${this.getDayString(now)}`;
  }

  /**
   * 发起新生成前调用。超阈值或 Redis 不可用时抛 AppError(503, PLATFORM_SPEND_LIMIT)。
   */
  async assertAllowed(): Promise<void> {
    const limit = this.getLimit();
    if (limit === undefined) return;

    let used: number;
    try {
      const client = await getRedisClient();
      const raw = await client.get(this.getDayKey());
      used = raw === null || raw === undefined ? 0 : Number(raw);
      if (!Number.isFinite(used)) {
        throw new Error(`Unexpected spend counter value: ${String(raw)}`);
      }
    } catch (error) {
      // 失败关闭：宁可暂时拒绝生成，也不在看不见花费时放行
      breakerLogger.error('Spend breaker check failed, rejecting new generation', error as Error);
      throw new AppError(
        'Chat is temporarily unavailable. Please try again in a few minutes.',
        503,
        PLATFORM_SPEND_LIMIT_CODE
      );
    }

    if (used >= limit) {
      throw new AppError(
        'The platform has reached its daily usage limit. Please try again tomorrow.',
        503,
        PLATFORM_SPEND_LIMIT_CODE
      );
    }
  }

  /**
   * 一次生成结束后累加实际 token。永不抛出。
   */
  async record(tokens: number): Promise<void> {
    const limit = this.getLimit();
    if (limit === undefined) return;
    if (!Number.isFinite(tokens) || tokens <= 0) return;

    try {
      const client = await getRedisClient();
      const now = new Date();
      const results = await client
        .multi()
        .incrBy(this.getDayKey(now), Math.ceil(tokens))
        .expire(this.getDayKey(now), KEY_TTL_SECONDS)
        .exec();
      const total = Number(results[0]);

      if (Number.isFinite(total) && total >= limit) {
        await this.notifyOnce(now, total, limit);
      }
    } catch (error) {
      breakerLogger.error('Failed to record platform spend', error as Error, { tokens });
    }
  }

  /**
   * 每天只通知一次：SET NX 抢到标记的那个请求负责发。
   * 不依赖「恰好是跨线那一笔」——并发下跨线的那笔可能不止一个，
   * 也可能跨线那笔的通知失败，NX 保证只发一次且不漏。
   */
  private async notifyOnce(now: Date, total: number, limit: number): Promise<void> {
    try {
      const client = await getRedisClient();
      const claimed = await client.set(this.getNotifiedKey(now), '1', {
        condition: 'NX',
        expiration: { type: 'EX', value: KEY_TTL_SECONDS },
      });
      if (claimed !== 'OK') return;

      const day = this.getDayString(now);
      breakerLogger.error('Platform daily token limit reached, new generations are now rejected', {
        day,
        total,
        limit,
        timezone: config.spendBreakerTz,
      });
      captureMessage(
        `Platform daily token limit reached (${total}/${limit}, day ${day} ${config.spendBreakerTz}); new generations are rejected until the next day`,
        'error'
      );
    } catch (error) {
      breakerLogger.error('Failed to send spend breaker notification', error as Error);
    }
  }

  /** 启动时调用一次：禁用状态给出 warn，启用状态给出配置摘要 */
  logStartupStatus(): void {
    if (this.isEnabled()) {
      breakerLogger.info('Platform spend breaker enabled', {
        dailyTokenLimit: this.getLimit(),
        timezone: config.spendBreakerTz,
      });
      return;
    }
    if (this.startupWarned) return;
    this.startupWarned = true;
    breakerLogger.warn(
      'Platform spend breaker is DISABLED: PLATFORM_DAILY_TOKEN_LIMIT is not set (required in production)'
    );
  }
}

export const spendBreaker = new SpendBreaker();
