<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Star, StarFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { socialApi } from '@client/services/social.api';
import { createLogger } from '@client/utils/logger';
import { useUserStore } from '@client/stores/user';

const logger = createLogger('FavoriteButton');

const props = withDefaults(defineProps<{
  characterId: string;
  showCount?: boolean;
  characterName?: string;
}>(), {
  showCount: true,
});

const { t } = useI18n();
const userStore = useUserStore();
const route = useRoute();
const router = useRouter();
const owner = computed(() => userStore.isAuthenticated && userStore.user
  ? JSON.stringify([userStore.user.tenantId, userStore.user.id]) : null);

const isFavorited = ref(false);
const favoriteCount = ref(0);
const loading = ref(false);
const initialLoading = ref(true);
const statusFailed = ref(false);
let version = 0;

async function fetchStatus() {
  const currentVersion = ++version;
  isFavorited.value = false;
  favoriteCount.value = 0;
  loading.value = false;
  statusFailed.value = false;
  initialLoading.value = false;
  if (!owner.value) return;
  initialLoading.value = true;
  try {
    const status = await socialApi.getFavoriteStatus(props.characterId);
    if (currentVersion !== version) return;
    isFavorited.value = status.isFavorited;
    favoriteCount.value = status.favoriteCount;
  } catch (error: unknown) {
    if (currentVersion !== version) return;
    statusFailed.value = true;
    logger.error('Failed to fetch favorite status', error);
  } finally {
    if (currentVersion === version) initialLoading.value = false;
  }
}

watch([() => props.characterId, owner], fetchStatus, { immediate: true, flush: 'sync' });
onScopeDispose(() => { version += 1; });

async function toggleFavorite() {
  if (loading.value || initialLoading.value) return;
  if (!owner.value) {
    await router.push({ name: 'Login', query: { redirect: route.fullPath } });
    return;
  }
  if (statusFailed.value) {
    await fetchStatus();
    return;
  }
  const currentVersion = version;

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
    if (currentVersion !== version) return;
    isFavorited.value = prevFavorited;
    favoriteCount.value = prevCount;
    ElMessage.error(error instanceof Error ? error.message : t('common.retry'));
    logger.error('Failed to toggle favorite', error);
  } finally {
    if (currentVersion === version) loading.value = false;
  }
}
</script>

<template>
  <el-button
    :icon="isFavorited ? StarFilled : Star"
    :loading="initialLoading || loading"
    :disabled="initialLoading || loading"
    :aria-pressed="isFavorited"
    :aria-label="`${statusFailed ? t('market.discovery.retryFavorite') : t(isFavorited ? 'social.unfavorite' : 'social.favorite')} ${characterName || ''}`.trim()"
    :title="statusFailed ? t('market.discovery.retryFavorite') : t(isFavorited ? 'social.unfavorite' : 'social.favorite')"
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
