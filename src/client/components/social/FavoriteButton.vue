<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Star, StarFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { socialApi } from '@client/services/social.api';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('FavoriteButton');

const props = withDefaults(defineProps<{
  characterId: string;
  showCount?: boolean;
}>(), {
  showCount: true,
});

const { t } = useI18n();

const isFavorited = ref(false);
const favoriteCount = ref(0);
const loading = ref(false);
const initialLoading = ref(true);

async function fetchStatus() {
  initialLoading.value = true;
  try {
    const status = await socialApi.getFavoriteStatus(props.characterId);
    isFavorited.value = status.isFavorited;
    favoriteCount.value = status.favoriteCount;
  } catch (error: unknown) {
    logger.error('Failed to fetch favorite status', error);
  } finally {
    initialLoading.value = false;
  }
}

onMounted(fetchStatus);

watch(() => props.characterId, fetchStatus);

async function toggleFavorite() {
  if (loading.value) return;

  // Optimistic update
  const prevFavorited = isFavorited.value;
  const prevCount = favoriteCount.value;
  isFavorited.value = !prevFavorited;
  favoriteCount.value = prevFavorited
    ? Math.max(0, prevCount - 1)
    : prevCount + 1;

  loading.value = true;
  try {
    if (prevFavorited) {
      await socialApi.unfavorite(props.characterId);
    } else {
      await socialApi.favorite(props.characterId);
    }
  } catch (error: unknown) {
    // Revert on error
    isFavorited.value = prevFavorited;
    favoriteCount.value = prevCount;
    ElMessage.error(error instanceof Error ? error.message : t('common.retry'));
    logger.error('Failed to toggle favorite', error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-button
    :icon="isFavorited ? StarFilled : Star"
    :loading="initialLoading"
    :class="['favorite-button', { 'is-favorited': isFavorited }]"
    @click="toggleFavorite"
  >
    <span v-if="showCount" class="favorite-count">{{ favoriteCount }}</span>
  </el-button>
</template>

<style scoped>
.favorite-button {
  min-width: 60px;
}

.favorite-button.is-favorited {
  color: var(--el-color-warning);
  border-color: var(--el-color-warning);
}

.favorite-button.is-favorited:hover {
  color: var(--el-color-warning);
  border-color: var(--el-color-warning);
  opacity: 0.8;
}

.favorite-count {
  margin-left: 4px;
}
</style>
