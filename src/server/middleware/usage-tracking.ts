import type { Context, Next } from 'hono';
import { usageService } from '../services/usage.service';

/**
 * 用量追踪中间件 - 追踪消息用量
 *
 * 在请求处理完成后，自动记录消息用量
 */
export const trackMessageUsage = async (c: Context, next: Next) => {
  await next();

  // 追踪消息用量
  const user = c.get('user');
  if (user?.tenantId) {
    try {
      await usageService.trackUsage(user.tenantId, 'messages', 1);
    } catch (error) {
      // 记录错误但不影响主流程
      console.error('Failed to track message usage:', error);
    }
  }
};

/**
 * 用量追踪中间件 - 追踪 API 调用
 */
export const trackApiCallUsage = async (c: Context, next: Next) => {
  await next();

  const user = c.get('user');
  if (user?.tenantId) {
    try {
      await usageService.trackUsage(user.tenantId, 'api_calls', 1);
    } catch (error) {
      console.error('Failed to track API call usage:', error);
    }
  }
};

/**
 * 用量追踪中间件 - 追踪 LLM Token 用量
 *
 * @param tokenCount - Token 数量
 */
export const trackTokenUsage = (tokenCount: number) => {
  return async (c: Context, next: Next) => {
    await next();

    const user = c.get('user');
    if (user?.tenantId) {
      try {
        await usageService.trackUsage(user.tenantId, 'llm_tokens', tokenCount);
      } catch (error) {
        console.error('Failed to track token usage:', error);
      }
    }
  };
};

/**
 * 用量追踪中间件 - 追踪图片生成用量
 */
export const trackImageUsage = async (c: Context, next: Next) => {
  await next();

  const user = c.get('user');
  if (user?.tenantId) {
    try {
      await usageService.trackUsage(user.tenantId, 'images', 1);
    } catch (error) {
      console.error('Failed to track image usage:', error);
    }
  }
};
