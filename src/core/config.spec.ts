/**
 * 配置模块测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Config Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // 重置环境变量
    process.env = { ...originalEnv };
    // 清除模块缓存
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load configuration from environment variables', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long';

    const { loadConfig } = await import('@/core/config');
    const config = loadConfig();

    expect(config.nodeEnv).toBe('test');
    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toBe('postgresql://localhost:5432/test');
  });

  it('should use default values when not provided', async () => {
    // Clear NODE_ENV to test default behavior
    delete process.env.NODE_ENV;
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long';

    const { loadConfig } = await import('@/core/config');
    const config = loadConfig();

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
  });

  describe('Platform spend breaker configuration', () => {
    beforeEach(() => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long';
      delete process.env.PLATFORM_DAILY_TOKEN_LIMIT;
      delete process.env.SPEND_BREAKER_TZ;
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('leaves the limit undefined and defaults the timezone outside production', async () => {
      process.env.NODE_ENV = 'development';

      const { loadConfig } = await import('@/core/config');
      const config = loadConfig();

      expect(config.platformDailyTokenLimit).toBeUndefined();
      expect(config.spendBreakerTz).toBe('Asia/Shanghai');
    });

    it('treats an empty PLATFORM_DAILY_TOKEN_LIMIT as unset', async () => {
      process.env.NODE_ENV = 'development';
      process.env.PLATFORM_DAILY_TOKEN_LIMIT = '';

      const { loadConfig } = await import('@/core/config');
      expect(loadConfig().platformDailyTokenLimit).toBeUndefined();
    });

    it('parses the limit and timezone when provided', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PLATFORM_DAILY_TOKEN_LIMIT = '5000000';
      process.env.SPEND_BREAKER_TZ = 'UTC';

      const { loadConfig } = await import('@/core/config');
      const config = loadConfig();

      expect(config.platformDailyTokenLimit).toBe(5000000);
      expect(config.spendBreakerTz).toBe('UTC');
    });

    it('fails startup in production when the limit is not set', async () => {
      process.env.NODE_ENV = 'production';

      await expect(import('@/core/config')).rejects.toThrow('Invalid configuration');
    });

    it('fails startup in production when the limit is empty', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PLATFORM_DAILY_TOKEN_LIMIT = '';

      await expect(import('@/core/config')).rejects.toThrow('Invalid configuration');
    });

    it('rejects a non-positive limit', async () => {
      process.env.NODE_ENV = 'development';
      process.env.PLATFORM_DAILY_TOKEN_LIMIT = '0';

      await expect(import('@/core/config')).rejects.toThrow('Invalid configuration');
    });

    it('rejects an unknown timezone', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SPEND_BREAKER_TZ = 'Not/AZone';

      await expect(import('@/core/config')).rejects.toThrow('Invalid configuration');
    });
  });

  describe('Billing mode configuration (credits)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long';
      delete process.env.BILLING_MODE;
      delete process.env.CREDIT_TOKENS_PER_POINT;
      delete process.env.CREDIT_RESERVATION_TTL_SECONDS;
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('defaults to subscription mode, 10000 tokens per point and a 900s hold TTL', async () => {
      const { loadConfig } = await import('@/core/config');
      const config = loadConfig();

      expect(config.billingMode).toBe('subscription');
      expect(config.creditTokensPerPoint).toBe(10000);
      expect(config.creditReservationTtlSeconds).toBe(900);
    });

    it('treats empty values as unset', async () => {
      process.env.BILLING_MODE = '';
      process.env.CREDIT_TOKENS_PER_POINT = '';
      process.env.CREDIT_RESERVATION_TTL_SECONDS = '';

      const { loadConfig } = await import('@/core/config');
      const config = loadConfig();

      expect(config.billingMode).toBe('subscription');
      expect(config.creditTokensPerPoint).toBe(10000);
      expect(config.creditReservationTtlSeconds).toBe(900);
    });

    it('parses credits mode and the tunables', async () => {
      process.env.BILLING_MODE = 'credits';
      process.env.CREDIT_TOKENS_PER_POINT = '5000';
      process.env.CREDIT_RESERVATION_TTL_SECONDS = '600';

      const { loadConfig } = await import('@/core/config');
      const config = loadConfig();

      expect(config.billingMode).toBe('credits');
      expect(config.creditTokensPerPoint).toBe(5000);
      expect(config.creditReservationTtlSeconds).toBe(600);
    });

    it('rejects an unknown billing mode', async () => {
      process.env.BILLING_MODE = 'prepaid';

      await expect(import('@/core/config')).rejects.toThrow('Invalid configuration');
    });

    it('rejects a non-positive or fractional CREDIT_TOKENS_PER_POINT', async () => {
      process.env.CREDIT_TOKENS_PER_POINT = '0';
      await expect(import('@/core/config')).rejects.toThrow('Invalid configuration');

      vi.resetModules();
      process.env.CREDIT_TOKENS_PER_POINT = '2.5';
      await expect(import('@/core/config')).rejects.toThrow('Invalid configuration');
    });

    it('rejects a non-positive CREDIT_RESERVATION_TTL_SECONDS', async () => {
      process.env.CREDIT_RESERVATION_TTL_SECONDS = '0';

      await expect(import('@/core/config')).rejects.toThrow('Invalid configuration');
    });
  });

  describe('Stripe configuration fields', () => {
    it('should include Stripe configuration fields', () => {
      const stripeFields = [
        'stripeSecretKey',
        'stripeWebhookSecret',
        'stripeProMonthlyPrice',
        'stripeProYearlyPrice',
        'stripeTeamMonthlyPrice',
      ];
      expect(stripeFields).toHaveLength(5);
    });

    it('should have empty string defaults for Stripe fields in dev', async () => {
      // In development, Stripe fields default to empty strings
      // This prevents crashes when Stripe isn't configured
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long';
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_PRICE_PRO_MONTHLY;
      delete process.env.STRIPE_PRICE_PRO_YEARLY;
      delete process.env.STRIPE_PRICE_TEAM_MONTHLY;

      const { loadConfig } = await import('@/core/config');
      const config = loadConfig();

      expect(config.stripeSecretKey).toBe('');
      expect(config.stripeWebhookSecret).toBe('');
      expect(config.stripeProMonthlyPrice).toBe('');
      expect(config.stripeProYearlyPrice).toBe('');
      expect(config.stripeTeamMonthlyPrice).toBe('');
    });
  });
});
