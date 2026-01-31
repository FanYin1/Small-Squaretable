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
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long';

    const { loadConfig } = await import('@/core/config');
    const config = loadConfig();

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
  });
});
