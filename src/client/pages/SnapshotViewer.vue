<template>
  <div class="snapshot-viewer-page">
    <el-skeleton v-if="loading" :rows="10" animated />
    <el-empty v-else-if="expired" :description="t('share.snapshotExpired') || 'This snapshot has expired'" />
    <el-empty v-else-if="error" :description="t('share.snapshotNotFound') || 'Snapshot not found'" />
    <div v-else-if="snapshot" class="snapshot-content">
      <div class="snapshot-header">
        <div class="snapshot-character">
          <el-avatar :size="48" :src="snapshot.characterAvatar">
            {{ snapshot.characterName?.[0]?.toUpperCase() || '?' }}
          </el-avatar>
          <div class="snapshot-meta">
            <h1>{{ snapshot.title || snapshot.characterName || 'Chat Snapshot' }}</h1>
            <span class="snapshot-info">
              {{ snapshot.messageCount }} {{ t('share.messages') || 'messages' }}
              &middot;
              {{ new Date(snapshot.createdAt).toLocaleDateString() }}
            </span>
          </div>
        </div>
      </div>

      <div class="snapshot-messages">
        <div
          v-for="message in snapshot.messages"
          :key="message.id"
          class="snapshot-message"
          :class="{ 'message-user': message.role === 'user', 'message-assistant': message.role === 'assistant' }"
        >
          <div class="message-header">
            <el-avatar v-if="message.role === 'assistant'" :size="28" :src="snapshot.characterAvatar">
              {{ snapshot.characterName?.[0]?.toUpperCase() || '?' }}
            </el-avatar>
            <span class="message-role">
              {{ message.role === 'user' ? (t('share.you') || 'You') : (message.characterName || snapshot.characterName || 'Assistant') }}
            </span>
          </div>
          <div class="message-content">{{ message.content }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { shareApi } from '@client/services/share.api';
import type { ChatSnapshot } from '@client/types';

const route = useRoute();
const { t } = useI18n();

const token = computed(() => route.params.token as string);
const snapshot = ref<ChatSnapshot | null>(null);
const loading = ref(true);
const error = ref(false);
const expired = ref(false);

onMounted(async () => {
  try {
    snapshot.value = await shareApi.getSnapshot(token.value);
  } catch (e: any) {
    if (e?.status === 410 || e?.response?.status === 410) {
      expired.value = true;
    } else {
      error.value = true;
    }
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.snapshot-viewer-page {
  max-width: 800px;
  margin: 40px auto;
  padding: 0 20px;
}

.snapshot-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.snapshot-header {
  border-bottom: 1px solid var(--border-default);
  padding-bottom: 16px;
}

.snapshot-character {
  display: flex;
  align-items: center;
  gap: 12px;
}

.snapshot-meta h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.snapshot-info {
  font-size: 13px;
  color: var(--text-secondary);
}

.snapshot-messages {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.snapshot-message {
  padding: 12px 16px;
  border-radius: 12px;
}

.message-user {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  margin-left: 40px;
}

.message-assistant {
  background: var(--bg-surface);
  margin-right: 40px;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.message-role {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.message-content {
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--text-primary);
}
</style>
