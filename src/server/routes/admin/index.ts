/**
 * Admin Route Group
 *
 * Aggregates all admin sub-routes under /api/v1/admin.
 */

import { Hono } from 'hono';
import { adminUserRoutes } from './users';
import { adminContentRoutes } from './content';
import { adminSystemRoutes } from './system';

export const adminRoutes = new Hono();

adminRoutes.route('/users', adminUserRoutes);
adminRoutes.route('/content', adminContentRoutes);
adminRoutes.route('/system', adminSystemRoutes);
