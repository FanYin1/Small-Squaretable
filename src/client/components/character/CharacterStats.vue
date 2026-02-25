<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { View, Download, Star, ChatDotRound, StarFilled } from '@element-plus/icons-vue';

const props = defineProps<{
  character: {
    viewCount: number;
    downloadCount: number;
    favoriteCount: number;
    commentCount: number;
    ratingAvg: number | string | null;
    ratingCount: number;
  };
}>();

const { t } = useI18n();

const stats = computed(() => [
  { label: t('characterStats.views'), value: props.character.viewCount ?? 0, icon: View },
  { label: t('characterStats.downloads'), value: props.character.downloadCount ?? 0, icon: Download },
  { label: t('characterStats.favorites'), value: props.character.favoriteCount ?? 0, icon: Star },
  { label: t('characterStats.comments'), value: props.character.commentCount ?? 0, icon: ChatDotRound },
  {
    label: t('characterStats.rating'),
    value: props.character.ratingAvg
      ? `${Number(props.character.ratingAvg).toFixed(1)} (${props.character.ratingCount})`
      : '-',
    icon: StarFilled,
  },
]);
</script>

<template>
  <div class="character-stats">
    <h3 class="stats-title">{{ t('characterStats.stats') }}</h3>
    <div class="stats-grid">
      <div v-for="stat in stats" :key="stat.label" class="stat-card">
        <el-icon class="stat-icon"><component :is="stat.icon" /></el-icon>
        <div class="stat-value">{{ stat.value }}</div>
        <div class="stat-label">{{ stat.label }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-stats {
  margin-top: 16px;
}

.stats-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--el-text-color-primary, #303133);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 8px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter, #fafafa);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.stat-icon {
  font-size: 20px;
  color: var(--el-color-primary, #409eff);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary, #303133);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
</style>
