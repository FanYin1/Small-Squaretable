<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { FunnelChart as EFunnelChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { FunnelStep } from '@client/services/analytics.api';

use([
  EFunnelChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

const props = withDefaults(defineProps<{
  data: FunnelStep[];
  loading?: boolean;
}>(), {
  loading: false,
});

const chartOption = computed(() => {
  const maxUsers = props.data.length > 0
    ? Math.max(...props.data.map((s) => s.users))
    : 1;

  return {
    tooltip: {
      trigger: 'item' as const,
      formatter: '{b}: {c} users ({d}%)',
    },
    legend: {
      data: props.data.map((s) => s.step),
      bottom: 0,
    },
    series: [
      {
        name: 'Conversion Funnel',
        type: 'funnel' as const,
        left: '10%',
        top: 20,
        bottom: 40,
        width: '80%',
        min: 0,
        max: maxUsers,
        sort: 'descending' as const,
        gap: 2,
        label: {
          show: true,
          position: 'inside' as const,
          formatter: '{b}\n{c}',
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 1,
        },
        emphasis: {
          label: {
            fontSize: 16,
          },
        },
        data: props.data.map((s) => ({
          name: s.step,
          value: s.users,
        })),
      },
    ],
  };
});
</script>

<template>
  <el-card shadow="hover" class="funnel-chart-card">
    <template #header>
      <span class="chart-title">Conversion Funnel</span>
    </template>
    <el-skeleton :loading="loading" animated :rows="8">
      <template #default>
        <VChart
          v-if="data.length > 0"
          :option="chartOption"
          autoresize
          class="chart"
        />
        <div v-else class="no-data">No funnel data available</div>
      </template>
    </el-skeleton>
  </el-card>
</template>

<style scoped>
.funnel-chart-card {
  border-radius: var(--border-radius-md);
}

.chart-title {
  font-size: var(--font-size-h5);
  font-weight: 600;
  color: var(--text-color-primary);
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
  color: var(--text-color-secondary);
  font-size: var(--font-size-body);
}
</style>
