/**
 * LLM 路由
 *
 * 提供 LLM 代理 API 端点
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { stream } from 'hono/streaming';
import { llmService } from '../services/llm.service';
import { usageService } from '../services/usage.service';
import { authMiddleware } from '../middleware/auth';
import { requireQuota } from '../middleware/feature-gate';
import {
  chatCompletionRequestSchema,
  completionRequestSchema,
  type ChatCompletionResponse,
  type CompletionResponse,
  type ModelsResponse,
} from '../../types/llm';
import { getAvailableModels } from '../config/llm.config';

export const llmRoutes = new Hono();

/**
 * POST /api/v1/llm/chat/completions
 * 聊天补全
 */
llmRoutes.post(
  '/chat/completions',
  authMiddleware(),
  requireQuota('llm_tokens'),
  zValidator('json', chatCompletionRequestSchema),
  async (c) => {
    const tenantId = c.get('tenantId');
    const request = c.req.valid('json');

    // 如果是流式请求
    if (request.stream) {
      const response = await llmService.streamChatCompletion(request);

      // 跟踪 token 使用量
      let totalTokens = 0;

      // 返回流式响应
      return stream(c, async (stream) => {
        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            await stream.write(chunk);

            // 尝试解析 token 使用量
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  // 估算 token（流式响应通常不包含 usage）
                  if (data.choices?.[0]?.delta?.content) {
                    totalTokens += llmService.countTokens(data.choices[0].delta.content);
                  }
                } catch {
                  // 忽略解析错误
                }
              }
            }
          }
        } finally {
          reader.releaseLock();

          // 流结束后记录使用量
          if (totalTokens > 0 && tenantId) {
            await usageService.trackUsage(tenantId, 'llm_tokens', totalTokens, {
              model: request.model,
              stream: true,
            });
          }
        }
      });
    }

    // 非流式请求
    const response = await llmService.chatCompletion(request);

    // 记录 token 使用量
    const tokenUsage = llmService.calculateTokenUsage(request, response);
    if (tenantId) {
      await usageService.trackUsage(tenantId, 'llm_tokens', tokenUsage, {
        model: request.model,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
      });
    }

    return c.json<ChatCompletionResponse>(response, 200);
  }
);

/**
 * POST /api/v1/llm/completions
 * 文本补全
 */
llmRoutes.post(
  '/completions',
  authMiddleware(),
  requireQuota('llm_tokens'),
  zValidator('json', completionRequestSchema),
  async (c) => {
    const tenantId = c.get('tenantId');
    const request = c.req.valid('json');

    const response = await llmService.completion(request);

    // 记录 token 使用量
    if (tenantId && response.usage) {
      await usageService.trackUsage(tenantId, 'llm_tokens', response.usage.total_tokens, {
        model: request.model,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
      });
    }

    return c.json<CompletionResponse>(response, 200);
  }
);

/**
 * GET /api/v1/llm/models
 * 获取可用模型列表
 */
llmRoutes.get('/models', authMiddleware(), async (c) => {
  const models = getAvailableModels();

  const response: ModelsResponse = {
    object: 'list',
    data: models.map((model) => ({
      id: model,
      object: 'model',
      created: Date.now(),
      owned_by: 'system',
    })),
  };

  return c.json(response, 200);
});
