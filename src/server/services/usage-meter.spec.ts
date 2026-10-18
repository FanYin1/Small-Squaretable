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

const { mockSpendRecord } = vi.hoisted(() => ({ mockSpendRecord: vi.fn() }));
vi.mock('./spend-breaker.service', () => ({ spendBreaker: { record: mockSpendRecord } }));

import {
  meterUsage,
  resolveLlmTokens,
  meterLlmTokens,
  readOpenAiUsage,
  readOllamaUsage,
  estimateInjectedTokens,
} from './usage-meter';
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

// P0-1：计费口径 = 输入 + 输出（此前 WebSocket 通道只算输出）
describe('resolveLlmTokens', () => {
  it('counts the prompt as well as the output when estimating', () => {
    const outputOnly = resolveLlmTokens({ estimatedPromptTokens: 0, outputText: 'Hello there, how are you?' });
    const withPrompt = resolveLlmTokens({ estimatedPromptTokens: 3000, outputText: 'Hello there, how are you?' });

    expect(withPrompt.promptTokens).toBe(3000);
    expect(withPrompt.completionTokens).toBe(outputOnly.completionTokens);
    expect(withPrompt.tokens).toBe(3000 + outputOnly.completionTokens);
    expect(withPrompt.source).toBe('estimate');
  });

  it('meters a larger context as more tokens than a smaller one for the same reply', () => {
    const small = resolveLlmTokens({ estimatedPromptTokens: 500, outputText: '好的，我明白了。' });
    const large = resolveLlmTokens({ estimatedPromptTokens: 20000, outputText: '好的，我明白了。' });

    expect(large.tokens).toBeGreaterThan(small.tokens);
  });

  it('still bills the prompt when the reply is empty (the provider already charged for it)', () => {
    const result = resolveLlmTokens({ estimatedPromptTokens: 1200, outputText: '' });

    expect(result.completionTokens).toBe(0);
    expect(result.tokens).toBe(1200);
  });

  it('prefers the provider usage over the estimate', () => {
    const result = resolveLlmTokens({
      providerUsage: { promptTokens: 4000, completionTokens: 150 },
      estimatedPromptTokens: 9999,
      outputText: 'ignored because the provider reported real numbers',
    });

    expect(result).toEqual({ tokens: 4150, promptTokens: 4000, completionTokens: 150, source: 'provider' });
  });

  it('uses provider total_tokens when given', () => {
    const result = resolveLlmTokens({
      providerUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 20 },
      estimatedPromptTokens: 1,
      outputText: 'x',
    });

    expect(result.tokens).toBe(20);
    expect(result.source).toBe('provider');
  });

  it('falls back to the estimate when provider usage is empty or zero', () => {
    const result = resolveLlmTokens({
      providerUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      estimatedPromptTokens: 800,
      outputText: 'Hello there',
    });

    expect(result.source).toBe('estimate');
    expect(result.promptTokens).toBe(800);
  });

  it.each([-5, NaN, Infinity, undefined])('treats an invalid prompt estimate %s as 0', (bad) => {
    const result = resolveLlmTokens({ estimatedPromptTokens: bad as number, outputText: '' });

    expect(result.promptTokens).toBe(0);
    expect(result.tokens).toBe(0);
  });
});

