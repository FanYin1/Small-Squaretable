/**
 * 平台花费熔断（P0-7）测试
 *
 * 全部用 mock，不依赖真实 Redis。重点是三条验收：
 * 1. 超阈值拒绝新生成
 * 2. 计数按自然日（时区可配）
 * 3. Redis 不可用时失败关闭；但累加失败只记日志、不抛
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  nodeEnv: 'production' as string,
  platformDailyTokenLimit: 1000 as number | undefined,
  spendBreakerTz: 'Asia/Shanghai',
}));

vi.mock('../../core/config', () => ({ config: mockConfig }));

const redisClient = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  multi: vi.fn(),
}));
const getRedisClient = vi.hoisted(() => vi.fn());
vi.mock('../../core/redis', () => ({ getRedisClient }));

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('./logger.service', () => ({
  logger: { child: () => loggerMock },
}));

const captureMessage = vi.hoisted(() => vi.fn());
vi.mock('./sentry.service', () => ({ captureMessage }));

import { AppError } from '../../core/errors';
import { SpendBreaker } from './spend-breaker.service';

/** 构造 multi().incrBy().expire().exec() 链，exec 返回 [newTotal, 1] */
function mockMulti(newTotal: number) {
  const chain = {
    incrBy: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([newTotal, 1]),
  };
  redisClient.multi.mockReturnValue(chain);
  return chain;
}

