<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { UserFilled, Star, ChatDotRound, Plus } from '@element-plus/icons-vue';
import { useDateTime } from '@client/composables/useDateTime';
import type { ActivityItem as ActivityItemType } from '@client/stores/social';

const props = defineProps<{
  activity: ActivityItemType;
}>();

const router = useRouter();
const { t } = useI18n();
const { formatRelativeTime } = useDateTime();

const metadata = computed(() => (props.activity.metadata ?? {}) as Record<string, string>);

const avatarUrl = computed(() =>
  metadata.value.avatarUrl ||
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${props.activity.userId}`
);

const displayName = computed(() =>
  metadata.value.displayName || props.activity.userId.slice(0, 8) + '...'
);

const targetName = computed(() =>
  metadata.value.targetName || props.activity.targetId?.slice(0, 8) || ''
);

const activityIcon = computed(() => {
  switch (props.activity.type) {
    case 'follow': return UserFilled;
    case 'favorite': return Star;
    case 'comment': return ChatDotRound;
    case 'create_character': return Plus;
    default: return ChatDotRound;
  }
});

const activityDescription = computed(() => {
  switch (props.activity.type) {
    case 'follow':
      return t('activity.followed', { name: targetName.value });
    case 'favorite':
      return t('activity.favorited', { name: targetName.value });
    case 'comment':
      return t('activity.commented', { name: targetName.value });
    case 'create_character':
      return t('activity.createdCharacter', { name: targetName.value });
    default:
      return props.activity.type;
  }
});

function handleClick() {
  const { type, targetType, targetId } = props.activity;
  if (!targetId) return;

  if (type === 'follow' || targetType === 'user') {
    router.push({ name: 'UserProfile', params: { userId: targetId } });
  } else if (targetType === 'character' || type === 'favorite' || type === 'create_character') {
    router.push({ name: 'CharacterDetail', params: { id: targetId } });
  } else if (type === 'comment' && targetType === 'character') {
    router.push({ name: 'CharacterDetail', params: { id: targetId } });
  }
}
</script>

<template>
  <div
    class="activity-item"
    role="button"
    tabindex="0"
    @click="handleClick"
    @keydown.enter="handleClick"
  >
    <el-avatar :size="40" :src="avatarUrl" class="activity-avatar" />
    <div class="activity-body">
      <div class="activity-header">
        <span class="activity-user">{{ displayName }}</span>
        <el-icon class="activity-type-icon" :size="14">
          <component :is="activityIcon" />
        </el-icon>
      </div>
      <p class="activity-description">{{ activityDescription }}</p>
    </div>
    <span class="activity-time">{{ formatRelativeTime(activity.createdAt) }}</span>
  </div>
</template>

<style scoped>
.activity-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--border-default);
  background: var(--bg-base);
  cursor: pointer;
  transition: all 0.2s ease;
}

.activity-item:hover {
  border-color: var(--accent-purple);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent-purple) 10%, transparent);
}

.activity-item:focus-visible {
  outline: 2px solid var(--accent-purple);
  outline-offset: 2px;
}

.activity-avatar {
  flex-shrink: 0;
}

.activity-body {
  flex: 1;
  min-width: 0;
}

.activity-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.activity-user {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.activity-type-icon {
  color: var(--text-secondary);
}

.activity-description {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

@media (max-width: 767px) {
  .activity-item {
    padding: 12px;
  }

  .activity-time {
    font-size: 11px;
  }
}
</style>
