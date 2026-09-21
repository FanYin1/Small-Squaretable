/**
 * meterUsage 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./usage.service', () => ({
  usageService: { trackUsage: vi.fn() },
}));

const { mockLoggerError, mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock('./logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: mockLoggerWarn,
      error: mockLoggerError,
    }),
  },
}));

import { meterUsage } from './usage-meter';
import { usageService } from './usage.service';

describe('meterUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usageService.trackUsage).mockResolvedValue({} as never);
  });

  it('records the usage and reports success', async () => {
    const recorded = await meterUsage('tenant-1', 'messages', 1, { transport: 'http' });

    expect(recorded).toBe(true);
    expect(usageService.trackUsage).toHaveBeenCalledWith('tenant-1', 'messages', 1, {
      transport: 'http',
    });
  });

  it('passes the amount through unchanged for token metering', async () => {
    await meterUsage('tenant-1', 'llm_tokens', 1234);

    expect(usageService.trackUsage).toHaveBeenCalledWith('tenant-1', 'llm_tokens', 1234, undefined);
  });

  // 计量失败不能反过来打断用户的请求：消息已经落库了，
  // 这时候抛出去只会让用户看到一个假的失败并重发。
  it('swallows repository failures instead of throwing', async () => {
    vi.mocked(usageService.trackUsage).mockRejectedValue(new Error('db down'));

    const recorded = await meterUsage('tenant-1', 'messages', 1);

    expect(recorded).toBe(false);
  });

  it('logs at error level when the usage write fails', async () => {
    vi.mocked(usageService.trackUsage).mockRejectedValue(new Error('db down'));

    await meterUsage('tenant-1', 'messages', 1);

    expect(mockLoggerError).toHaveBeenCalled();
    const [message] = mockLoggerError.mock.calls[0];
    expect(String(message)).toContain('usage');
  });

  // 没有 tenantId 就没法归属用量。静默返回会让计量缺口完全不可见，
  // 所以这里必须留下一条日志。
  it('skips the write when tenantId is missing, and warns', async () => {
    const recorded = await meterUsage('', 'messages', 1);

    expect(recorded).toBe(false);
    expect(usageService.trackUsage).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity])('skips non-positive or non-finite amount %s', async (amount) => {
    const recorded = await meterUsage('tenant-1', 'llm_tokens', amount as number);

    expect(recorded).toBe(false);
    expect(usageService.trackUsage).not.toHaveBeenCalled();
  });

  // 中断的流会走到 amount=0，这是正常路径，不该刷 warn 日志
  it('does not warn for a legitimately zero amount', async () => {
    await meterUsage('tenant-1', 'llm_tokens', 0);

    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });
});
