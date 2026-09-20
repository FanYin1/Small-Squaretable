<script setup lang="ts">
import { useAnalyticsStore } from '@client/stores/analytics';
import MetricCard from '@client/components/analytics/MetricCard.vue';
import RankingTable from '@client/components/analytics/RankingTable.vue';

const store = useAnalyticsStore();
</script>

<template>
  <div class="product-metrics">
    <!-- Realtime Metrics -->
    <div class="metrics-row">
      <MetricCard
        :label="$t('analytics.activeUsersRealtime')"
        :value="store.realtime?.activeUsers ?? 0"
        :loading="store.loadingRealtime"
      />
      <MetricCard
        :label="$t('analytics.eventsPerMin')"
        :value="store.realtime?.eventsPerMin ?? 0"
        :loading="store.loadingRealtime"
        suffix="/min"
      />
      <MetricCard
        :label="$t('analytics.messagesPerMin')"
        :value="store.realtime?.messagesPerMin ?? 0"
        :loading="store.loadingRealtime"
        suffix="/min"
      />
    </div>

    <!-- User Segments -->
    <el-card shadow="hover" class="segments-card">
      <template #header>
        <div class="segment-header">
          <span class="chart-title">{{ $t('analytics.userSegments') }}</span>
          <el-tag type="info" size="small">
            {{ store.totalSegmentedUsers.toLocaleString() }} total users
          </el-tag>
        </div>
      </template>
      <el-skeleton :loading="store.loadingSegments" animated :rows="3">
        <template #default>
          <div v-if="store.segments.length > 0" class="segments-grid">
            <div
              v-for="seg in store.segments"
              :key="seg.segment"
              class="segment-item"
            >
              <div class="segment-name">{{ seg.segment }}</div>
              <div class="segment-count">{{ seg.user_count.toLocaleString() }}</div>
              <el-progress
                :percentage="store.totalSegmentedUsers > 0
                  ? Math.round((seg.user_count / store.totalSegmentedUsers) * 100)
                  : 0"
                :stroke-width="8"
                :show-text="true"
              />
            </div>
          </div>
          <div v-else class="no-data">{{ $t('analytics.noSegmentData') }}</div>
        </template>
      </el-skeleton>
    </el-card>

    <!-- Top Characters Ranking -->
    <RankingTable
      :data="store.topCharacters"
      :loading="store.loadingTopCharacters"
    />
  </div>
</template>

<style scoped>
.product-metrics {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.segments-card {
  border-radius: var(--border-radius-md);
}

.segment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chart-title {
  font-size: var(--font-size-h5);
  font-weight: 600;
  color: var(--text-primary);
}

.segments-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.segment-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.segment-name {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
  text-transform: capitalize;
}

.segment-count {
  font-size: var(--font-size-body-sm);
  color: var(--text-secondary);
}

.no-data {
  text-align: center;
  padding: 40px 0;
  color: var(--text-secondary);
}
</style>
