/**
 * Feature Permission Service
 *
 * 管理功能权限和配额检查
 */

import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { usageService, type ResourceType } from './usage.service';
import { resolveEffectivePlan } from './entitlement';
import type { PlanType } from './subscription.service';

export type FeatureName =
  | 'basic_chat'
  | 'community_browse'
  | 'character_share'
  | 'advanced_models'
  | 'priority_support'
  | 'team_collaboration'
  | 'api_access'
  | 'custom_domain'
  | 'plugin_marketplace'
  | 'analytics_dashboard';

export interface PlanLimits {
  messages: number;
  llm_tokens: number;
  images: number;
  api_calls: number;
  plugin_installs: number;
}

const PLAN_FEATURES: Record<PlanType, FeatureName[]> = {
  free: ['basic_chat', 'community_browse'],
  pro: [
    'basic_chat',
    'community_browse',
    'character_share',
    'advanced_models',
    'priority_support',
    'plugin_marketplace',
    'analytics_dashboard',
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
    'plugin_marketplace',
    'analytics_dashboard',
  ],
};

/**
 * llm_tokens 的口径是「输入 + 输出」（P0-1）：每次生成计 上下文 token + 回复 token。
 *
 * 推导（没有真实流量数据，以下是假设值，上线后应按实测的 usage 元数据校准）：
 *   典型上下文 ≈ 3,000 tokens（system 提示 + 角色卡 + 被 context-manager 裁剪后的历史）
 *   典型回复   ≈   400 tokens
 *   每次生成   ≈ 3,400 tokens
 *   messages 配额同时计用户消息和助手消息（每轮 2 条），所以生成次数 = messages / 2
 *
 *   free: 100 条     -> 50 次     x 3,400 =     170,000   （旧口径 50,000）
 *   pro:  10,000 条  -> 5,000 次  x 3,400 =  17,000,000   （旧口径 1,000,000）
 *   team: 100,000 条 -> 50,000 次 x 3,400 = 170,000,000   （旧口径 10,000,000）
 *
 * 旧数字只量输出（约 400 tokens/条），在新口径下一个 free 用户 15 次生成就会用完。
 * 数字刻意和 messages 配额保持同一个「松紧」，让两个配额大致同时触顶，
 * 而不是 token 配额悄悄变成唯一的约束。
 */
const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    messages: 100,
    llm_tokens: 170000,
    images: 10,
    api_calls: 0,
    plugin_installs: 0,
  },
  pro: {
    messages: 10000,
    llm_tokens: 17000000,
    images: 500,
    api_calls: 1000,
    plugin_installs: 5,
  },
  team: {
    messages: 100000,
    llm_tokens: 170000000,
    images: 5000,
    api_calls: 10000,
    plugin_installs: 20,
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
    // 配额按生效套餐算：付款失败的用户不该继续用 pro 的额度
    const subscription = await subscriptionRepository.findByTenantId(tenantId);
    const plan = resolveEffectivePlan(subscription);

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
    return this.hasFeature(resolveEffectivePlan(subscription), feature);
  }
}

export const featureService = new FeatureService();
