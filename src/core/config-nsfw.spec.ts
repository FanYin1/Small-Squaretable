/**
 * NSFW_ENABLED 平台开关的解析（P2-6）
 *
 * 默认开启。不能用 z.coerce.boolean()：它把任何非空字符串（包括 'false'）都转成 true，
 * 运营者写 NSFW_ENABLED=false 反而会开启。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('NSFW_ENABLED', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long';
    process.env.NODE_ENV = 'development';
    delete process.env.NSFW_ENABLED;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function load() {
    const { loadConfig } = await import('@/core/config');
    return loadConfig();
  }

  it('未设置时默认开启', async () => {
    expect((await load()).nsfwEnabled).toBe(true);
  });

  it('空字符串视为未设置，默认开启', async () => {
    process.env.NSFW_ENABLED = '';
    expect((await load()).nsfwEnabled).toBe(true);
  });

  it.each(['true', 'TRUE', '1', 'yes', 'on'])('%s -> 开启', async (value) => {
    process.env.NSFW_ENABLED = value;
    expect((await load()).nsfwEnabled).toBe(true);
  });

  it.each(['false', 'FALSE', ' false ', '0', 'no', 'off'])('%s -> 关闭', async (value) => {
    process.env.NSFW_ENABLED = value;
    expect((await load()).nsfwEnabled).toBe(false);
  });
});
