/**
 * 用量计量的统一入口
 *
 * 配额是收费的基础：requireQuota 读的是 usage 表的累计值，
 * 如果某条链路只有 gate 没有计量，那条链路上的用量永远是 0，
 * gate 也就永远不会拒绝——发布的套餐上限只是装饰。
 *
 * 这个 helper 存在的原因是消息有两条传输通道（HTTP 路由和 WebSocket），
 * 两边都要计量，而且必须是同一套语义。分别手写两遍，早晚会漂移成
 * 「一边算一边不算」，那种缺口从用量面板上是看不出来的。
 *
 * 两条硬性约定：
 * 1. 计量失败绝不反过来打断用户的请求。消息此时已经落库了，抛异常只会
 *    让用户看到一个假的失败然后重发，等于用丢消息换一行账。
 * 2. 但失败必须留下 error 级日志。静默吞掉会让计量缺口完全不可观测，
 *    这正是当前这个 bug 能存在这么久的原因。
 *
 * 也就是说这里不是 fire-and-forget：调用方要 await，只是不会因此失败。
 */

import { usageService, type ResourceType } from './usage.service';
import { logger } from './logger.service';
import { spendBreaker } from './spend-breaker.service';
import { countTokens } from '../utils/tokens';

const meterLogger = logger.child({ module: 'usage-meter' });

/**
 * 记录一次用量。
 *
 * @param tenantId - 租户 ID；缺失时跳过并告警（无法归属的用量等于没算）
 * @param resourceType - 资源类型
 * @param amount - 用量数值；非正数或非有限值会被跳过
 * @param metadata - 可选元数据，便于事后对账（例如 transport、model）
 * @returns 是否真的写入了一条用量记录
 */
export async function meterUsage(
  tenantId: string | undefined | null,
  resourceType: ResourceType,
  amount: number,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  if (!tenantId) {
    // 走到这里说明调用点拿不到租户上下文，是代码问题，不是数据问题
    meterLogger.warn('Skipped usage metering: missing tenantId', { resourceType, amount });
    return false;
  }

  // amount <= 0 是正常路径（例如流式生成被中断，tokens 为 0），不告警
  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  try {
    await usageService.trackUsage(tenantId, resourceType, amount, metadata);
    return true;
  } catch (error) {
    meterLogger.error('Failed to record usage', error as Error, {
      tenantId,
      resourceType,
      amount,
    });
    return false;
  }
}

/** provider 在流末尾（或响应体）返回的真实 usage */
export interface ProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmTokenInput {
  /** provider 返回的真实 usage；有则优先 */
  providerUsage?: ProviderUsage | null;
  /** 估算的输入 token（context-manager 的 totalTokens，加上之后注入的内容） */
  estimatedPromptTokens: number;
  /** 模型输出的完整文本，仅在没有 provider usage 时用于估算输出 */
  outputText: string;
}

export interface LlmTokenResult {
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  source: 'provider' | 'estimate';
}

function positiveOrZero(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 计算一次生成应计的 token（P0-1：输入 + 输出）。
 *
 * 口径：provider 的真实 usage 优先；拿不到时用估算——
 * 输入取上下文构建时算好的 token 数，输出用与输入同一个估算器（utils/tokens）估算，
 * 保证两边量纲一致（llmService.countTokens 对中文偏低约 3 倍，不能和输入混用）。
 * 输出为空（被中断）时仍计输入：provider 已经为这次请求的输入收了费。
 */
export function resolveLlmTokens(input: LlmTokenInput): LlmTokenResult {
  const usage = input.providerUsage;
  if (usage) {
    const promptTokens = positiveOrZero(usage.promptTokens);
    const completionTokens = positiveOrZero(usage.completionTokens);
    const tokens = positiveOrZero(usage.totalTokens) || promptTokens + completionTokens;
    if (tokens > 0) {
      return { tokens, promptTokens, completionTokens, source: 'provider' };
    }
  }

  const promptTokens = positiveOrZero(input.estimatedPromptTokens);
  const completionTokens = countTokens(input.outputText);
  return {
    tokens: promptTokens + completionTokens,
    promptTokens,
    completionTokens,
    source: 'estimate',
  };
}

/**
 * 记录一次（流式）LLM 生成的 token：租户用量 + 平台花费熔断，同一个数字。
 *
 * 两处互相独立：租户无法归属或写库失败，不影响熔断统计（熔断看的是平台真实花费）。
 * 永不抛出。
 */
export async function meterLlmTokens(
  tenantId: string | undefined | null,
  input: LlmTokenInput,
  metadata?: Record<string, unknown>,
  options: { recordPlatformSpend?: boolean } = {}
): Promise<LlmTokenResult> {
  const result = resolveLlmTokens(input);

  await meterUsage(tenantId, 'llm_tokens', result.tokens, {
    ...metadata,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    tokenSource: result.source,
  });

  // 非流式生成在 llm.service 里已经记过平台花费，调用方传 false 避免重复计数
  if (options.recordPlatformSpend === false) return result;

  try {
    await spendBreaker.record(result.tokens);
  } catch (error) {
    meterLogger.error('Failed to record platform spend', error as Error, { tokens: result.tokens });
  }

  return result;
}

function validCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * 解析 OpenAI 兼容的 usage 对象（非流式响应体，或 include_usage 流的最后一个 chunk）。
 * 不是 usage 结构时返回 null。
 */
export function readOpenAiUsage(raw: unknown): ProviderUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const promptTokens = validCount(u.prompt_tokens);
  const completionTokens = validCount(u.completion_tokens);
  const totalTokens = validCount(u.total_tokens);
  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return null;
  }
  return { promptTokens, completionTokens, totalTokens };
}

/**
 * 解析 Ollama 原生 /api/chat 的最后一行（done: true）里的计数。
 * 流还没结束或没有计数时返回 null。
 */
export function readOllamaUsage(raw: unknown): ProviderUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const line = raw as Record<string, unknown>;
  if (line.done !== true) return null;
  const promptTokens = validCount(line.prompt_eval_count);
  const completionTokens = validCount(line.eval_count);
  if (promptTokens === undefined && completionTokens === undefined) return null;
  return { promptTokens, completionTokens };
}

/**
 * context-manager 的 totalTokens 是在 injectAtDepth 之前算的，
 * 之后注入的 depth_prompt / 世界书 atDepth 条目没有计入。这里补上，
 * 每条加 4 个 token 的消息开销，与 context-manager 的口径一致。
 */
export function estimateInjectedTokens(entries?: Array<{ content: string }> | null): number {
  if (!entries) return 0;
  return entries.reduce((sum, entry) => sum + countTokens(entry.content) + 4, 0);
}
