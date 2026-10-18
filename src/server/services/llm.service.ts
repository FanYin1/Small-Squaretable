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
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
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
    return result;
  }

  /**
   * 流式聊天补全
   */
  async streamChatCompletion(request: ChatCompletionRequest, signal?: AbortSignal): Promise<Response> {
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

    return response;
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
