/**
 * User Personas API Routes
 *
 * 提供用户 Persona 的 CRUD API 端点
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { userPersonaRepository } from '../../db/repositories/user-persona.repository';
import type { ApiResponse } from '../../types/api';
import { NotFoundError, BadRequestError } from '../../core/errors';

export const userPersonaRoutes = new Hono();

// 创建 Persona 的 schema
const createPersonaSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  metadata: z.record(z.any()).default({}),
  isDefault: z.boolean().default(false),
});

// 更新 Persona 的 schema
const updatePersonaSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  metadata: z.record(z.any()).optional(),
  isDefault: z.boolean().optional(),
});

// 获取用户的所有 Personas
userPersonaRoutes.get('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  const personas = await userPersonaRepository.findByUserId(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: personas,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 获取用户的默认 Persona
userPersonaRoutes.get('/default', authMiddleware(), async (c) => {
  const user = c.get('user');
  const persona = await userPersonaRepository.findDefaultByUserId(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: persona,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 创建 Persona
userPersonaRoutes.post(
  '/',
  authMiddleware(),
  zValidator('json', createPersonaSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');

    // 如果设置为默认，先清除其他默认标记
    if (input.isDefault) {
      await userPersonaRepository.clearDefaultForUser(user.id);
    }

    const persona = await userPersonaRepository.create({
      tenantId: user.tenantId,
      userId: user.id,
      ...input,
    });

    return c.json<ApiResponse>(
      {
        success: true,
        data: persona,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// 获取单个 Persona
userPersonaRoutes.get('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const persona = await userPersonaRepository.findById(id);
  if (!persona || persona.userId !== user.id) {
    throw new NotFoundError('Persona');
  }

  return c.json<ApiResponse>(
    {
      success: true,
      data: persona,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 更新 Persona
userPersonaRoutes.patch(
  '/:id',
  authMiddleware(),
  zValidator('json', updatePersonaSchema),
  async (c) => {
    const user = c.get('user');
    const { id } = c.req.param();
    const input = c.req.valid('json');

    const existing = await userPersonaRepository.findById(id);
    if (!existing || existing.userId !== user.id) {
      throw new NotFoundError('Persona');
    }

    // 如果设置为默认，先清除其他默认标记
    if (input.isDefault) {
      await userPersonaRepository.clearDefaultForUser(user.id);
    }

    const updated = await userPersonaRepository.update(id, input);

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

// 删除 Persona
userPersonaRoutes.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const existing = await userPersonaRepository.findById(id);
  if (!existing || existing.userId !== user.id) {
    throw new NotFoundError('Persona');
  }

  // 检查是否是最后一个 Persona
  const count = await userPersonaRepository.countByUserId(user.id);
  if (count <= 1) {
    throw new BadRequestError('Cannot delete the last persona');
  }

  await userPersonaRepository.delete(id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { id },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 设置为默认 Persona
userPersonaRoutes.post('/:id/set-default', authMiddleware(), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const existing = await userPersonaRepository.findById(id);
  if (!existing || existing.userId !== user.id) {
    throw new NotFoundError('Persona');
  }

  const updated = await userPersonaRepository.setDefault(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});
