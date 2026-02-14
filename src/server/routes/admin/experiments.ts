/**
 * Admin Experiment Management Routes
 *
 * CRUD for A/B test experiments + results viewer.
 * All routes require authMiddleware() + requireRole('admin').
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { experimentRepository } from '../../../db/repositories/experiment.repository';
import { experimentAnalysisService } from '../../services/experiment-analysis.service';
import type { ApiResponse } from '../../../types/api';

export const adminExperimentRoutes = new Hono();

// All routes require admin role
adminExperimentRoutes.use('*', authMiddleware(), requireRole('admin'));

const variantSchema = z.object({
  name: z.string().min(1).max(100),
  weight: z.number().int().min(1),
  config: z.record(z.unknown()).default({}),
});

const createExperimentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  variants: z.array(variantSchema).min(1),
});

const updateExperimentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'running', 'completed']).optional(),
  variants: z.array(variantSchema).min(1).optional(),
});

// GET / — List experiments for tenant
adminExperimentRoutes.get('/', async (c) => {
  const user = c.get('user');
  const experiments = await experimentRepository.findByTenant(user.tenantId);

  return c.json<ApiResponse>({
    success: true,
    data: experiments,
    meta: { timestamp: new Date().toISOString() },
  });
});

// POST / — Create experiment
adminExperimentRoutes.post(
  '/',
  zValidator('json', createExperimentSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const experiment = await experimentRepository.create({
      ...body,
      tenantId: user.tenantId,
    });

    return c.json<ApiResponse>({
      success: true,
      data: experiment,
      meta: { timestamp: new Date().toISOString() },
    }, 201);
  },
);

// PATCH /:id — Update experiment
adminExperimentRoutes.patch(
  '/:id',
  zValidator('json', updateExperimentSchema),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const updates: Record<string, unknown> = { ...body };

    if (body.status === 'running') {
      updates.startedAt = new Date();
    }
    if (body.status === 'completed') {
      updates.endedAt = new Date();
    }

    const experiment = await experimentRepository.update(id, updates as any);

    return c.json<ApiResponse>({
      success: true,
      data: experiment,
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// GET /:id/results — Get experiment results
adminExperimentRoutes.get('/:id/results', async (c) => {
  const id = c.req.param('id');
  const results = await experimentAnalysisService.getExperimentResults(id);

  return c.json<ApiResponse>({
    success: true,
    data: results,
    meta: { timestamp: new Date().toISOString() },
  });
});