describe('SpendBreaker', () => {
  let breaker: SpendBreaker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.nodeEnv = 'production';
    mockConfig.platformDailyTokenLimit = 1000;
    mockConfig.spendBreakerTz = 'Asia/Shanghai';
    getRedisClient.mockResolvedValue(redisClient);
    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockResolvedValue('OK');
    mockMulti(10);
    breaker = new SpendBreaker();
  });

  describe('getDayKey', () => {
    it('uses the calendar day in the configured timezone', () => {
      // UTC 17:30 = 上海次日 01:30
      const instant = new Date('2026-10-17T17:30:00Z');
      expect(breaker.getDayKey(instant)).toBe('spend-breaker:tokens:2026-10-18');
    });

    it('follows SPEND_BREAKER_TZ', () => {
      mockConfig.spendBreakerTz = 'UTC';
      const instant = new Date('2026-10-17T17:30:00Z');
      expect(breaker.getDayKey(instant)).toBe('spend-breaker:tokens:2026-10-17');
    });

    it('rolls over at local midnight, not UTC midnight', () => {
      // 上海 23:59 与 00:01 跨日
      expect(breaker.getDayKey(new Date('2026-10-17T15:59:00Z'))).toBe('spend-breaker:tokens:2026-10-17');
      expect(breaker.getDayKey(new Date('2026-10-17T16:01:00Z'))).toBe('spend-breaker:tokens:2026-10-18');
    });
  });

  describe('assertAllowed', () => {
    it('allows when today total is under the limit', async () => {
      redisClient.get.mockResolvedValue('999');
      await expect(breaker.assertAllowed()).resolves.toBeUndefined();
    });

    it('allows when nothing has been spent yet today', async () => {
      redisClient.get.mockResolvedValue(null);
      await expect(breaker.assertAllowed()).resolves.toBeUndefined();
    });

    it('rejects with a readable PLATFORM_SPEND_LIMIT error at the limit', async () => {
      redisClient.get.mockResolvedValue('1000');
      const error = await breaker.assertAllowed().catch((e) => e);

      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('PLATFORM_SPEND_LIMIT');
      expect(error.statusCode).toBe(503);
      expect(error.message).toMatch(/daily usage limit/i);
    });

    it('rejects when the total is over the limit', async () => {
      redisClient.get.mockResolvedValue('5000');
      await expect(breaker.assertAllowed()).rejects.toMatchObject({ code: 'PLATFORM_SPEND_LIMIT' });
    });

    it('reads the counter for today\'s key', async () => {
      await breaker.assertAllowed();
      expect(redisClient.get).toHaveBeenCalledWith(breaker.getDayKey(new Date()));
    });

    it('allows the retained daily usage under the operator-approved 10M limit', async () => {
      mockConfig.platformDailyTokenLimit = 10000000;
      redisClient.get.mockResolvedValue('120038');
      await expect(breaker.assertAllowed()).resolves.toBeUndefined();
      expect(redisClient.set).not.toHaveBeenCalled();
      expect(redisClient.multi).not.toHaveBeenCalled();
    });

    // 失败关闭：宁可拒绝，也不在看不见花费的时候放行
    it('fails closed when redis throws', async () => {
      redisClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const error = await breaker.assertAllowed().catch((e) => e);

      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('PLATFORM_SPEND_UNAVAILABLE');
      expect(error.statusCode).toBe(503);
      expect(error.message).toMatch(/temporarily unavailable/i);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('fails closed when the redis client cannot be created', async () => {
      getRedisClient.mockRejectedValue(new Error('connect failed'));
      await expect(breaker.assertAllowed()).rejects.toMatchObject({ code: 'PLATFORM_SPEND_UNAVAILABLE' });
    });

    it('fails closed when the stored value is not a number', async () => {
      redisClient.get.mockResolvedValue('garbage');
      await expect(breaker.assertAllowed()).rejects.toMatchObject({ code: 'PLATFORM_SPEND_UNAVAILABLE' });
    });

    it('is a no-op when no limit is configured (non-production)', async () => {
      mockConfig.nodeEnv = 'development';
      mockConfig.platformDailyTokenLimit = undefined;

      await expect(breaker.assertAllowed()).resolves.toBeUndefined();
      expect(getRedisClient).not.toHaveBeenCalled();
    });
  });

  describe('record', () => {
    it('adds tokens to today\'s counter with a >= 48h expiry', async () => {
      const chain = mockMulti(10);
      await breaker.record(250);

      expect(chain.incrBy).toHaveBeenCalledWith(breaker.getDayKey(new Date()), 250);
      const [, ttl] = chain.expire.mock.calls[0];
      expect(ttl).toBeGreaterThanOrEqual(48 * 3600);
    });

    it('does not throw when redis fails — the reply is already out', async () => {
      getRedisClient.mockRejectedValue(new Error('redis down'));
      await expect(breaker.record(100)).resolves.toBeUndefined();
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('does not throw when exec fails', async () => {
      const chain = mockMulti(0);
      chain.exec.mockRejectedValue(new Error('EXEC aborted'));
      await expect(breaker.record(100)).resolves.toBeUndefined();
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('ignores non-positive and non-finite amounts', async () => {
      await breaker.record(0);
      await breaker.record(-5);
      await breaker.record(Number.NaN);
      expect(redisClient.multi).not.toHaveBeenCalled();
    });

    it('is a no-op when no limit is configured', async () => {
      mockConfig.nodeEnv = 'development';
      mockConfig.platformDailyTokenLimit = undefined;
      await breaker.record(100);
      expect(getRedisClient).not.toHaveBeenCalled();
    });

    describe('operator notification', () => {
      it('does not notify while under the limit', async () => {
        mockMulti(999);
        await breaker.record(10);

        expect(redisClient.set).not.toHaveBeenCalled();
        expect(captureMessage).not.toHaveBeenCalled();
      });

      it('notifies via error log and Sentry when the limit is first crossed', async () => {
        mockMulti(1005);
        await breaker.record(100);

        expect(redisClient.set).toHaveBeenCalledWith(
          expect.stringContaining('notified'),
          '1',
          expect.objectContaining({ condition: 'NX' })
        );
        expect(loggerMock.error).toHaveBeenCalled();
        expect(captureMessage).toHaveBeenCalledTimes(1);
        expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining('daily'), 'error');
      });

      // SET NX 返回 null 说明今天已经有人通知过了
      it('notifies only once per day', async () => {
        mockMulti(1200);
        redisClient.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

        await breaker.record(100);
        await breaker.record(100);

        expect(redisClient.set).toHaveBeenCalledTimes(2);
        expect(captureMessage).toHaveBeenCalledTimes(1);
      });

      it('keys the notification flag by day', async () => {
        mockMulti(1200);
        await breaker.record(100);
        const key = redisClient.set.mock.calls[0][0] as string;
        expect(key).toContain(breaker.getDayKey(new Date()).split(':').pop());
      });

      it('does not throw when the notification itself fails', async () => {
        mockMulti(1200);
        redisClient.set.mockRejectedValue(new Error('redis down'));
        await expect(breaker.record(100)).resolves.toBeUndefined();
      });
    });
  });

  describe('startup status', () => {
    it('warns once when disabled outside production', () => {
      mockConfig.nodeEnv = 'development';
      mockConfig.platformDailyTokenLimit = undefined;

      breaker.logStartupStatus();
      breaker.logStartupStatus();

      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    });

    it('does not warn when a limit is configured', () => {
      breaker.logStartupStatus();
      expect(loggerMock.warn).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalled();
    });
  });
});
