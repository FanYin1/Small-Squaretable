/**
 * LLM Service
 *
 * 提供 LLM 代理服务，支持多种 LLM 提供商
 */

import { findProviderForModel, getDefaultModel } from '../config/llm.config';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  CompletionRequest,
  CompletionResponse,
} from '../../types/llm';
import { AppError } from '../../core/errors';
import { spendBreaker } from './spend-breaker.service';
import { logger } from './logger.service';
import { getPromptLayout } from './prompt-layout';

const llmLogger = logger.child({ module: 'llm' });

/**
 * provider 返回的前缀缓存命中情况（P3-3 计量）。
 * 解析不出来的字段一律是 null，而不是 0：0 表示「provider 说没命中」，null 表示「不知道」，
 * 对比实验里这两者必须能区分。
 */
export interface CacheUsage {
  /** 本次请求的输入 token 总数（含缓存命中部分） */
  promptTokens: number | null;
  /** 命中前缀缓存的输入 token 数 */
  cachedTokens: number | null;
  /** 本次写入缓存的 token 数（仅 Anthropic 一类按写入计费的 provider 会给） */
  cacheCreationTokens: number | null;
}

/** 调用方可选传入的上下文，仅用于日志归因，不影响请求本身 */
export interface LlmCallOptions {
  chatId?: string;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function firstNum(...values: unknown[]): number | null {
  for (const v of values) {
    const n = num(v);
    if (n !== null) return n;
  }
  return null;
}

/**
 * 从 provider 的 usage 对象解析缓存命中数。已知字段：
 * - OpenAI 兼容（OpenAI、智谱 GLM、通义兼容模式等）：usage.prompt_tokens_details.cached_tokens
 * - Anthropic：usage.cache_read_input_tokens / cache_creation_input_tokens
 *   （原生格式里 input_tokens 不含缓存部分，所以总输入 = input + read + creation）
 * - DeepSeek：usage.prompt_cache_hit_tokens（miss 数在 prompt_cache_miss_tokens）
 * - Moonshot 等：usage.cached_tokens
 * 都没有时 cachedTokens 为 null。Ollama 原生接口没有缓存字段，只取 prompt_eval_count。
 */
export function readCacheUsage(usage: unknown): CacheUsage {
  if (typeof usage !== 'object' || usage === null) {
    return { promptTokens: null, cachedTokens: null, cacheCreationTokens: null };
  }
  const u = usage as Record<string, unknown>;
  const details =
    typeof u.prompt_tokens_details === 'object' && u.prompt_tokens_details !== null
      ? (u.prompt_tokens_details as Record<string, unknown>)
      : {};

  const cachedTokens = firstNum(
    details.cached_tokens,
    u.cache_read_input_tokens,
    u.prompt_cache_hit_tokens,
    u.cached_tokens
  );
  const cacheCreationTokens = firstNum(u.cache_creation_input_tokens);

  let promptTokens = firstNum(u.prompt_tokens, u.prompt_eval_count);
  if (promptTokens === null && num(u.input_tokens) !== null) {
    promptTokens = (u.input_tokens as number) + (cachedTokens ?? 0) + (cacheCreationTokens ?? 0);
  }

  return { promptTokens, cachedTokens, cacheCreationTokens };
}

/**
 * 记录一次调用的缓存命中。有 chatId 的聊天调用记 info（对比实验按它过滤），
 * 其余内部调用（记忆提取、摘要等）记 debug，避免污染命中率统计。
 */
function logCacheUsage(usage: unknown, model: string, stream: boolean, options?: LlmCallOptions): void {
  const cache = readCacheUsage(usage);
  const hitRatio =
    cache.promptTokens && cache.cachedTokens !== null ? Number((cache.cachedTokens / cache.promptTokens).toFixed(4)) : null;
  const fields = {
    layout: getPromptLayout(),
    model,
    chatId: options?.chatId ?? null,
    stream,
    promptTokens: cache.promptTokens,
    cachedTokens: cache.cachedTokens,
    cacheCreationTokens: cache.cacheCreationTokens,
    cacheHitRatio: hitRatio,
  };
  if (options?.chatId) {
    llmLogger.info('LLM prompt cache usage', fields);
  } else {
    llmLogger.debug('LLM prompt cache usage', fields);
  }
}

/**
 * 旁路观察 SSE / NDJSON 流里的 usage，原样转发字节，不改变调用方看到的内容。
 * OpenAI 兼容流的 usage 在倒数第二个 data 行；Ollama 原生流的统计字段在 done 行。
 * 流被调用方中途取消时不会走到 flush，也就不记录（usage 本来就没发完）。
 */
function observeStreamUsage(body: ReadableStream<Uint8Array>, onUsage: (usage: unknown) => void): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = '';
  let lastUsage: unknown = null;

