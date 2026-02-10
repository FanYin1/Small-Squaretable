<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue';

const props = withDefaults(defineProps<{
  label: string;
  value: number | string;
  trend?: number;
  loading?: boolean;
  prefix?: string;
  suffix?: string;
}>(), {
  trend: 0,
  loading: false,
  prefix: '',
  suffix: '',
});

const trendDirection = computed(() => {
  if (props.trend > 0) return 'up';
  if (props.trend < 0) return 'down';
  return 'neutral';
});

const formattedValue = computed(() => {
  if (typeof props.value === 'string') return props.value;
  if (props.value >= 1_000_000) return `${(props.value / 1_000_000).toFixed(1)}M`;
  if (props.value >= 1_000) return `${(props.value / 1_000).toFixed(1)}K`;
  return props.value.toLocaleString();
});

const formattedTrend = computed(() => {
  return `${props.trend > 0 ? '+' : ''}${props.trend.toFixed(1)}%`;
});
</script>

<template>
  <el-card shadow="hover" class="metric-card" :body-style="{ padding: '20px' }">
    <el-skeleton :loading="loading" animated :rows="2">
      <template #default>
        <div class="metric-label">{{ label }}</div>
        <div class="metric-value">
          <span v-if="prefix" class="metric-prefix">{{ prefix }}</span>
          {{ formattedValue }}
          <span v-if="suffix" class="metric-suffix">{{ suffix }}</span>
        </div>
        <div
          v-if="trend !== 0"
          class="metric-trend"
          :class="`trend-${trendDirection}`"
        >
          <el-icon :size="14">
            <ArrowUp v-if="trendDirection === 'up'" />
            <ArrowDown v-if="trendDirection === 'down'" />
          </el-icon>
          <span>{{ formattedTrend }}</span>
        </div>
      </template>
    </el-skeleton>
  </el-card>
</template>

<style scoped>
.metric-card {
  border-radius: var(--border-radius-md);
  transition: transform 0.2s var(--ease-out);
}

.metric-card:hover {
  transform: translateY(-2px);
}

.metric-label {
  font-size: var(--font-size-body-sm);
  color: var(--text-color-secondary);
  margin-bottom: 8px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-color-primary);
  line-height: 1.2;
  margin-bottom: 8px;
}

.metric-prefix,
.metric-suffix {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.metric-trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-body-sm);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
}

.trend-up {
  color: var(--color-success);
  background: rgba(103, 194, 58, 0.1);
}

.trend-down {
  color: var(--color-danger);
  background: rgba(245, 108, 108, 0.1);
}
</style>
