/**
 * LLM API
 *
 * 处理 LLM 聊天补全请求
 */

import { api, ApiError, type ApiResponse } from './api';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ModelMeta {
  id: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  defaultTemperature: number;
}

/**
 * 流式请求非 2xx 时构造错误：能解析出标准错误体（{ error: { code, message, details } }）
 * 就抛 ApiError（带 status/code/details，例如点数不足 402），否则退回通用错误。
 */
async function buildRequestError(response: Response): Promise<Error> {
  const generic = new Error(`LLM request failed: ${response.status}`);
  try {
    const body = (await response.json()) as ApiResponse;
    if (body?.error?.code) {
      return new ApiError(
        response.status,
        body.error.code,
        body.error.message || generic.message,
        body.error.details
      );
    }
  } catch {
    // 非 JSON 响应体：保持通用错误
  }
  return generic;
}

export const llmApi = {
  /**
   * 获取可用模型列表
   */
  getModels: () => api.get<ModelMeta[]>('/llm/models'),

  /**
   * 聊天补全（非流式）
   */
  chatCompletion: async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
    return await api.post<ChatCompletionResponse>('/llm/chat/completions', {
      ...request,
      stream: false,
    });
  },

  /**
   * 聊天补全（流式）
   * 返回 ReadableStream 用于处理流式响应
   */
  streamChatCompletion: async (
    request: ChatCompletionRequest,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (error: Error) => void
  ): Promise<void> => {
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenantId');

    const response = await fetch('/api/v1/llm/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(tenantId && { 'X-Tenant-ID': tenantId }),
      },
      body: JSON.stringify({
        ...request,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw await buildRequestError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onDone();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
      onDone();
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Stream error'));
    } finally {
      reader.releaseLock();
    }
  },
};
