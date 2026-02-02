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

export class LLMService {
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // ms

  /**
   * 聊天补全
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const model = request.model || getDefaultModel();
    if (!model) {
      throw new AppError('No LLM provider configured', 500, 'LLM_NOT_CONFIGURED');
    }

    const providerConfig = findProviderForModel(model);
    if (!providerConfig) {
      throw new AppError(`Model ${model} not found`, 404, 'MODEL_NOT_FOUND');
    }

    const url = `${providerConfig.baseUrl}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerConfig.apiKey}`,
    };

    // 执行请求，带重试机制
    return this.executeWithRetry(async () => {
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
  }

  /**
   * 流式聊天补全
   */
  async streamChatCompletion(request: ChatCompletionRequest): Promise<Response> {
    const model = request.model || getDefaultModel();
    if (!model) {
      throw new AppError('No LLM provider configured', 500, 'LLM_NOT_CONFIGURED');
    }

    const providerConfig = findProviderForModel(model);
    if (!providerConfig) {
      throw new AppError(`Model ${model} not found`, 404, 'MODEL_NOT_FOUND');
    }

    const url = `${providerConfig.baseUrl}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerConfig.apiKey}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...request, stream: true }),
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
    const model = request.model || getDefaultModel();
    if (!model) {
      throw new AppError('No LLM provider configured', 500, 'LLM_NOT_CONFIGURED');
    }

    const providerConfig = findProviderForModel(model);
    if (!providerConfig) {
      throw new AppError(`Model ${model} not found`, 404, 'MODEL_NOT_FOUND');
    }

    const url = `${providerConfig.baseUrl}/completions`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerConfig.apiKey}`,
    };

    return this.executeWithRetry(async () => {
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
