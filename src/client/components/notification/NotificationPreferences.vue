<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import {
  notificationPreferencesApi,
  type NotificationPreference,
} from '@client/services/notification-preferences.api';
import { pushService } from '@client/services/push.service';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const { t } = useI18n();

const preferences = ref<NotificationPreference[]>([]);
const saving = ref(false);
const loading = ref(false);

const pushSupported = ref(false);
const pushEnabled = ref(false);
const pushLoading = ref(false);

onMounted(async () => {
  pushSupported.value = 'serviceWorker' in navigator && 'PushManager' in window;
  if (pushSupported.value) {
    pushEnabled.value = await pushService.isSubscribed();
  }
});

async function togglePush() {
  pushLoading.value = true;
  try {
    if (pushEnabled.value) {
      await pushService.unsubscribe();
      pushEnabled.value = false;
    } else {
      const success = await pushService.subscribe();
      pushEnabled.value = success;
    }
  } finally {
    pushLoading.value = false;
  }
}

const typeKeyMap: Record<string, string> = {
  follow: 'follow',
  favorite: 'favorite',
  comment: 'comment',
  reply: 'reply',
  mention: 'mention',
  collaborator_invite: 'collaboratorInvite',
  collaborator_role_change: 'collaboratorRoleChange',
  collaborator_removed: 'collaboratorRemoved',
  character_forked: 'characterForked',
  system: 'system',
};

async function loadPreferences() {
  loading.value = true;
  try {
    preferences.value = await notificationPreferencesApi.getPreferences();
  } catch {
    ElMessage.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function savePreferences() {
  saving.value = true;
  try {
    const payload = preferences.value.map((p) => ({
      type: p.notificationType,
      inApp: p.inApp,
      email: p.email,
      emailFrequency: p.emailFrequency,
    }));
    await notificationPreferencesApi.bulkUpdatePreferences(payload);
    ElMessage.success(t('notificationPrefs.saved'));
    emit('update:modelValue', false);
  } catch {
    ElMessage.error(t('common.updateFailed'));
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) loadPreferences();
  },
);

onMounted(() => {
  if (props.modelValue) loadPreferences();
});
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="t('notificationPrefs.title')"
    width="600px"
  >
    <div v-if="pushSupported" class="push-section">
      <div class="push-row">
        <span>{{ t('notifications.pushNotifications') }}</span>
        <el-switch v-model="pushEnabled" :loading="pushLoading" @change="togglePush" />
      </div>
      <el-divider />
    </div>
    <div v-else class="push-unsupported">
      <el-text type="info" size="small">{{ t('notifications.pushUnsupported') }}</el-text>
    </div>
    <el-table v-loading="loading" :data="preferences" style="width: 100%">
      <el-table-column prop="notificationType" :label="t('notificationPrefs.type')" width="200">
        <template #default="{ row }">
          {{ t(`notificationPrefs.${typeKeyMap[row.notificationType] || row.notificationType}`) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('notificationPrefs.inApp')" width="100">
        <template #default="{ row }">
          <el-switch v-model="row.inApp" />
        </template>
      </el-table-column>
      <el-table-column :label="t('notificationPrefs.email')" width="100">
        <template #default="{ row }">
          <el-switch v-model="row.email" />
        </template>
      </el-table-column>
      <el-table-column :label="t('notificationPrefs.emailFrequency')">
        <template #default="{ row }">
          <el-select v-model="row.emailFrequency" size="small" :disabled="!row.email">
            <el-option value="immediate" :label="t('notificationPrefs.immediate')" />
            <el-option value="daily" :label="t('notificationPrefs.daily')" />
            <el-option value="weekly" :label="t('notificationPrefs.weekly')" />
            <el-option value="never" :label="t('notificationPrefs.never')" />
          </el-select>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="savePreferences" :loading="saving">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.push-section {
  margin-bottom: 8px;
}

.push-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}
</style>
