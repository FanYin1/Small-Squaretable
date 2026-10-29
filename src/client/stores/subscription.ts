import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Subscription, SubscriptionConfig, PlanType, Entitlement } from '@client/types';
import { subscriptionApi } from '@client/services/subscription.api';
import { useUserStore } from './user';

/** 没有订阅记录时的兜底状态，也用于后端还没返回 entitlement 的情况 */
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export const useSubscriptionStore = defineStore('subscription', () => {
  const subscription = ref<Subscription | null>(null);
  const entitlement = ref<Entitlement | null>(null);
  const config = ref<SubscriptionConfig | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const statusLoaded = ref(false);
  const userStore = useUserStore();
  let requestVersion = 0;
  let pendingStatus: Promise<void> | null = null;
  const owner = computed(() => userStore.user ? JSON.stringify([userStore.user.tenantId, userStore.user.id]) : null);
  watch(owner, () => {
    requestVersion += 1;
    subscription.value = null;
    entitlement.value = null;
    config.value = null;
    statusLoaded.value = false;
    pendingStatus = null;
    error.value = null;
    loading.value = false;
  }, { flush: 'sync' });

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

  /**
   * 退款 / 拒付吊销。
   *
   * 必须和 isSuspended 分开：退款后 Stripe 侧的订阅往往还是 active，
   * subscription.status 看不出任何异常，只有 entitlement.reason 知道。
   * 而且这类用户不该被提示「更新付款方式」——钱已经退回去了。
   */
  const isRevoked = computed(() => entitlement.value?.reason === 'revoked');

  const isActive = computed(() => subscription.value?.status === 'active');
  const isPro = computed(() => currentPlan.value === 'pro' || currentPlan.value === 'team');

  async function fetchStatus(): Promise<void> {
    const version = ++requestVersion;
    loading.value = true;
    error.value = null;
    try {
      const response = await subscriptionApi.getStatus();
      if (version !== requestVersion) return;
      subscription.value = response.subscription;
      entitlement.value = response.entitlement ?? null;
      statusLoaded.value = true;
    } catch (e) {
      if (version !== requestVersion) return;
      statusLoaded.value = false;
      subscription.value = null;
      entitlement.value = null;
      error.value = e instanceof Error ? e.message : 'Failed to fetch subscription';
      throw e;
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  }

  function ensureStatus(): Promise<void> {
    if (pendingStatus) return pendingStatus;
    if (statusLoaded.value) return Promise.resolve();
    const pending = fetchStatus().finally(() => {
      if (pendingStatus === pending) pendingStatus = null;
    });
    pendingStatus = pending;
    return pending;
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
    isRevoked,
    fetchStatus,
    ensureStatus,
    statusLoaded,
    fetchConfig,
    startCheckout,
    openPortal,
  };
});
