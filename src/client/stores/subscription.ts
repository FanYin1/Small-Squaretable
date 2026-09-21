import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Subscription, SubscriptionConfig, PlanType, Entitlement } from '@client/types';
import { subscriptionApi } from '@client/services/subscription.api';

/** 没有订阅记录时的兜底状态，也用于后端还没返回 entitlement 的情况 */
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export const useSubscriptionStore = defineStore('subscription', () => {
  const subscription = ref<Subscription | null>(null);
  const entitlement = ref<Entitlement | null>(null);
  const config = ref<SubscriptionConfig | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * 当前生效的套餐。
   *
   * 优先用服务端算好的 entitlement——宽限期规则只在服务端，
   * 前端自己算一遍迟早会不一致（界面显示 Pro、接口回 403）。
   * 后端没返回时退回本地判断，但至少不能把 canceled/past_due 当成有效。
   */
  const currentPlan = computed<PlanType>(() => {
    if (entitlement.value) {
      return entitlement.value.plan;
    }
    const record = subscription.value;
    if (!record) return 'free';
    return ACTIVE_STATUSES.has(record.status) ? record.plan : 'free';
  });

  /** 买过套餐但当前失效，UI 应提示更新付款方式而不是升级 */
  const isSuspended = computed(() => entitlement.value?.suspended ?? false);

  const isActive = computed(() => subscription.value?.status === 'active');
  const isPro = computed(() => currentPlan.value === 'pro' || currentPlan.value === 'team');

  async function fetchStatus(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await subscriptionApi.getStatus();
      subscription.value = response.subscription;
      entitlement.value = response.entitlement ?? null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch subscription';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchConfig(): Promise<void> {
    try {
      const response = await subscriptionApi.getConfig();
      config.value = response;
    } catch (e) {
      console.error('Failed to fetch subscription config:', e);
    }
  }

  async function startCheckout(priceId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await subscriptionApi.createCheckout({
        priceId,
        successUrl: `${window.location.origin}/subscription?success=true`,
        cancelUrl: `${window.location.origin}/subscription?canceled=true`,
      });
      window.location.href = response.url;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to start checkout';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function openPortal(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await subscriptionApi.createPortal({
        returnUrl: `${window.location.origin}/subscription`,
      });
      window.location.href = response.url;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to open billing portal';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    subscription,
    entitlement,
    config,
    loading,
    error,
    currentPlan,
    isActive,
    isPro,
    isSuspended,
    fetchStatus,
    fetchConfig,
    startCheckout,
    openPortal,
  };
});
