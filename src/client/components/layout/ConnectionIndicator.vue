<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loading, WarningFilled, Link } from '@element-plus/icons-vue';
import { useChatStore } from '@client/stores/chat';
import { WSConnectionState } from '../../../types/websocket';

const { t } = useI18n();
const chatStore = useChatStore();

const state = computed(() => chatStore.wsConnectionState);

const isConnected = computed(() => state.value === WSConnectionState.CONNECTED);
const isReconnecting = computed(
  () => state.value === WSConnectionState.RECONNECTING || state.value === WSConnectionState.CONNECTING
);
const isError = computed(() => state.value === WSConnectionState.ERROR);

const showIndicator = computed(() => !isConnected.value);

const statusLabel = computed(() => {
  if (isReconnecting.value) return t('ws.reconnecting');
  if (isError.value) return t('ws.connectionError');
  return t('ws.disconnected');
});

const statusColor = computed(() => {
  if (isReconnecting.value) return 'var(--color-warning)';
  if (isError.value) return 'var(--color-danger)';
  return 'var(--text-tertiary)';
});
</script>

<template>
  <el-tooltip
    v-if="showIndicator"
    :content="statusLabel"
    placement="bottom"
    :show-after="300"
  >
    <div
      class="connection-indicator"
      role="status"
      :aria-label="statusLabel"
      :style="{ color: statusColor }"
    >
      <el-icon v-if="isReconnecting" :size="16" class="is-loading"><Loading /></el-icon>
      <el-icon v-else-if="isError" :size="16"><WarningFilled /></el-icon>
      <el-icon v-else :size="16"><Link /></el-icon>
    </div>
  </el-tooltip>
</template>

<style scoped>
.connection-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  cursor: default;
  transition: all 0.2s ease;
}
</style>
