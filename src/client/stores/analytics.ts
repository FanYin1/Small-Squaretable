/**
 * Analytics Dashboard Store
 *
 * Pinia composition store for analytics dashboard data.
 * Manages state for overview metrics, retention matrix, conversion funnel,
 * realtime stats, top characters, and user segments.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { createLogger } from '@client/utils/logger';
import {
  analyticsApi,
  type NorthStarMetric,
  type RetentionRow,
  type FunnelStep,
  type TopCharacter,
  type RealtimeMetrics,
  type UserSegment,
} from '@client/services/analytics.api';

const logger = createLogger('AnalyticsStore');

export const useAnalyticsStore = defineStore('analytics', () => {
  // ── State ──

  const overview = ref<NorthStarMetric[]>([]);
  const retention = ref<RetentionRow[]>([]);
  const funnel = ref<FunnelStep[]>([]);
  const realtime = ref<RealtimeMetrics | null>(null);
  const topCharacters = ref<TopCharacter[]>([]);
  const segments = ref<UserSegment[]>([]);

  // Loading states (per-section for granular UI control)
  const loadingOverview = ref(false);
  const loadingRetention = ref(false);
  const loadingFunnel = ref(false);
  const loadingRealtime = ref(false);
  const loadingTopCharacters = ref(false);
  const loadingSegments = ref(false);

  // Error states
  const error = ref<string | null>(null);

  // ── Getters ──

  const isLoading = computed(() =>
    loadingOverview.value ||
    loadingRetention.value ||
    loadingFunnel.value ||
    loadingRealtime.value ||
    loadingTopCharacters.value ||
    loadingSegments.value
  );
  const hasData = computed(() => overview.value.length > 0);

  // Latest week's metrics for quick summary
  const latestMetrics = computed(() => {
    if (overview.value.length === 0) return null;
    return overview.value[0]; // sorted DESC by week from backend
  });

  // Total users across all segments
  const totalSegmentedUsers = computed(() =>
    segments.value.reduce((sum, s) => sum + s.user_count, 0)
  );

  // ── Actions ──

  async function fetchOverview(weeks?: number) {
    if (loadingOverview.value) return;
    loadingOverview.value = true;
    try {
      const result = await analyticsApi.getOverview(weeks);
      overview.value = result.metrics;
    } catch (e: unknown) {
      logger.error('Failed to fetch overview metrics', e);
      error.value = 'Failed to load overview metrics';
    } finally {
      loadingOverview.value = false;
    }
  }

  async function fetchRetention(cohortWeeks?: number) {
    if (loadingRetention.value) return;
    loadingRetention.value = true;
    try {
      const result = await analyticsApi.getRetention(cohortWeeks);
      retention.value = result.matrix;
    } catch (e: unknown) {
      logger.error('Failed to fetch retention matrix', e);
      error.value = 'Failed to load retention data';
    } finally {
      loadingRetention.value = false;
    }
  }

  async function fetchFunnel(days?: number) {
    if (loadingFunnel.value) return;
    loadingFunnel.value = true;
    try {
      const result = await analyticsApi.getFunnel(days);
      funnel.value = result.steps;
    } catch (e: unknown) {
      logger.error('Failed to fetch funnel data', e);
      error.value = 'Failed to load funnel data';
    } finally {
      loadingFunnel.value = false;
    }
  }

  async function fetchRealtime() {
    loadingRealtime.value = true;
    try {
      realtime.value = await analyticsApi.getRealtime();
    } catch (e: unknown) {
      logger.error('Failed to fetch realtime metrics', e);
      error.value = 'Failed to load realtime metrics';
    } finally {
      loadingRealtime.value = false;
    }
  }

  async function fetchTopCharacters(limit = 20) {
    if (loadingTopCharacters.value) return;
    loadingTopCharacters.value = true;
    try {
      const result = await analyticsApi.getTopCharacters(limit);
      topCharacters.value = result.characters;
    } catch (e: unknown) {
      logger.error('Failed to fetch top characters', e);
      error.value = 'Failed to load top characters';
    } finally {
      loadingTopCharacters.value = false;
    }
  }

  async function fetchSegments() {
    if (loadingSegments.value) return;
    loadingSegments.value = true;
    try {
      const result = await analyticsApi.getSegments();
      segments.value = result.segments;
    } catch (e: unknown) {
      logger.error('Failed to fetch user segments', e);
      error.value = 'Failed to load user segments';
    } finally {
      loadingSegments.value = false;
    }
  }

  /** Fetch all analytics data in parallel. */
  async function fetchAll() {
    error.value = null;
    await Promise.allSettled([
      fetchOverview(),
      fetchRetention(),
      fetchFunnel(),
      fetchRealtime(),
      fetchTopCharacters(),
      fetchSegments(),
    ]);
  }

  /** Clear all analytics data (e.g. on logout). */
  function $reset() {
    overview.value = [];
    retention.value = [];
    funnel.value = [];
    realtime.value = null;
    topCharacters.value = [];
    segments.value = [];
    error.value = null;
  }

  return {
    // State
    overview,
    retention,
    funnel,
    realtime,
    topCharacters,
    segments,
    error,

    // Loading states
    loadingOverview,
    loadingRetention,
    loadingFunnel,
    loadingRealtime,
    loadingTopCharacters,
    loadingSegments,
    isLoading,

    // Getters
    hasData,
    latestMetrics,
    totalSegmentedUsers,

    // Actions
    fetchOverview,
    fetchRetention,
    fetchFunnel,
    fetchRealtime,
    fetchTopCharacters,
    fetchSegments,
    fetchAll,
    $reset,
  };
});