describe('meterLlmTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usageService.trackUsage).mockResolvedValue({} as never);
    mockSpendRecord.mockResolvedValue(undefined);
  });

  it('meters prompt + output as llm_tokens with a breakdown in metadata', async () => {
    const result = await meterLlmTokens(
      'tenant-1',
      { estimatedPromptTokens: 2000, outputText: 'Hello there' },
      { transport: 'websocket' }
    );

    expect(usageService.trackUsage).toHaveBeenCalledWith(
      'tenant-1',
      'llm_tokens',
      result.tokens,
      expect.objectContaining({
        transport: 'websocket',
        promptTokens: 2000,
        completionTokens: result.completionTokens,
        tokenSource: 'estimate',
      })
    );
    expect(result.tokens).toBeGreaterThan(2000);
  });

  it('feeds the same number to the platform spend breaker', async () => {
    const result = await meterLlmTokens('tenant-1', { estimatedPromptTokens: 700, outputText: 'Hi' });

    expect(mockSpendRecord).toHaveBeenCalledWith(result.tokens);
  });

  // 熔断统计的是平台真实花费，和租户能否归属无关
  it('records platform spend even when the tenant is unknown', async () => {
    const result = await meterLlmTokens(undefined, { estimatedPromptTokens: 700, outputText: 'Hi' });

    expect(usageService.trackUsage).not.toHaveBeenCalled();
    expect(mockSpendRecord).toHaveBeenCalledWith(result.tokens);
  });

  it('still records platform spend when the tenant usage write fails', async () => {
    vi.mocked(usageService.trackUsage).mockRejectedValue(new Error('db down'));

    const result = await meterLlmTokens('tenant-1', { estimatedPromptTokens: 700, outputText: 'Hi' });

    expect(mockSpendRecord).toHaveBeenCalledWith(result.tokens);
  });

  // 非流式生成已经由 llm.service 记过平台花费，再记会重复计数
  it('skips the platform spend when the caller already recorded it', async () => {
    const result = await meterLlmTokens(
      'tenant-1',
      { estimatedPromptTokens: 700, outputText: 'Hi' },
      undefined,
      { recordPlatformSpend: false }
    );

    expect(usageService.trackUsage).toHaveBeenCalledWith('tenant-1', 'llm_tokens', result.tokens, expect.anything());
    expect(mockSpendRecord).not.toHaveBeenCalled();
  });

  it('does not throw when the spend breaker write fails', async () => {
    mockSpendRecord.mockRejectedValue(new Error('redis down'));

    await expect(
      meterLlmTokens('tenant-1', { estimatedPromptTokens: 700, outputText: 'Hi' })
    ).resolves.toBeDefined();
  });
});

describe('readOpenAiUsage', () => {
  it('reads prompt/completion/total tokens from an OpenAI usage object', () => {
    expect(readOpenAiUsage({ prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 })).toEqual({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
    });
  });

  it.each([undefined, null, 'x', 5, {}, { prompt_tokens: 'a' }])('returns null for non-usage input %j', (input) => {
    expect(readOpenAiUsage(input)).toBeNull();
  });

  it('ignores negative and non-finite fields', () => {
    expect(readOpenAiUsage({ prompt_tokens: -1, completion_tokens: 7 })).toEqual({
      promptTokens: undefined,
      completionTokens: 7,
      totalTokens: undefined,
    });
  });
});

describe('readOllamaUsage', () => {
  it('reads prompt_eval_count and eval_count from the final line', () => {
    expect(readOllamaUsage({ done: true, prompt_eval_count: 900, eval_count: 40 })).toEqual({
      promptTokens: 900,
      completionTokens: 40,
    });
  });

  it('returns null while the stream is not done or counts are missing', () => {
    expect(readOllamaUsage({ done: false, prompt_eval_count: 900, eval_count: 40 })).toBeNull();
    expect(readOllamaUsage({ done: true })).toBeNull();
    expect(readOllamaUsage(null)).toBeNull();
  });
});

describe('estimateInjectedTokens', () => {
  it('adds up depth entries that are injected after the context was measured', () => {
    expect(estimateInjectedTokens([])).toBe(0);

    const one = estimateInjectedTokens([{ content: 'Stay in character.' }]);
    const two = estimateInjectedTokens([{ content: 'Stay in character.' }, { content: 'Stay in character.' }]);
    expect(one).toBeGreaterThan(0);
    expect(two).toBe(one * 2);
  });

  it('tolerates a missing list', () => {
    expect(estimateInjectedTokens(undefined)).toBe(0);
  });
});
