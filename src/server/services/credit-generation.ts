/**
 * 生成链路上的点数计费封装（P3-1）
 *
 * HTTP（routes/llm.ts）和 WebSocket（routes/websocket.ts）两条生成通道共用这三个函数，
 * 和 usage-meter.ts 存在的理由一样：两条通道必须是同一套语义，分别手写早晚会漂移。
 *
 *   reserveForGeneration  生成前预扣；订阅模式返回 null（调用方什么都不用做）
 *   settleGeneration      生成后按实际用量结算；永不抛出
 *   releaseGeneration     连接 provider 之前就失败时释放；永不抛出
 *
 * settle / release 永不抛出的原因同 meterLlmTokens：此时回复已经发给用户了，
 * 结算失败不能反过来把请求变成失败。失败留 error 日志，冻结过期后由清扫任务放回额度，
 * 代价是这次生成没有被扣费（可观测，不是静默的）。
 */

import { creditBilling, type CreditHold } from './credit-billing.service';
import { resolveLlmTokens, type ProviderUsage } from './usage-meter';
import { logger } from './logger.service';

const generationLogger = logger.child({ module: 'credit-generation' });

export interface ReserveForGenerationInput {
  tenantId: string | undefined | null;
  chatId?: string | null;
  /** 输入 token 估算（上下文 + 注入内容） */
  estimatedPromptTokens: number;
  /** 请求自带的 max_tokens（可选） */
  requestedMaxTokens?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * 预扣。订阅模式返回 null；点数不足抛 InsufficientCreditsError（402）。
 * 返回的 hold.maxOutputTokens 必须作为 max_tokens 传给 provider，否则预扣的上限没有意义。
 */
export async function reserveForGeneration(input: ReserveForGenerationInput): Promise<CreditHold | null> {
  if (!creditBilling.isEnabled()) return null;
  if (!input.tenantId) {
    // 和 meterUsage 一致：拿不到租户是代码问题。点数模式下无法归属就无法扣费，必须拒绝而不是放行
    throw new Error('Credit billing requires a tenant context');
  }

  return creditBilling.reserve({
    tenantId: input.tenantId,
    chatId: input.chatId ?? null,
    estimatedInputTokens: input.estimatedPromptTokens,
    maxOutputTokens: creditBilling.resolveMaxOutputTokens(input.requestedMaxTokens),
    metadata: input.metadata,
  });
}

/**
 * 轻量前置检查（不占额度）：在做有副作用的事（例如保存用户消息）之前挡掉明显没余额的请求。
 * 订阅模式什么都不做；点数不足抛 InsufficientCreditsError（402）。
 * 并发安全仍由 reserveForGeneration 保证，这里只是减少「消息已落库但生成被拒」的情形。
 */
export async function assertCreditsAvailable(tenantId: string | undefined | null): Promise<void> {
  if (!creditBilling.isEnabled()) return;
  if (!tenantId) throw new Error('Credit billing requires a tenant context');
  await creditBilling.assertHasCredits(tenantId);
}

export interface SettleGenerationInput {
  providerUsage?: ProviderUsage | null;
  estimatedPromptTokens: number;
  outputText: string;
  chatId?: string | null;
  messageId?: number | null;
}

/** 按实际用量结算。hold 为 null（订阅模式）时什么都不做。 */
export async function settleGeneration(
  hold: CreditHold | null,
  input: SettleGenerationInput,
): Promise<void> {
  if (!hold) return;
  try {
    const usage = resolveLlmTokens({
      providerUsage: input.providerUsage,
      estimatedPromptTokens: input.estimatedPromptTokens,
      outputText: input.outputText,
    });
    await creditBilling.settle(hold.id, {
      // 以 usage.tokens 为准（和 meterLlmTokens 同一个数字）：provider 只给 total_tokens 时
      // promptTokens / completionTokens 都是 0，直接相加会变成零扣费
      inputTokens: usage.promptTokens,
      outputTokens: Math.max(usage.tokens - usage.promptTokens, 0),
      chatId: input.chatId ?? null,
      messageId: input.messageId ?? null,
    });
  } catch (error) {
    generationLogger.error('Failed to settle credit reservation', error as Error, {
      holdId: hold.id,
      tenantId: hold.tenantId,
    });
  }
}

/** 释放预扣（生成没开始）。hold 为 null 时什么都不做。 */
export async function releaseGeneration(hold: CreditHold | null): Promise<void> {
  if (!hold) return;
  try {
    await creditBilling.release(hold.id);
  } catch (error) {
    generationLogger.error('Failed to release credit reservation', error as Error, {
      holdId: hold.id,
      tenantId: hold.tenantId,
    });
  }
}
