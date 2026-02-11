/**
 * Admin System Stats Routes
 *
 * All routes require authMiddleware() + requireRole('admin').
 */

import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { db } from '../../../db/index';
import { users } from '../../../db/schema/users';
import { characters } from '../../../db/schema/characters';
import { chats } from '../../../db/schema/chats';
import { subscriptions } from '../../../db/schema/subscriptions';
import { reports } from '../../../db/schema/reports';
import { sql, eq, gte } from 'drizzle-orm';
import type { ApiResponse } from '../../../types/api';

export const adminSystemRoutes = new Hono();

// All routes require admin role
adminSystemRoutes.use('*', authMiddleware(), requireRole('admin'));

// GET /stats — System overview
adminSystemRoutes.get('/stats', async (c) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    [{ totalUsers }],
    [{ activeUsers }],
    [{ totalCharacters }],
    [{ totalChats }],
    subscriptionBreakdown,
    [{ recentSignups }],
    [{ pendingReports }],
  ] = await Promise.all([
    db.select({ totalUsers: sql<number>`count(*)::int` }).from(users),
    db.select({ activeUsers: sql<number>`count(*)::int` }).from(users)
      .where(gte(users.lastLoginAt, thirtyDaysAgo)),
    db.select({ totalCharacters: sql<number>`count(*)::int` }).from(characters),
    db.select({ totalChats: sql<number>`count(*)::int` }).from(chats),
    db
      .select({
        plan: subscriptions.plan,
        count: sql<number>`count(*)::int`,
      })
      .from(subscriptions)
      .groupBy(subscriptions.plan),
    db.select({ recentSignups: sql<number>`count(*)::int` }).from(users)
      .where(gte(users.createdAt, sevenDaysAgo)),
    db.select({ pendingReports: sql<number>`count(*)::int` }).from(reports)
      .where(eq(reports.status, 'pending')),
  ]);

  // Build subscription breakdown object
  const breakdown: Record<string, number> = { free: 0, pro: 0, team: 0 };
  for (const row of subscriptionBreakdown) {
    breakdown[row.plan] = row.count;
  }

  return c.json<ApiResponse>({
    success: true,
    data: {
      totalUsers,
      activeUsers,
      totalCharacters,
      totalChats,
      subscriptionBreakdown: breakdown,
      recentSignups,
      pendingReports,
    },
    meta: { timestamp: new Date().toISOString() },
  });
});
