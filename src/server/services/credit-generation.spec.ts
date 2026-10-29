/**
 * 生成链路点数计费封装（P3-1）
 *
 * credit-billing 与 usage-meter 被替换：这里验证封装层自己的语义——
 * 订阅模式零副作用、缺租户时拒绝而不是放行、settle / release 永不抛出、
 * settle 以 resolveLlmTokens 的总量为准。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { billing, meter, log } = vi.hoisted(() => ({
  billing: {
    isEnabled: vi.fn(),
    reserve: vi.fn(),
    settle: vi.fn(),
    release: vi.fn(),
    assertHasCredits: vi.fn(),
    resolveMaxOutputTokens: vi.fn(),
  },
  meter: { resolveLlmTokens: vi.fn() },
  log: { error: vi.fn() },
}));

vi.mock('./credit-billing.service', () => ({ creditBilling: billing }));
vi.mock('./usage-meter', () => ({ resolveLlmTokens: meter.resolveLlmTokens }));
vi.mock('./logger.service', () => ({
  logger: { child: () => ({ error: log.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }) },
}));

import {
  reserveForGeneration,
  settleGeneration,
  releaseGeneration,
  assertCreditsAvailable,
} from './credit-generation';

const HOLD = { id: 'hold-1', tenantId: 'tenant-1', tokens: 6000, maxOutputTokens: 4096 };

describe('credit-generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    billing.isEnabled.mockReturnValue(true);
    billing.resolveMaxOutputTokens.mockReturnValue(4096);
    billing.reserve.mockResolvedValue(HOLD);
    billing.settle.mockResolvedValue(undefined);
    billing.release.mockResolvedValue(undefined);
    billing.assertHasCredits.mockResolvedValue(undefined);
    meter.resolveLlmTokens.mockReturnValue({ tokens: 900, promptTokens: 700, completionTokens: 200, source: 'provider' });
  });

  describe('reserveForGeneration', () => {
    it('returns null and does nothing in subscription mode', async () => {
      billing.isEnabled.mockReturnValue(false);

      const hold = await reserveForGeneration({ tenantId: 't', estimatedPromptTokens: 100 });

      expect(hold).toBeNull();
      expect(billing.reserve).not.toHaveBeenCalled();
    });

    it('reserves with the resolved output cap and trace metadata', async () => {
      billing.resolveMaxOutputTokens.mockReturnValue(100);

      const hold = await reserveForGeneration({
        tenantId: 'tenant-1',
        chatId: 'chat-1',
        estimatedPromptTokens: 500,
        requestedMaxTokens: 100,
        metadata: { transport: 'http' },
      });

      expect(hold).toBe(HOLD);
      expect(billing.resolveMaxOutputTokens).toHaveBeenCalledWith(100);
      expect(billing.reserve).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        chatId: 'chat-1',
        estimatedInputTokens: 500,
        maxOutputTokens: 100,
        metadata: { transport: 'http' },
      });
    });

    it('defaults chatId to null', async () => {
      await reserveForGeneration({ tenantId: 'tenant-1', estimatedPromptTokens: 5 });

      expect(billing.reserve).toHaveBeenCalledWith(expect.objectContaining({ chatId: null }));
    });

    it.each([undefined, null, ''])('refuses (rather than lets through) when the tenant is %s', async (tenantId) => {
      await expect(reserveForGeneration({ tenantId, estimatedPromptTokens: 5 })).rejects.toThrow(
        'Credit billing requires a tenant context'
      );
      expect(billing.reserve).not.toHaveBeenCalled();
    });

    it('lets InsufficientCreditsError propagate', async () => {
      const error = Object.assign(new Error('no credits'), { statusCode: 402, code: 'INSUFFICIENT_CREDITS' });
      billing.reserve.mockRejectedValue(error);

      await expect(reserveForGeneration({ tenantId: 't', estimatedPromptTokens: 5 })).rejects.toBe(error);
    });
  });

  describe('assertCreditsAvailable', () => {
    it('is a no-op in subscription mode', async () => {
      billing.isEnabled.mockReturnValue(false);

      await assertCreditsAvailable('tenant-1');

      expect(billing.assertHasCredits).not.toHaveBeenCalled();
    });

    it('delegates to the billing precheck in credits mode', async () => {
      await assertCreditsAvailable('tenant-1');

      expect(billing.assertHasCredits).toHaveBeenCalledWith('tenant-1');
    });

    it('propagates the precheck failure', async () => {
      const error = new Error('no credits');
      billing.assertHasCredits.mockRejectedValue(error);

      await expect(assertCreditsAvailable('tenant-1')).rejects.toBe(error);
    });

    it.each([undefined, null])('refuses a missing tenant (%s)', async (tenantId) => {
      await expect(assertCreditsAvailable(tenantId)).rejects.toThrow('Credit billing requires a tenant context');
    });
  });

  describe('settleGeneration', () => {
    const input = { estimatedPromptTokens: 650, outputText: 'hi', chatId: 'chat-1', messageId: 7 };

    it('does nothing without a hold', async () => {
      await settleGeneration(null, input);

      expect(meter.resolveLlmTokens).not.toHaveBeenCalled();
      expect(billing.settle).not.toHaveBeenCalled();
    });

    it('settles with the metered input/output split and the trace ids', async () => {
      await settleGeneration(HOLD as never, {
        ...input,
        providerUsage: { promptTokens: 700, completionTokens: 200, totalTokens: 900 },
      });

      expect(meter.resolveLlmTokens).toHaveBeenCalledWith({
        providerUsage: { promptTokens: 700, completionTokens: 200, totalTokens: 900 },
        estimatedPromptTokens: 650,
        outputText: 'hi',
      });
      expect(billing.settle).toHaveBeenCalledWith('hold-1', {
        inputTokens: 700,
        outputTokens: 200,
        chatId: 'chat-1',
        messageId: 7,
      });
    });

    // provider 只给 total_tokens 时 prompt / completion 都是 0，不能把总量丢成零扣费
    it('keeps the full total when the provider only reported total_tokens', async () => {
      meter.resolveLlmTokens.mockReturnValue({ tokens: 900, promptTokens: 0, completionTokens: 0, source: 'provider' });

      await settleGeneration(HOLD as never, input);

      const [, charged] = billing.settle.mock.calls[0];
      expect(charged.inputTokens + charged.outputTokens).toBe(900);
    });

    it('never produces a negative output share', async () => {
      meter.resolveLlmTokens.mockReturnValue({ tokens: 100, promptTokens: 150, completionTokens: 0, source: 'estimate' });

      await settleGeneration(HOLD as never, input);

      expect(billing.settle.mock.calls[0][1].outputTokens).toBe(0);
    });

    it('defaults missing trace ids to null', async () => {
      await settleGeneration(HOLD as never, { estimatedPromptTokens: 1, outputText: '' });

      expect(billing.settle).toHaveBeenCalledWith(
        'hold-1',
        expect.objectContaining({ chatId: null, messageId: null })
      );
    });

    it('never throws: a failed settle is logged with the hold id', async () => {
      billing.settle.mockRejectedValue(new Error('db down'));

      await expect(settleGeneration(HOLD as never, input)).resolves.toBeUndefined();

      expect(log.error).toHaveBeenCalledWith(
        'Failed to settle credit reservation',
        expect.any(Error),
        expect.objectContaining({ holdId: 'hold-1', tenantId: 'tenant-1' })
      );
    });

    it('never throws even when metering itself throws', async () => {
      meter.resolveLlmTokens.mockImplementation(() => {
        throw new Error('bad usage');
      });

      await expect(settleGeneration(HOLD as never, input)).resolves.toBeUndefined();
      expect(log.error).toHaveBeenCalled();
    });
  });

  describe('releaseGeneration', () => {
    it('does nothing without a hold', async () => {
      await releaseGeneration(null);

      expect(billing.release).not.toHaveBeenCalled();
    });

    it('releases the hold', async () => {
      await releaseGeneration(HOLD as never);

      expect(billing.release).toHaveBeenCalledWith('hold-1');
    });

    it('never throws: a failed release is logged', async () => {
      billing.release.mockRejectedValue(new Error('db down'));

      await expect(releaseGeneration(HOLD as never)).resolves.toBeUndefined();

      expect(log.error).toHaveBeenCalledWith(
        'Failed to release credit reservation',
        expect.any(Error),
        expect.objectContaining({ holdId: 'hold-1' })
      );
    });
  });
});
