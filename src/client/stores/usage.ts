import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { usageApi, type UsageStats, type QuotaResponse, type QuotaInfo } from '@client/services/usage.api';

export const useUsageStore = defineStore('usage', () => {
  const stats = ref<UsageStats | null>(null);
  const quota = ref<QuotaResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Computed properties for easy access
  const messagesQuota = computed(() => quota.value?.messages);
  const tokensQuota = computed(() => quota.value?.llm_tokens);
  const imagesQuota = computed(() => quota.value?.images);
  const apiCallsQuota = computed(() => quota.value?.api_calls);

  // Check if any quota is approaching limit (>80%)
  const hasWarning = computed(() => {
    if (!quota.value) return false;

    const quotas = [
      quota.value.messages,
      quota.value.llm_tokens,
      quota.value.images,
      quota.value.api_calls,
    ];

    return quotas.some((q) => {
      if (q.limit === 0) return false;
      const percentage = (q.currentUsage / q.limit) * 100;
      return percentage >= 80;
    });
  });

  // Check if any quota is exceeded
  const hasExceeded = computed(() => {
    if (!quota.value) return false;

    const quotas = [
      quota.value.messages,
      quota.value.llm_tokens,
      quota.value.images,
      quota.value.api_calls,
    ];

    return quotas.some((q) => !q.allowed);
  });

  // Get percentage for a quota
  function getQuotaPercentage(quotaInfo: QuotaInfo | undefined): number {
    if (!quotaInfo || quotaInfo.limit === 0) return 0;
    return Math.min(100, (quotaInfo.currentUsage / quotaInfo.limit) * 100);
  }

  // Get status type for progress bar
  function getQuotaStatus(quotaInfo: QuotaInfo | undefined): 'success' | 'warning' | 'danger' {
    const percentage = getQuotaPercentage(quotaInfo);
    if (percentage >= 100) return 'danger';
    if (percentage >= 80) return 'warning';
    return 'success';
  }

  async function fetchStats(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await usageApi.getStats();
      stats.value = response;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch usage stats';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchQuota(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await usageApi.getQuota();
      quota.value = response;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch quota';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function refresh(): Promise<void> {
    await Promise.all([fetchStats(), fetchQuota()]);
  }

  return {
    stats,
    quota,
    loading,
    error,
    messagesQuota,
    tokensQuota,
    imagesQuota,
    apiCallsQuota,
    hasWarning,
    hasExceeded,
    getQuotaPercentage,
    getQuotaStatus,
    fetchStats,
    fetchQuota,
    refresh,
  };
});
