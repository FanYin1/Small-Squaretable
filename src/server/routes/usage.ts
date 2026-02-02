import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { usageService } from '../services/usage.service';
import { featureService } from '../services/feature.service';
import type { ApiResponse } from '../../types/api';

export const usageRoutes = new Hono();

/**
 * GET /usage/stats
 * 获取当前用量统计
 */
usageRoutes.get('/stats', authMiddleware(), async (c) => {
  const user = c.get('user');
  const stats = await usageService.getUsageStats(user.tenantId);

  return c.json<ApiResponse>({
    success: true,
    data: stats,
    meta: { timestamp: new Date().toISOString() },
  });
});

/**
 * GET /usage/quota
 * 获取配额信息（所有资源类型）
 */
usageRoutes.get('/quota', authMiddleware(), async (c) => {
  const user = c.get('user');

  // 获取所有资源类型的配额信息
  const [messagesQuota, tokensQuota, imagesQuota, apiCallsQuota] = await Promise.all([
    featureService.checkQuota(user.tenantId, 'messages'),
    featureService.checkQuota(user.tenantId, 'llm_tokens'),
    featureService.checkQuota(user.tenantId, 'images'),
    featureService.checkQuota(user.tenantId, 'api_calls'),
  ]);

  return c.json<ApiResponse>({
    success: true,
    data: {
      messages: messagesQuota,
      llm_tokens: tokensQuota,
      images: imagesQuota,
      api_calls: apiCallsQuota,
    },
    meta: { timestamp: new Date().toISOString() },
  });
});
