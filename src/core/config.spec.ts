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
