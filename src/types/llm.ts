/**
 * LLM API 类型定义
 *
 * 兼容 OpenAI API 格式的类型定义
 */

import { z } from 'zod';

/**
 * LLM 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'function';

/**
 * LLM 消息
 */
export interface LLMMessage {
  role: MessageRole;
  content: string;
  name?: string;
}

/**
 * 聊天补全请求
 */
export const chatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'function']),
      content: z.string(),
      name: z.string().optional(),
    })
  ),
  temperature: z.number().min(0).max(2).optional().default(1),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().min(1).optional().default(1),
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  max_tokens: z.number().int().positive().optional(),
  presence_penalty: z.number().min(-2).max(2).optional().default(0),
  frequency_penalty: z.number().min(-2).max(2).optional().default(0),
  user: z.string().optional(),
});

export type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;

/**
 * 聊天补全响应
 */
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: LLMMessage;
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 流式聊天补全响应块
 */
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: MessageRole;
      content?: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
}

/**
 * 文本补全请求
 */
export const completionRequestSchema = z.object({
  model: z.string(),
  prompt: z.union([z.string(), z.array(z.string())]),
  temperature: z.number().min(0).max(2).optional().default(1),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().min(1).optional().default(1),
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  max_tokens: z.number().int().positive().optional(),
  presence_penalty: z.number().min(-2).max(2).optional().default(0),
  frequency_penalty: z.number().min(-2).max(2).optional().default(0),
  user: z.string().optional(),
});

export type CompletionRequest = z.infer<typeof completionRequestSchema>;

/**
 * 文本补全响应
 */
export interface CompletionResponse {
  id: string;
  object: 'text_completion';
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    finish_reason: 'stop' | 'length' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 模型信息
 */
export interface ModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

/**
 * 模型列表响应
 */
export interface ModelsResponse {
  object: 'list';
  data: ModelInfo[];
}

/**
 * LLM 提供商类型
 */
export type LLMProvider = 'openai' | 'anthropic' | 'custom';

/**
 * LLM 提供商配置
 */
export interface LLMProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  models: string[];
  defaultModel?: string;
}
