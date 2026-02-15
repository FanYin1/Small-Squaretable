<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { RetentionRow } from '@client/services/analytics.api';

use([
  HeatmapChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

const props = withDefaults(defineProps<{
  data: RetentionRow[];
  loading?: boolean;
}>(), {
  loading: false,
});

const chartOption = computed(() => {
  // Extract unique cohort weeks (Y-axis) and week offsets (X-axis)
  const cohorts = [...new Set(props.data.map((r) => r.cohort_week))].sort();
  const offsets = [...new Set(props.data.map((r) => r.week_offset))].sort(
    (a, b) => a - b
  );

  const offsetLabels = offsets.map((o) => `Week ${o}`);
  const maxUsers = props.data.length > 0
    ? Math.max(...props.data.map((r) => r.users))
    : 1;

  // Build heatmap data: [xIndex, yIndex, value]
  const heatmapData = props.data.map((r) => {
    const x = offsets.indexOf(r.week_offset);
    const y = cohorts.indexOf(r.cohort_week);
    return [x, y, r.users];
  });

  return {
    tooltip: {
      position: 'top' as const,
      formatter: (params: { value: number[] }) => {
        const [xIdx, yIdx, val] = params.value;
        return `Cohort: ${cohorts[yIdx]}<br/>Week ${offsets[xIdx]}: ${val} users`;
      },
    },
    grid: {
      left: '12%',
      right: '8%',
      bottom: '15%',
      top: '5%',
    },
    xAxis: {
      type: 'category' as const,
      data: offsetLabels,
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category' as const,
      data: cohorts,
      splitArea: { show: true },
    },
    visualMap: {
      min: 0,
      max: maxUsers,
      calculable: true,
      orient: 'horizontal' as const,
      left: 'center',
      bottom: 0,
      inRange: {
        color: ['#EFF6FF', '#3B82F6', '#1E3A8A'],
      },
    },
    series: [
      {
        name: 'Retention',
        type: 'heatmap' as const,
        data: heatmapData,
        label: {
          show: true,
          fontSize: 11,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  };
});
</script>

<template>
  <el-card shadow="hover" class="heatmap-card">
    <template #header>
      <span class="chart-title">{{ $t('analytics.cohortRetention') }}</span>
    </template>
    <el-skeleton :loading="loading" animated :rows="8">
      <template #default>
        <VChart
          v-if="data.length > 0"
          :option="chartOption"
          autoresize
          class="chart"
        />
        <div v-else class="no-data">{{ $t('analytics.noRetentionData') }}</div>
      </template>
    </el-skeleton>
  </el-card>
</template>

<style scoped>
.heatmap-card {
  border-radius: var(--border-radius-md);
}

.chart-title {
  font-size: var(--font-size-h5);
  font-weight: 600;
  color: var(--text-color-primary);
}

.chart {
  width: 100%;
  height: 400px;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: var(--text-color-secondary);
  font-size: var(--font-size-body);
}
</style>
