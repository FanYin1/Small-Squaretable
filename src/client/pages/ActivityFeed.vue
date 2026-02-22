<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSocialStore } from '@client/stores/social';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import ActivityItem from '@client/components/social/ActivityItem.vue';

const { t } = useI18n();
const socialStore = useSocialStore();

onMounted(() => {
  socialStore.fetchFeed();
});

function loadMore() {
  socialStore.fetchMoreFeed();
}
</script>

<template>
  <DashboardLayout>
    <template #title>{{ t('activity.feedTitle') }}</template>

    <div class="activity-feed">
      <!-- Loading skeleton -->
      <div v-if="socialStore.feedLoading && socialStore.activities.length === 0" class="feed-skeleton">
        <el-skeleton v-for="i in 5" :key="i" :rows="1" animated class="skeleton-item" />
      </div>

      <!-- Empty state -->
      <div v-else-if="socialStore.activities.length === 0" class="empty-state">
        <p>{{ t('activity.feedEmpty') }}</p>
      </div>

      <!-- Activity list -->
      <template v-else>
        <div class="feed-list">
          <ActivityItem
            v-for="activity in socialStore.activities"
            :key="activity.id"
            :activity="activity"
          />
        </div>

        <!-- Load more -->
        <div v-if="socialStore.hasMore" class="load-more">
          <el-button
            :loading="socialStore.feedLoading"
            @click="loadMore"
          >
            {{ t('social.loadMore') }}
          </el-button>
        </div>
      </template>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.activity-feed {
  max-width: 720px;
  margin: 0 auto;
}

.feed-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-item {
  padding: 16px;
  border-radius: 10px;
  border: 1px solid var(--border-default);
  background: var(--bg-base);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}
</style>
