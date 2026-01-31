/**
 * Feature Gate Composable
 *
 * 前端功能权限检查
 */

import { computed } from 'vue';
import { useSubscriptionStore } from '@client/stores';
import type { PlanType } from '@client/types';

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

// 与后端保持一致的功能定义
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

// 与后端保持一致的限额定义
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

export function useFeatureGate() {
  const subscriptionStore = useSubscriptionStore();

  /**
   * 当前套餐
   */
  const currentPlan = computed<PlanType>(() => subscriptionStore.currentPlan);

  /**
   * 检查是否有特定功能权限
   *
   * @param feature - 功能名称
   * @returns 是否有权限
   */
  const hasFeature = (feature: FeatureName): boolean => {
    const plan = currentPlan.value;
    const features = PLAN_FEATURES[plan];
    return features ? features.includes(feature) : false;
  };

  /**
   * 获取当前套餐的所有功能
   *
   * @returns 功能列表
   */
  const getCurrentFeatures = (): FeatureName[] => {
    return PLAN_FEATURES[currentPlan.value] || [];
  };

  /**
   * 获取当前套餐的限额
   *
   * @returns 限额配置
   */
  const getCurrentLimits = (): PlanLimits => {
    return PLAN_LIMITS[currentPlan.value] || PLAN_LIMITS.free;
  };

  /**
   * 获取特定资源的限额
   *
   * @param resourceType - 资源类型
   * @returns 限额数值
   */
  const getLimit = (resourceType: keyof PlanLimits): number => {
    const limits = getCurrentLimits();
    return limits[resourceType];
  };

  /**
   * 检查是否为付费用户
   */
  const isPaidUser = computed(() => {
    return currentPlan.value === 'pro' || currentPlan.value === 'team';
  });

  /**
   * 检查是否为团队用户
   */
  const isTeamUser = computed(() => {
    return currentPlan.value === 'team';
  });

  /**
   * 获取升级提示信息
   *
   * @param feature - 功能名称
   * @returns 升级提示
   */
  const getUpgradeMessage = (feature: FeatureName): string => {
    const plan = currentPlan.value;

    if (plan === 'free') {
      return 'Upgrade to Pro or Team to unlock this feature';
    }

    if (plan === 'pro' && PLAN_FEATURES.team.includes(feature)) {
      return 'Upgrade to Team to unlock this feature';
    }

    return 'This feature is not available in your current plan';
  };

  return {
    currentPlan,
    hasFeature,
    getCurrentFeatures,
    getCurrentLimits,
    getLimit,
    isPaidUser,
    isTeamUser,
    getUpgradeMessage,
  };
}