  const scanLine = (raw: string): void => {
    const line = raw.trim();
    const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
    if (!payload.startsWith('{')) return;
    try {
      const obj = JSON.parse(payload) as Record<string, unknown>;
      if (obj.usage) lastUsage = obj.usage;
      else if (obj.done === true && typeof obj.prompt_eval_count === 'number') lastUsage = obj;
    } catch {
      // 不完整或非 JSON 的行与计量无关，忽略
    }
  };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(scanLine);
      },
      flush() {
        buffer += decoder.decode();
        if (buffer) scanLine(buffer);
        if (lastUsage) onUsage(lastUsage);
      },
    })
  );
}

export class LLMService {
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // ms

  /**
   * 平台花费累加（P0-7）。所有非流式生成在这里记账；
   * 流式生成的实际用量在调用方才知道，由调用方通过 meterLlmTokens 记账。
   * record 本身不抛，这里再兜一层，保证记账问题绝不影响已生成的回复。
   */
  private async recordPlatformSpend(computeTokens: () => number): Promise<void> {
    try {
      await spendBreaker.record(computeTokens());
    } catch {
      // 用量估算失败（provider 返回了非标准结构）或记账失败：
      // 后者已由 spendBreaker 记录日志，两者都不应影响回复
    }
  }

  /**
   * 取得 provider 的 baseUrl；未配置时显式报错，而不是拼出 "undefined/chat/completions"
   */
  private requireBaseUrl(providerConfig: { provider: string; baseUrl?: string }): string {
    if (!providerConfig.baseUrl) {
      throw new AppError(
        `LLM provider ${providerConfig.provider} has no baseUrl configured`,
        500,
        'LLM_NOT_CONFIGURED'
      );
    }
    return providerConfig.baseUrl;
  }

  /**
   * 聊天补全
   */
  async chatCompletion(request: ChatCompletionRequest, options?: LlmCallOptions): Promise<ChatCompletionResponse> {
    await spendBreaker.assertAllowed();

    const model = request.model || getDefaultModel();
    if (!model) {
      throw new AppError('No LLM provider configured', 500, 'LLM_NOT_CONFIGURED');
    }

    const providerConfig = findProviderForModel(model);
    if (!providerConfig) {
      throw new AppError(`Model ${model} not found`, 404, 'MODEL_NOT_FOUND');
    }

    const url = `${this.requireBaseUrl(providerConfig)}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerConfig.apiKey}`,
    };

    // 执行请求，带重试机制
    const result = await this.executeWithRetry<ChatCompletionResponse>(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AppError(
          error.error?.message || `LLM API error: ${response.statusText}`,
          response.status,
          'LLM_API_ERROR'
        );
      }

