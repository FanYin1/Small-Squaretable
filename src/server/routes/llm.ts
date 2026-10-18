/**
 * LLM 路由
 *
 * 提供 LLM 代理 API 端点
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { stream } from 'hono/streaming';
import { llmService } from '../services/llm.service';
import { logger as appLogger } from '../services/logger.service';

const logger = appLogger.child({ module: 'llm-routes' });
import { usageService } from '../services/usage.service';
import { meterLlmTokens, readOpenAiUsage, type ProviderUsage } from '../services/usage-meter';
import { countTokens } from '../utils/tokens';
import { authMiddleware } from '../middleware/auth';
import { requireQuota } from '../middleware/feature-gate';
import {
  chatCompletionRequestSchema,
  completionRequestSchema,
  type ChatCompletionResponse,
  type CompletionResponse,
} from '../../types/llm';
import { getAvailableModelsWithMeta } from '../config/llm.config';

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

      // 计费口径 = 输入 + 输出（P0-1）：provider 在流末尾返回的 usage 优先，
      // 没有时输入按请求消息估算、输出按累积文本估算（与 WebSocket 通道同一套估算器）
      let outputText = '';
      let providerUsage: ProviderUsage | null = null;
      let pending = '';
      const handleLine = (line: string) => {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) return;
        try {
          const data = JSON.parse(line.slice(6));
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) outputText += delta;
          providerUsage = readOpenAiUsage(data.usage) ?? providerUsage;
        } catch (err) {
          logger.debug('SSE chunk parse error (non-fatal)', { error: String(err) });
        }
      };

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

            // 一行 SSE 可能被拆在两个网络分片里，按换行缓冲后再解析
            pending += chunk;
            const lines = pending.split('\n');
            pending = lines.pop() ?? '';
            lines.forEach(handleLine);
          }
          handleLine(pending);
        } finally {
          reader.releaseLock();

          // 流结束（含客户端中断）后记录用量；输入 token 此时已被 provider 计费，
          // 所以即使没有输出也要计。meterLlmTokens 不会抛出。
          await meterLlmTokens(
            tenantId,
            {
              providerUsage,
              estimatedPromptTokens: request.messages.reduce(
                (sum, m) => sum + countTokens(m.content) + 4,
                0
              ),
              outputText,
            },
            { model: request.model, stream: true, transport: 'http' }
          );
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

    // 记录 token 使用量（输入 + 输出）。provider 没返回 usage 时也按估算计，
    // 不再静默跳过；平台花费已在 llm.service.completion 里记过，这里不重复
    const prompt = Array.isArray(request.prompt) ? request.prompt.join('') : request.prompt;
    await meterLlmTokens(
      tenantId,
      {
        providerUsage: readOpenAiUsage(response.usage),
        estimatedPromptTokens: countTokens(prompt ?? ''),
        outputText: response.choices.map((choice) => choice.text).join(''),
      },
      { model: request.model, transport: 'http' },
      { recordPlatformSpend: false }
    );

    return c.json<CompletionResponse>(response, 200);
  }
);

/**
 * GET /api/v1/llm/models
 * 获取可用模型列表（含元数据）
 */
llmRoutes.get('/models', authMiddleware(), async (c) => {
  const models = getAvailableModelsWithMeta();

  return c.json({
    success: true,
    data: models,
  }, 200);
});
