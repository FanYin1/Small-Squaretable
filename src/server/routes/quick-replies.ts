/**
 * Quick Replies API Routes
 *
 * 提供快速回复的 CRUD API 端点
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { quickReplyRepository } from '../../db/repositories/quick-reply.repository';
import type { ApiResponse } from '../../types/api';
import { NotFoundError } from '../../core/errors';

export const quickReplyRoutes = new Hono();

// 创建快速回复的 schema
const createQuickReplySchema = z.object({
  label: z.string().min(1).max(100),
  message: z.string().min(1),
  category: z.string().max(50).optional(),
  order: z.number().int().default(0),
  isEnabled: z.boolean().default(true),
});

// 更新快速回复的 schema
const updateQuickReplySchema = z.object({
  label: z.string().min(1).max(100).optional(),
  message: z.string().min(1).optional(),
  category: z.string().max(50).optional(),
  order: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
});

// 批量更新排序的 schema
const updateOrderSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().uuid(),
      order: z.number().int(),
    })
  ),
});

// 获取用户的所有快速回复
quickReplyRoutes.get('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  const replies = await quickReplyRepository.findByUserId(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: replies,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 获取用户的启用快速回复
quickReplyRoutes.get('/enabled', authMiddleware(), async (c) => {
  const user = c.get('user');
  const replies = await quickReplyRepository.findEnabledByUserId(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: replies,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 创建快速回复
quickReplyRoutes.post(
  '/',
  authMiddleware(),
  zValidator('json', createQuickReplySchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');

    const reply = await quickReplyRepository.create({
      userId: user.id,
      ...input,
    });

    return c.json<ApiResponse>(
      {
        success: true,
        data: reply,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// 获取单个快速回复
quickReplyRoutes.get('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const reply = await quickReplyRepository.findById(id);
  if (!reply || reply.userId !== user.id) {
    throw new NotFoundError('Quick reply');
  }

  return c.json<ApiResponse>(
    {
      success: true,
      data: reply,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 更新快速回复
quickReplyRoutes.patch(
  '/:id',
  authMiddleware(),
  zValidator('json', updateQuickReplySchema),
  async (c) => {
    const user = c.get('user');
    const { id } = c.req.param();
    const input = c.req.valid('json');

    const existing = await quickReplyRepository.findById(id);
    if (!existing || existing.userId !== user.id) {
      throw new NotFoundError('Quick reply');
    }

    const updated = await quickReplyRepository.update(id, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: updated,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 删除快速回复
quickReplyRoutes.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const existing = await quickReplyRepository.findById(id);
  if (!existing || existing.userId !== user.id) {
    throw new NotFoundError('Quick reply');
  }

  await quickReplyRepository.delete(id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { id },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 批量更新排序
quickReplyRoutes.post(
  '/reorder',
  authMiddleware(),
  zValidator('json', updateOrderSchema),
  async (c) => {
    const user = c.get('user');
    const { updates } = c.req.valid('json');

    // 验证所有 ID 都属于当前用户
    for (const { id } of updates) {
      const reply = await quickReplyRepository.findById(id);
      if (!reply || reply.userId !== user.id) {
        throw new NotFoundError('Quick reply');
      }
    }

    await quickReplyRepository.updateOrder(updates);

    return c.json<ApiResponse>(
      {
        success: true,
        data: { updated: updates.length },
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);
