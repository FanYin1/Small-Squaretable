/**
 * Notification Preferences Routes
 *
 * API endpoints for managing user notification preferences
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { notificationService } from '../services/notification.service';
import type { ApiResponse } from '@/types/api';

const notificationPreferenceRoutes = new Hono();

const emailFrequencyEnum = z.enum(['immediate', 'daily', 'weekly', 'never']);

const updatePreferenceSchema = z.object({
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
  emailFrequency: emailFrequencyEnum.optional(),
});

const bulkUpdateSchema = z.array(
  z.object({
    type: z.string().min(1).max(50),
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
    emailFrequency: emailFrequencyEnum.optional(),
  }),
);

/**
 * GET / - Get all preferences for the authenticated user
 */
notificationPreferenceRoutes.get('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  const preferences = await notificationService.getPreferences(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: preferences,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

/**
 * PUT /:type - Update preference for a specific notification type
 */
notificationPreferenceRoutes.put(
  '/:type',
  authMiddleware(),
  zValidator('json', updatePreferenceSchema),
  async (c) => {
    const user = c.get('user');
    const type = c.req.param('type');
    const body = c.req.valid('json');

    const preference = await notificationService.updatePreference(user.id, type, body);

    return c.json<ApiResponse>(
      {
        success: true,
        data: preference,
        meta: { timestamp: new Date().toISOString() },
      },
      200,
    );
  },
);

/**
 * PUT / - Bulk update preferences
 */
notificationPreferenceRoutes.put(
  '/',
  authMiddleware(),
  zValidator('json', bulkUpdateSchema),
  async (c) => {
    const user = c.get('user');
    const items = c.req.valid('json');

    for (const item of items) {
      await notificationService.updatePreference(user.id, item.type, {
        inApp: item.inApp,
        email: item.email,
        emailFrequency: item.emailFrequency,
      });
    }

    const preferences = await notificationService.getPreferences(user.id);

    return c.json<ApiResponse>(
      {
        success: true,
        data: preferences,
        meta: { timestamp: new Date().toISOString() },
      },
      200,
    );
  },
);

export { notificationPreferenceRoutes };
