<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { socialApi } from '@client/services/social.api';
import { useUserStore } from '@client/stores/user';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('FollowButton');

const props = defineProps<{
  userId: string;
}>();

const { t } = useI18n();
const userStore = useUserStore();

const isFollowing = ref(false);
const followerCount = ref(0);
const loading = ref(false);
const initialLoading = ref(true);

const isOwnProfile = computed(() => userStore.user?.id === props.userId);

onMounted(async () => {
  if (isOwnProfile.value) {
    initialLoading.value = false;
    return;
  }
  try {
    const status = await socialApi.getFollowStatus(props.userId);
    isFollowing.value = status.isFollowing;
    followerCount.value = status.followerCount;
  } catch (error: unknown) {
    logger.error('Failed to fetch follow status', error);
  } finally {
    initialLoading.value = false;
  }
});

async function toggleFollow() {
  if (loading.value) return;
  loading.value = true;
  try {
    if (isFollowing.value) {
      await socialApi.unfollow(props.userId);
      isFollowing.value = false;
      followerCount.value = Math.max(0, followerCount.value - 1);
    } else {
      await socialApi.follow(props.userId);
      isFollowing.value = true;
      followerCount.value += 1;
    }
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('common.retry'));
    logger.error('Failed to toggle follow', error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-button
    v-if="!isOwnProfile"
    :type="isFollowing ? 'default' : 'primary'"
    :loading="loading || initialLoading"
    class="follow-button"
    @click="toggleFollow"
  >
    {{ isFollowing ? t('social.following') : t('social.follow') }}
  </el-button>
</template>

<style scoped>
.follow-button {
  min-width: 90px;
}
</style>
