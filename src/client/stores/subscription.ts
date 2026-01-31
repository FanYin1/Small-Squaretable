import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Subscription, SubscriptionConfig, PlanType } from '@client/types';
import { subscriptionApi } from '@client/services/subscription.api';

export const useSubscriptionStore = defineStore('subscription', () => {
  const subscription = ref<Subscription | null>(null);
  const config = ref<SubscriptionConfig | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const currentPlan = computed<PlanType>(() => subscription.value?.plan || 'free');
  const isActive = computed(() => subscription.value?.status === 'active');
  const isPro = computed(() => currentPlan.value === 'pro' || currentPlan.value === 'team');

  async function fetchStatus(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await subscriptionApi.getStatus();
      subscription.value = response.subscription;
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
    config,
    loading,
    error,
    currentPlan,
    isActive,
    isPro,
    fetchStatus,
    fetchConfig,
    startCheckout,
    openPortal,
  };
});
