/**
 * Chat Templates API Routes
 *
 * CRUD endpoints for reusable chat templates.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { chatTemplateRepository } from '../../db/repositories/chat-template.repository';
import type { ApiResponse } from '../../types/api';

// --- Validation schemas ---

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  systemPrompt: z.string().max(10000).optional(),
  firstMessage: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(10).default([]),
  isPublic: z.boolean().default(false),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  systemPrompt: z.string().max(10000).nullable().optional(),
  firstMessage: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string()).max(10).optional(),
  isPublic: z.boolean().optional(),
});

export const chatTemplatesRouter = new Hono();

// List user's own templates + public templates
chatTemplatesRouter.get('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  const [own, publicTemplates] = await Promise.all([
    chatTemplateRepository.findByUser(user.id),
    chatTemplateRepository.findPublic(),
  ]);

  return c.json<ApiResponse>({
    success: true,
    data: { own, public: publicTemplates },
    meta: { timestamp: new Date().toISOString() },
  }, 200);
});

// Create template
chatTemplatesRouter.post(
  '/',
  authMiddleware(),
  zValidator('json', createTemplateSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');

    const template = await chatTemplateRepository.create({
      userId: user.id,
      ...input,
    });

    return c.json<ApiResponse>({
      success: true,
      data: template,
      meta: { timestamp: new Date().toISOString() },
    }, 201);
  }
);

// Get template by ID
chatTemplatesRouter.get('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const template = await chatTemplateRepository.findById(id);

  if (!template || (!template.isPublic && template.userId !== user.id)) {
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Template not found' },
      meta: { timestamp: new Date().toISOString() },
    }, 404);
  }

  return c.json<ApiResponse>({
    success: true,
    data: template,
    meta: { timestamp: new Date().toISOString() },
  }, 200);
});

// Update template (ownership check)
chatTemplatesRouter.patch(
  '/:id',
  authMiddleware(),
  zValidator('json', updateTemplateSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const updated = await chatTemplateRepository.update(id, user.id, input);
    if (!updated) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
        meta: { timestamp: new Date().toISOString() },
      }, 404);
    }

    return c.json<ApiResponse>({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString() },
    }, 200);
  }
);

// Delete template (ownership check)
chatTemplatesRouter.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const deleted = await chatTemplateRepository.delete(id, user.id);
  if (!deleted) {
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Template not found' },
      meta: { timestamp: new Date().toISOString() },
    }, 404);
  }

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Template deleted successfully' },
    meta: { timestamp: new Date().toISOString() },
  }, 200);
});

// Use template (increment usage count, return template data)
chatTemplatesRouter.post('/:id/use', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const template = await chatTemplateRepository.findById(id);

  if (!template || (!template.isPublic && template.userId !== user.id)) {
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Template not found' },
      meta: { timestamp: new Date().toISOString() },
    }, 404);
  }

  await chatTemplateRepository.incrementUsageCount(id);

  return c.json<ApiResponse>({
    success: true,
    data: { ...template, usageCount: template.usageCount + 1 },
    meta: { timestamp: new Date().toISOString() },
  }, 200);
});
