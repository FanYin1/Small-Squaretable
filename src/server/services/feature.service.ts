/**
 * Feature Permission Service
 *
 * 管理功能权限和配额检查
 */

import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { usageService, type ResourceType } from './usage.service';
import type { PlanType } from './subscription.service';

export type FeatureName =
  | 'basic_chat'
  | 'community_browse'
  | 'character_share'
  | 'advanced_models'
  | 'priority_support'
  | 'team_collaboration'
  | 'api_access'
  | 'custom_domain';

export interface PlanLimits {
  messages: number;
  llm_tokens: number;
  images: number;
  api_calls: number;
}

const PLAN_FEATURES: Record<PlanType, FeatureName[]> = {
  free: ['basic_chat', 'community_browse'],
  pro: [
    'basic_chat',
    'community_browse',
    'character_share',
    'advanced_models',
    'priority_support',
  ],
  team: [
    'basic_chat',
    'community_browse',
    'character_share',
    'advanced_models',
    'priority_support',
    'team_collaboration',
    'api_access',
    'custom_domain',
  ],
};

const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    messages: 100,
    llm_tokens: 50000,
    images: 10,
    api_calls: 0,
  },
  pro: {
    messages: 10000,
    llm_tokens: 1000000,
    images: 500,
    api_calls: 1000,
  },
  team: {
    messages: 100000,
    llm_tokens: 10000000,
    images: 5000,
    api_calls: 10000,
  },
};

export class FeatureService {
  /**
   * 检查套餐是否有特定功能权限
   *
   * @param plan - 订阅套餐
   * @param feature - 功能名称
   * @returns 是否有权限
   */
  hasFeature(plan: PlanType, feature: FeatureName): boolean {
    const features = PLAN_FEATURES[plan];
    return features ? features.includes(feature) : false;
  }

  /**
   * 获取套餐的所有功能
   *
   * @param plan - 订阅套餐
   * @returns 功能列表
   */
  getPlanFeatures(plan: PlanType): FeatureName[] {
    return PLAN_FEATURES[plan] || [];
  }

  /**
   * 获取套餐限额
   *
   * @param plan - 订阅套餐
   * @returns 限额配置
   */
  getPlanLimits(plan: PlanType): PlanLimits {
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  }

  /**
   * 检查配额是否充足
   *
   * @param tenantId - 租户ID
   * @param resourceType - 资源类型
   * @returns 配额检查结果
   */
  async checkQuota(
    tenantId: string,
    resourceType: ResourceType
  ): Promise<{
    allowed: boolean;
    currentUsage: number;
    limit: number;
    remaining: number;
  }> {
    // 获取租户订阅信息
    const subscription = await subscriptionRepository.findByTenantId(tenantId);
    const plan = subscription?.plan || 'free';

    // 获取套餐限额
    const limits = this.getPlanLimits(plan);
    const limit = limits[resourceType];

    // 获取当前用量
    const quotaInfo = await usageService.checkQuota(tenantId, resourceType);
    const currentUsage = quotaInfo.currentUsage;

    // 计算剩余配额
    const remaining = Math.max(0, limit - currentUsage);
    const allowed = currentUsage < limit;

    return {
      allowed,
      currentUsage,
      limit,
      remaining,
    };
  }

  /**
   * 检查租户是否有特定功能权限
   *
   * @param tenantId - 租户ID
   * @param feature - 功能名称
   * @returns 是否有权限
   */
  async checkTenantFeature(tenantId: string, feature: FeatureName): Promise<boolean> {
    const subscription = await subscriptionRepository.findByTenantId(tenantId);
    const plan = subscription?.plan || 'free';
    return this.hasFeature(plan, feature);
  }
}

export const featureService = new FeatureService();
