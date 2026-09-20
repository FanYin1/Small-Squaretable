<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { NorthStarMetric } from '@client/services/analytics.api';

use([
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer,
]);

const props = withDefaults(defineProps<{
  data: NorthStarMetric[];
  loading?: boolean;
}>(), {
  loading: false,
});

const chartOption = computed(() => {
  const sorted = [...props.data].sort(
    (a, b) => new Date(a.week).getTime() - new Date(b.week).getTime()
  );
  const weeks = sorted.map((m) => m.week);
  const wau = sorted.map((m) => m.weekly_active_users);
  const messages = sorted.map((m) => m.weekly_messages);

  return {
    tooltip: {
      trigger: 'axis' as const,
    },
    legend: {
      data: ['Weekly Active Users', 'Weekly Messages'],
      bottom: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      data: weeks,
    },
    yAxis: [
      {
        type: 'value' as const,
        name: 'Users',
        position: 'left' as const,
      },
      {
        type: 'value' as const,
        name: 'Messages',
        position: 'right' as const,
      },
    ],
    series: [
      {
        name: 'Weekly Active Users',
        type: 'line' as const,
        yAxisIndex: 0,
        smooth: true,
        data: wau,
        itemStyle: { color: '#3B82F6' },
        areaStyle: { color: 'rgba(59, 130, 246, 0.1)' },
      },
      {
        name: 'Weekly Messages',
        type: 'line' as const,
        yAxisIndex: 1,
        smooth: true,
        data: messages,
        itemStyle: { color: '#22C55E' },
        areaStyle: { color: 'rgba(34, 197, 94, 0.1)' },
      },
    ],
  };
});
</script>

<template>
  <el-card shadow="hover" class="trend-chart-card">
    <template #header>
      <span class="chart-title">{{ $t('analytics.trendOverview') }}</span>
    </template>
    <el-skeleton :loading="loading" animated :rows="8">
      <template #default>
        <VChart
          v-if="data.length > 0"
          :option="chartOption"
          autoresize
          class="chart"
        />
        <div v-else class="no-data">{{ $t('analytics.noTrendData') }}</div>
      </template>
    </el-skeleton>
  </el-card>
</template>

<style scoped>
.trend-chart-card {
  border-radius: var(--border-radius-md);
}

.chart-title {
  font-size: var(--font-size-h5);
  font-weight: 600;
  color: var(--text-primary);
}

.chart {
  width: 100%;
  height: 350px;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 350px;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}
</style>
