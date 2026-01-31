/**
 * Tenant Context Middleware
 *
 * 从请求头中提取租户 ID 并存储到上下文中
 * 用于多租户隔离和数据访问控制
 */

import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';

interface TenantMiddlewareOptions {
  publicPaths?: string[];
  headerName?: string;
}

export function tenantMiddleware(options: TenantMiddlewareOptions = {}) {
  const {
    publicPaths = ['/health', '/api/v1/auth/login', '/api/v1/auth/register'],
    headerName = 'X-Tenant-ID',
  } = options;

  return createMiddleware(async (c: Context, next) => {
    const path = new URL(c.req.url).pathname;

    // Skip tenant check for public paths
    if (publicPaths.some((p) => path.startsWith(p))) {
      return next();
    }

    const tenantId = c.req.header(headerName);

    if (!tenantId) {
      return c.json(
        {
          error: 'Missing tenant ID',
          message: `Please provide ${headerName} header`,
        },
        400
      );
    }

    // Store tenant ID in context
    c.set('tenantId', tenantId);

    return next();
  });
}
