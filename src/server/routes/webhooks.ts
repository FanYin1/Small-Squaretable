/**
 * Webhook 路由
 *
 * 提供 Webhook 端点 CRUD、测试投递和投递历史的 API
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { createWebhookSchema, updateWebhookSchema } from '../../types/webhook';
import { webhookService } from '../services/webhook.service';
import type { ApiResponse } from '../../types/api';

export const webhookRoutes = new Hono();

// 创建 Webhook 端点
webhookRoutes.post(
  '/',
  authMiddleware(),
  zValidator('json', createWebhookSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const endpoint = await webhookService.createEndpoint(user.id, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: endpoint,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// 列出我的 Webhook
webhookRoutes.get('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  const endpoints = await webhookService.listEndpoints(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: endpoints,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 获取 Webhook 详情
webhookRoutes.get('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const endpoint = await webhookService.getEndpoint(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: endpoint,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 更新 Webhook
webhookRoutes.patch(
  '/:id',
  authMiddleware(),
  zValidator('json', updateWebhookSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const endpoint = await webhookService.updateEndpoint(id, user.id, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: endpoint,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 删除 Webhook
webhookRoutes.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await webhookService.deleteEndpoint(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { deleted: true },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 发送测试事件
webhookRoutes.post('/:id/test', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const delivery = await webhookService.testEndpoint(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: delivery,
      meta: { timestamp: new Date().toISOString() },
    },
    201
  );
});

// 投递历史
webhookRoutes.get(
  '/:id/deliveries',
  authMiddleware(),
  zValidator('query', z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const { limit, offset } = c.req.valid('query');
    const result = await webhookService.getDeliveries(id, user.id, limit, offset);

    return c.json<ApiResponse>(
      {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 手动重试投递
webhookRoutes.post('/:id/deliveries/:did/retry', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const did = c.req.param('did');
  const delivery = await webhookService.retryDelivery(id, did, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: delivery,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});
