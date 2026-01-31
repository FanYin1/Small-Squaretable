/**
 * Feature Gate Middleware
 *
 * 功能权限和配额检查中间件
 */

import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { featureService, type FeatureName } from '../services/feature.service';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import type { ResourceType } from '../services/usage.service';
import { ForbiddenError } from '../../core/errors';

/**
 * 要求特定功能权限的中间件
 *
 * @param feature - 需要的功能名称
 * @returns Hono 中间件
 *
 * @example
 * app.post('/api/v1/characters/share', requireFeature('character_share'), async (c) => {
 *   // 只有有 character_share 权限的用户才能访问
 * });
 */
export function requireFeature(feature: FeatureName) {
  return createMiddleware(async (c: Context, next) => {
    const tenantId = c.get('tenantId');

    if (!tenantId) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Tenant ID not found',
        },
        401
      );
    }

    // 获取租户订阅信息
    const subscription = await subscriptionRepository.findByTenantId(tenantId);
    const plan = subscription?.plan || 'free';

    // 检查功能权限
    if (!featureService.hasFeature(plan, feature)) {
      return c.json(
        {
          error: 'Upgrade required',
          message: `This feature requires a higher subscription plan`,
          feature,
          currentPlan: plan,
        },
        403
      );
    }

    await next();
  });
}

/**
 * 要求配额充足的中间件
 *
 * @param resourceType - 资源类型
 * @returns Hono 中间件
 *
 * @example
 * app.post('/api/v1/chat/send', requireQuota('messages'), async (c) => {
 *   // 只有配额充足的用户才能发送消息
 * });
 */
export function requireQuota(resourceType: ResourceType) {
  return createMiddleware(async (c: Context, next) => {
    const tenantId = c.get('tenantId');

    if (!tenantId) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Tenant ID not found',
        },
        401
      );
    }

    // 检查配额
    const quotaCheck = await featureService.checkQuota(tenantId, resourceType);

    if (!quotaCheck.allowed) {
      return c.json(
        {
          error: 'Quota exceeded',
          message: `You have exceeded your ${resourceType} quota`,
          resourceType,
          currentUsage: quotaCheck.currentUsage,
          limit: quotaCheck.limit,
        },
        403
      );
    }

    // 将配额信息存储到上下文中，供后续使用
    c.set('quotaInfo', quotaCheck);

    await next();
  });
}

/**
 * 组合功能权限和配额检查的中间件
 *
 * @param feature - 需要的功能名称
 * @param resourceType - 资源类型
 * @returns Hono 中间件
 *
 * @example
 * app.post('/api/v1/images/generate', requireFeatureAndQuota('advanced_models', 'images'), async (c) => {
 *   // 需要同时满足功能权限和配额要求
 * });
 */
export function requireFeatureAndQuota(feature: FeatureName, resourceType: ResourceType) {
  return createMiddleware(async (c: Context, next) => {
    const tenantId = c.get('tenantId');

    if (!tenantId) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Tenant ID not found',
        },
        401
      );
    }

    // 获取租户订阅信息
    const subscription = await subscriptionRepository.findByTenantId(tenantId);
    const plan = subscription?.plan || 'free';

    // 检查功能权限
    if (!featureService.hasFeature(plan, feature)) {
      return c.json(
        {
          error: 'Upgrade required',
          message: `This feature requires a higher subscription plan`,
          feature,
          currentPlan: plan,
        },
        403
      );
    }

    // 检查配额
    const quotaCheck = await featureService.checkQuota(tenantId, resourceType);

    if (!quotaCheck.allowed) {
      return c.json(
        {
          error: 'Quota exceeded',
          message: `You have exceeded your ${resourceType} quota`,
          resourceType,
          currentUsage: quotaCheck.currentUsage,
          limit: quotaCheck.limit,
        },
        403
      );
    }

    // 将配额信息存储到上下文中
    c.set('quotaInfo', quotaCheck);

    await next();
  });
}

// 扩展 Hono Context 类型
declare module 'hono' {
  interface ContextVariableMap {
    quotaInfo?: {
      allowed: boolean;
      currentUsage: number;
      limit: number;
      remaining: number;
    };
  }
}
