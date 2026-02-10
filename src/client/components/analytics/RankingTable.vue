<script setup lang="ts">
import type { TopCharacter } from '@client/services/analytics.api';

const props = withDefaults(defineProps<{
  data: TopCharacter[];
  loading?: boolean;
}>(), {
  loading: false,
});

function formatNumber(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString();
}

function ratingColor(rating: number): string {
  if (rating >= 4.5) return 'success';
  if (rating >= 3.5) return '';
  if (rating >= 2.5) return 'warning';
  return 'danger';
}
</script>

<template>
  <el-card shadow="hover" class="ranking-card">
    <template #header>
      <span class="chart-title">Top Characters</span>
    </template>
    <el-table
      v-loading="loading"
      :data="data"
      stripe
      style="width: 100%"
      :empty-text="'No character data available'"
    >
      <el-table-column label="Rank" width="70" align="center">
        <template #default="{ $index }">
          <span class="rank" :class="{ 'rank-top': $index < 3 }">
            {{ $index + 1 }}
          </span>
        </template>
      </el-table-column>
      <el-table-column
        prop="character_id"
        label="Character ID"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column label="Messages" width="120" align="right">
        <template #default="{ row }">
          {{ formatNumber(row.total_messages) }}
        </template>
      </el-table-column>
      <el-table-column label="Chat Starts" width="120" align="right">
        <template #default="{ row }">
          {{ formatNumber(row.total_chat_starts) }}
        </template>
      </el-table-column>
      <el-table-column label="Avg Rating" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="ratingColor(row.avg_rating)" size="small">
            {{ row.avg_rating.toFixed(1) }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<style scoped>
.ranking-card {
  border-radius: var(--border-radius-md);
}

.chart-title {
  font-size: var(--font-size-h5);
  font-weight: 600;
  color: var(--text-color-primary);
}

.rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-secondary);
  background: var(--bg-color-page);
}

.rank-top {
  color: #fff;
  background: var(--color-primary);
}
</style>