      return response.json();
    });

    await this.recordPlatformSpend(() => this.calculateTokenUsage(request, result));
    this.safeLogCacheUsage(result?.usage, model, false, options);
    return result;
  }

  /** 缓存日志只是观测，任何解析问题都不能影响回复 */
  private safeLogCacheUsage(usage: unknown, model: string, stream: boolean, options?: LlmCallOptions): void {
    try {
      logCacheUsage(usage, model, stream, options);
    } catch {
      // ignore
    }
  }

  /**
   * 流式聊天补全
   */
  async streamChatCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
    options?: LlmCallOptions
  ): Promise<Response> {
    // 只在发起前检查；已经开始流式输出的回复不会被中途切断
    await spendBreaker.assertAllowed();

    const model = request.model || getDefaultModel();
    if (!model) {
      throw new AppError('No LLM provider configured', 500, 'LLM_NOT_CONFIGURED');
    }

    const providerConfig = findProviderForModel(model);
    if (!providerConfig) {
      throw new AppError(`Model ${model} not found`, 404, 'MODEL_NOT_FOUND');
    }

    // Special handling for Qwen3.5 models - use Ollama native API with think: false
    const baseUrl = this.requireBaseUrl(providerConfig);
    let url = `${baseUrl}/chat/completions`;
    let modifiedRequest: any = { ...request, stream: true };

    // 让 OpenAI 兼容的 provider 在流末尾附带真实 usage（P0-1 计费首选）。
    // 个别严格校验参数的 provider 会拒绝 stream_options，可用
    // LLM_STREAM_INCLUDE_USAGE=false 关闭，此时调用方回退到估算。
    if (process.env.LLM_STREAM_INCLUDE_USAGE !== 'false') {
      modifiedRequest.stream_options = {
        ...((request as { stream_options?: Record<string, unknown> }).stream_options ?? {}),
        include_usage: true,
      };
    }

    if (model.includes('qwen3.5') && baseUrl.includes('11434')) {
      // Use Ollama native API for Qwen3.5 to disable thinking
      url = baseUrl.replace('/v1', '') + '/api/chat';
      modifiedRequest = {
        model,
        messages: request.messages,
        stream: true,
        think: false,  // Disable thinking at top level
        options: {
          num_ctx: 16384,
          num_predict: 4096,
          temperature: request.temperature || 0.7,
        },
      };
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerConfig.apiKey}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(modifiedRequest),
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AppError(
        error.error?.message || `LLM API error: ${response.statusText}`,
        response.status,
        'LLM_API_ERROR'
      );
    }

    if (!response.body || typeof response.body.pipeThrough !== 'function') {
      return response;
    }
    const observed = observeStreamUsage(response.body, (usage) =>
      this.safeLogCacheUsage(usage, model, true, options)
    );
    return new Response(observed, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  /**
   * 文本补全
   */
  async completion(request: CompletionRequest): Promise<CompletionResponse> {
    await spendBreaker.assertAllowed();

    const model = request.model || getDefaultModel();
    if (!model) {
      throw new AppError('No LLM provider configured', 500, 'LLM_NOT_CONFIGURED');
    }

    const providerConfig = findProviderForModel(model);
    if (!providerConfig) {
      throw new AppError(`Model ${model} not found`, 404, 'MODEL_NOT_FOUND');
    }

    const url = `${this.requireBaseUrl(providerConfig)}/completions`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerConfig.apiKey}`,
    };

    const result = await this.executeWithRetry<CompletionResponse>(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AppError(
          error.error?.message || `LLM API error: ${response.statusText}`,
          response.status,
          'LLM_API_ERROR'
        );
      }

      return response.json();
    });

    await this.recordPlatformSpend(() => {
      if (result.usage) return result.usage.total_tokens;
      const prompt = Array.isArray(request.prompt) ? request.prompt.join('') : request.prompt;
      return (
        this.countTokens(prompt ?? '') + result.choices.reduce((sum, c) => sum + this.countTokens(c.text), 0)
      );
    });
    return result;
  }

  /**
   * 估算 token 数量
   * 简单实现：约 4 个字符 = 1 token
   */
  countTokens(text: string): number {
    if (!text) return 0;
    // 简单估算：英文约 4 字符/token，中文约 2 字符/token
    const hasChineseChars = /[\u4e00-\u9fa5]/.test(text);
    const divisor = hasChineseChars ? 2 : 4;
    return Math.ceil(text.length / divisor);
  }

  /**
   * 计算请求的 token 使用量
   */
  calculateTokenUsage(request: ChatCompletionRequest, response: ChatCompletionResponse): number {
    // 如果响应中有 usage 信息，直接使用
    if (response.usage) {
      return response.usage.total_tokens;
    }

    // 否则估算
    let totalTokens = 0;

    // 计算输入 tokens
    for (const message of request.messages) {
      totalTokens += this.countTokens(message.content);
    }

    // 计算输出 tokens
    for (const choice of response.choices) {
      totalTokens += this.countTokens(choice.message.content);
    }

    return totalTokens;
  }

  /**
   * 带重试机制的请求执行
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // 如果是客户端错误（4xx），不重试
        if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const llmService = new LLMService();
