/**
 * Admin Route Group
 *
 * Aggregates all admin sub-routes under /api/v1/admin.
 */

import { Hono } from 'hono';
import { adminUserRoutes } from './users';
import { adminContentRoutes } from './content';
import { adminSystemRoutes } from './system';
import { adminAuditRoutes } from './audit';
import { adminGdprRoutes } from './gdpr';
import { adminExperimentRoutes } from './experiments';
import { adminJobRoutes } from './jobs';
import { adminInviteCodeRoutes } from './invite-codes';
import { isModuleEnabled } from '../../../core/modules';

export const adminRoutes = new Hono();

adminRoutes.route('/users', adminUserRoutes);
adminRoutes.route('/content', adminContentRoutes);
adminRoutes.route('/system', adminSystemRoutes);
adminRoutes.route('/audit-logs', adminAuditRoutes);
adminRoutes.route('/gdpr', adminGdprRoutes);
// P2-1：A/B 实验属于 analytics 模块，关闭时不挂
if (isModuleEnabled('analytics')) {
  adminRoutes.route('/experiments', adminExperimentRoutes);
}
adminRoutes.route('/jobs', adminJobRoutes);
adminRoutes.route('/invite-codes', adminInviteCodeRoutes);
