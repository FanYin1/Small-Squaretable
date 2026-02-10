<script setup lang="ts">
import { computed } from 'vue';
import { useAnalyticsStore } from '@client/stores/analytics';
import MetricCard from '@client/components/analytics/MetricCard.vue';
import TrendChart from '@client/components/analytics/TrendChart.vue';
import RetentionHeatmap from '@client/components/analytics/RetentionHeatmap.vue';
import FunnelChart from '@client/components/analytics/FunnelChart.vue';

const store = useAnalyticsStore();

const wauValue = computed(() => store.latestMetrics?.weekly_active_users ?? 0);
const messagesValue = computed(() => store.latestMetrics?.weekly_messages ?? 0);

// Calculate week-over-week trend for WAU
const wauTrend = computed(() => {
  if (store.overview.length < 2) return 0;
  const sorted = [...store.overview].sort(
    (a, b) => new Date(b.week).getTime() - new Date(a.week).getTime()
  );
  const current = sorted[0].weekly_active_users;
  const previous = sorted[1].weekly_active_users;
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
});

// Calculate week-over-week trend for messages
const messagesTrend = computed(() => {
  if (store.overview.length < 2) return 0;
  const sorted = [...store.overview].sort(
    (a, b) => new Date(b.week).getTime() - new Date(a.week).getTime()
  );
  const current = sorted[0].weekly_messages;
  const previous = sorted[1].weekly_messages;
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
});
</script>

<template>
  <div class="executive-overview">
    <!-- North Star Metrics -->
    <div class="metrics-row">
      <MetricCard
        label="Weekly Active Users"
        :value="wauValue"
        :trend="wauTrend"
        :loading="store.loadingOverview"
      />
      <MetricCard
        label="Weekly Messages"
        :value="messagesValue"
        :trend="messagesTrend"
        :loading="store.loadingOverview"
      />
    </div>

    <!-- Trend Chart -->
    <TrendChart
      :data="store.overview"
      :loading="store.loadingOverview"
      class="section"
    />

    <!-- Retention + Funnel row -->
    <div class="charts-row">
      <RetentionHeatmap
        :data="store.retention"
        :loading="store.loadingRetention"
        class="chart-half"
      />
      <FunnelChart
        :data="store.funnel"
        :loading="store.loadingFunnel"
        class="chart-half"
      />
    </div>
  </div>
</template>

<style scoped>
.executive-overview {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.section {
  width: 100%;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chart-half {
  min-width: 0;
}

@media (max-width: 1024px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}
</style>
