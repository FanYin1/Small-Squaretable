/**
 * LLM API
 *
 * 处理 LLM 聊天补全请求
 */

import { api } from './api';

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

export const llmApi = {
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
      throw new Error(`LLM request failed: ${response.status}`);
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
