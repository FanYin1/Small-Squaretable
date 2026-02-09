/**
 * Developer Routes
 *
 * API routes for API key management (CRUD) and scope listing.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import {
  createApiKeySchema,
  updateApiKeySchema,
  listApiKeysQuerySchema,
  API_KEY_SCOPES,
} from '../../types/apiKey';
import { apiKeyService } from '../services/apiKey.service';
import type { ApiResponse } from '../../types/api';

export const developerRoutes = new Hono();

// =====================
// API Key Routes
// =====================

// POST /api-keys — Create a new API key
developerRoutes.post(
  '/api-keys',
  authMiddleware(),
  zValidator('json', createApiKeySchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const result = await apiKeyService.createApiKey(user.id, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// GET /api-keys — List API keys for the current user
developerRoutes.get(
  '/api-keys',
  authMiddleware(),
  zValidator('query', listApiKeysQuerySchema),
  async (c) => {
    const user = c.get('user');
    const { limit, offset } = c.req.valid('query');
    const keys = await apiKeyService.listApiKeys(user.id, limit, offset);

    return c.json<ApiResponse>(
      {
        success: true,
        data: keys,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// GET /api-keys/:id — Get a single API key
developerRoutes.get('/api-keys/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const key = await apiKeyService.getApiKey(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: key,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// PATCH /api-keys/:id — Update an API key
developerRoutes.patch(
  '/api-keys/:id',
  authMiddleware(),
  zValidator('json', updateApiKeySchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const updated = await apiKeyService.updateApiKey(id, user.id, input);

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

// DELETE /api-keys/:id — Delete an API key
developerRoutes.delete('/api-keys/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await apiKeyService.deleteApiKey(id, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { deleted: true },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// =====================
// Scope Routes
// =====================

// GET /scopes — List all available API key scopes
developerRoutes.get('/scopes', authMiddleware(), async (c) => {
  return c.json<ApiResponse>(
    {
      success: true,
      data: API_KEY_SCOPES,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});
