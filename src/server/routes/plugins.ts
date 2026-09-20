/**
 * Plugin Routes
 *
 * API routes for plugin lifecycle: author management (CRUD, publish),
 * marketplace browsing, install management, and event execution.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { pluginService } from '../services/plugin.service';
import { authMiddleware } from '../middleware/auth';
import { pluginExecutionRateLimit } from '../middleware/rateLimit';
import {
  createPluginSchema,
  updatePluginSchema,
  installPluginSchema,
  updateInstallConfigSchema,
  pluginMarketplaceQuerySchema,
} from '../../types/plugin';
import type { ApiResponse } from '../../types/api';

export const pluginRoutes = new Hono();

// =====================
// Author Plugin Management
// =====================

// POST / — Create a new plugin
pluginRoutes.post(
  '/',
  authMiddleware(),
  zValidator('json', createPluginSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const plugin = await pluginService.createPlugin(user.id, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: plugin,
        meta: { timestamp: new Date().toISOString() },
      },
      201,
    );
  },
);

// GET /mine — List plugins authored by the current user
pluginRoutes.get('/mine', authMiddleware(), async (c) => {
  const user = c.get('user');
  const myPlugins = await pluginService.getMyPlugins(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: myPlugins,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

// PATCH /:id — Update a plugin
pluginRoutes.patch(
  '/:id',
  authMiddleware(),
  zValidator('json', updatePluginSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const plugin = await pluginService.updatePlugin(id, user.id, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: plugin,
        meta: { timestamp: new Date().toISOString() },
      },
      200,
    );
  },
);

// DELETE /:id — Delete a plugin
pluginRoutes.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await pluginService.deletePlugin(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: null,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

// POST /:id/publish — Publish a plugin to the marketplace
pluginRoutes.post('/:id/publish', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const plugin = await pluginService.publishPlugin(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: plugin,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

// =====================
// Marketplace
// =====================

// GET /marketplace — Browse published plugins
pluginRoutes.get(
  '/marketplace',
  zValidator('query', pluginMarketplaceQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const result = await pluginService.listPublished(query);
    const totalPages = Math.ceil(result.total / query.limit);

    return c.json(
      {
        success: true,
        data: {
          items: result.items,
          pagination: {
            page: query.page,
            limit: query.limit,
            total: result.total,
            totalPages,
            hasNext: query.page < totalPages,
            hasPrev: query.page > 1,
          },
        },
        meta: { timestamp: new Date().toISOString() },
      },
      200,
    );
  },
);

// GET /marketplace/:id — Get a single published plugin
pluginRoutes.get('/marketplace/:id', async (c) => {
  const id = c.req.param('id');
  const plugin = await pluginService.getPlugin(id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: plugin,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

// =====================
// Install Management
// =====================

// POST /installs — Install a plugin
pluginRoutes.post(
  '/installs',
  authMiddleware(),
  zValidator('json', installPluginSchema),
  async (c) => {
    const user = c.get('user');
    const { pluginId, config } = c.req.valid('json');
    const install = await pluginService.installPlugin(user.id, pluginId, config);

    return c.json<ApiResponse>(
      {
        success: true,
        data: install,
        meta: { timestamp: new Date().toISOString() },
      },
      201,
    );
  },
);

// GET /installs — List user's installed plugins
pluginRoutes.get('/installs', authMiddleware(), async (c) => {
  const user = c.get('user');
  const installs = await pluginService.getUserInstalls(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: installs,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

// PATCH /installs/:id — Update install configuration
pluginRoutes.patch(
  '/installs/:id',
  authMiddleware(),
  zValidator('json', updateInstallConfigSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const install = await pluginService.updateInstallConfig(id, user.id, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: install,
        meta: { timestamp: new Date().toISOString() },
      },
      200,
    );
  },
);

// DELETE /installs/:id — Uninstall a plugin
pluginRoutes.delete('/installs/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await pluginService.uninstallPlugin(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: null,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

// POST /installs/:id/enable — Enable an installed plugin
pluginRoutes.post('/installs/:id/enable', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const install = await pluginService.enablePlugin(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: install,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

// POST /installs/:id/disable — Disable an installed plugin
pluginRoutes.post('/installs/:id/disable', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const install = await pluginService.disablePlugin(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: install,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

// =====================
// Event Execution
// =====================

const executePluginSchema = z.object({
  event: z.string().min(1).max(100),
  payload: z.record(z.unknown()).default({}),
});

// POST /execute — Execute plugin event pipeline
pluginRoutes.post(
  '/execute',
  authMiddleware(),
  pluginExecutionRateLimit,
  zValidator('json', executePluginSchema),
  async (c) => {
    const user = c.get('user');
    const { event, payload } = c.req.valid('json');
    const results = await pluginService.executeEvent(user.id, event, payload);

    return c.json<ApiResponse>(
      {
        success: true,
        data: results,
        meta: { timestamp: new Date().toISOString() },
      },
      200,
    );
  },
);
