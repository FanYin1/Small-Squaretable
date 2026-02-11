<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Download, Delete, Setting } from '@element-plus/icons-vue';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import { gdprApi } from '@client/services/gdpr.api';
import type { DeletionStatus, ConsentPreferences } from '@client/services/gdpr.api';

const { t } = useI18n();

// ── Data Export ──
const exporting = ref(false);

async function handleExportData() {
  exporting.value = true;
  try {
    const blob = await gdprApi.exportData();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-export-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ElMessage.success(t('accountSettings.exportSuccess'));
  } catch {
    ElMessage.error(t('accountSettings.exportFailed'));
  } finally {
    exporting.value = false;
  }
}

// ── Account Deletion ──
const deletionStatus = reactive<DeletionStatus>({
  pending: false,
  requestedAt: null,
  scheduledAt: null,
});
const deleteDialogVisible = ref(false);
const deletePassword = ref('');
const deletingAccount = ref(false);
const cancellingDeletion = ref(false);

async function fetchDeletionStatus() {
  try {
    const status = await gdprApi.getDeletionStatus();
    Object.assign(deletionStatus, status);
  } catch {
    // Silently fail — status defaults to not pending
  }
}
async function handleRequestDeletion() {
  if (!deletePassword.value) {
    ElMessage.warning(t('accountSettings.passwordRequired'));
    return;
  }
  deletingAccount.value = true;
  try {
    await gdprApi.requestDeletion(deletePassword.value);
    ElMessage.success(t('accountSettings.deletionRequested'));
    deleteDialogVisible.value = false;
    deletePassword.value = '';
    await fetchDeletionStatus();
  } catch {
    ElMessage.error(t('accountSettings.deletionFailed'));
  } finally {
    deletingAccount.value = false;
  }
}

async function handleCancelDeletion() {
  cancellingDeletion.value = true;
  try {
    await gdprApi.cancelDeletion();
    ElMessage.success(t('accountSettings.deletionCancelled'));
    await fetchDeletionStatus();
  } catch {
    ElMessage.error(t('accountSettings.cancelFailed'));
  } finally {
    cancellingDeletion.value = false;
  }
}

function openDeleteDialog() {
  deletePassword.value = '';
  deleteDialogVisible.value = true;
}

// ── Consent Preferences ──
const consents = reactive<ConsentPreferences>({
  analytics: false,
  marketing: false,
  cookies: false,
});
const consentsLoading = ref(false);
const savingConsents = ref(false);

async function fetchConsents() {
  consentsLoading.value = true;
  try {
    const data = await gdprApi.getConsents();
    Object.assign(consents, data);
  } catch {
    // Defaults remain false
  } finally {
    consentsLoading.value = false;
  }
}
async function handleConsentChange(key: keyof ConsentPreferences, value: boolean) {
  savingConsents.value = true;
  try {
    await gdprApi.updateConsents({ [key]: value });
    consents[key] = value;
    ElMessage.success(t('accountSettings.consentsSaved'));
  } catch {
    // Revert on failure
    consents[key] = !value;
    ElMessage.error(t('accountSettings.consentsFailed'));
  } finally {
    savingConsents.value = false;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

onMounted(() => {
  fetchDeletionStatus();
  fetchConsents();
});
</script>

<template>
  <DashboardLayout>
    <template #title>{{ t('accountSettings.title') }}</template>
    <template #subtitle>{{ t('accountSettings.subtitle') }}</template>

    <div class="account-settings">
      <!-- Data Export Section -->
      <el-card class="settings-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon :size="20"><Download /></el-icon>
            <span>{{ t('accountSettings.exportTitle') }}</span>
          </div>
        </template>
        <p class="card-description">{{ t('accountSettings.exportDescription') }}</p>
        <el-button
          type="primary"
          :loading="exporting"
          :icon="Download"
          @click="handleExportData"
        >
          {{ exporting ? t('accountSettings.exportingData') : t('accountSettings.downloadData') }}
        </el-button>
      </el-card>
      <!-- Account Deletion Section -->
      <el-card class="settings-card" shadow="never">
        <template #header>
          <div class="card-header card-header--danger">
            <el-icon :size="20"><Delete /></el-icon>
            <span>{{ t('accountSettings.deletionTitle') }}</span>
          </div>
        </template>

        <template v-if="deletionStatus.pending">
          <el-alert
            type="warning"
            :closable="false"
            show-icon
            class="deletion-alert"
          >
            <template #title>
              {{ t('accountSettings.deletionPending') }}
            </template>
            <p>{{ t('accountSettings.scheduledFor', { date: formatDate(deletionStatus.scheduledAt) }) }}</p>
          </el-alert>
          <el-button
            :loading="cancellingDeletion"
            @click="handleCancelDeletion"
          >
            {{ t('accountSettings.cancelDeletion') }}
          </el-button>
        </template>

        <template v-else>
          <p class="card-description">{{ t('accountSettings.deletionDescription') }}</p>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            class="grace-period-info"
          >
            {{ t('accountSettings.gracePeriodInfo') }}
          </el-alert>
          <el-button type="danger" @click="openDeleteDialog">
            {{ t('accountSettings.deleteAccount') }}
          </el-button>
        </template>
      </el-card>

      <!-- Deletion Confirmation Dialog -->
      <el-dialog
        v-model="deleteDialogVisible"
        :title="t('accountSettings.deleteConfirmTitle')"
        width="440px"
        :close-on-click-modal="false"
      >
        <el-alert type="error" :closable="false" show-icon class="dialog-alert">
          {{ t('accountSettings.deleteWarning') }}
        </el-alert>
        <el-form @submit.prevent="handleRequestDeletion" class="delete-form">
          <el-form-item :label="t('accountSettings.confirmPassword')">
            <el-input
              v-model="deletePassword"
              type="password"
              show-password
              :placeholder="t('accountSettings.enterPassword')"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="deleteDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button
            type="danger"
            :loading="deletingAccount"
            @click="handleRequestDeletion"
          >
            {{ t('accountSettings.confirmDelete') }}
          </el-button>
        </template>
      </el-dialog>
      <!-- Privacy Preferences Section -->
      <el-card class="settings-card" shadow="never" v-loading="consentsLoading">
        <template #header>
          <div class="card-header">
            <el-icon :size="20"><Setting /></el-icon>
            <span>{{ t('accountSettings.consentsTitle') }}</span>
          </div>
        </template>
        <p class="card-description">{{ t('accountSettings.consentsDescription') }}</p>

        <div class="consent-list">
          <div class="consent-item">
            <div class="consent-info">
              <span class="consent-label">{{ t('accountSettings.analyticsConsent') }}</span>
              <span class="consent-desc">{{ t('accountSettings.analyticsDesc') }}</span>
            </div>
            <el-switch
              :model-value="consents.analytics"
              :disabled="savingConsents"
              @change="(val: string | number | boolean) => handleConsentChange('analytics', Boolean(val))"
            />
          </div>
          <div class="consent-item">
            <div class="consent-info">
              <span class="consent-label">{{ t('accountSettings.marketingConsent') }}</span>
              <span class="consent-desc">{{ t('accountSettings.marketingDesc') }}</span>
            </div>
            <el-switch
              :model-value="consents.marketing"
              :disabled="savingConsents"
              @change="(val: string | number | boolean) => handleConsentChange('marketing', Boolean(val))"
            />
          </div>
          <div class="consent-item">
            <div class="consent-info">
              <span class="consent-label">{{ t('accountSettings.cookiesConsent') }}</span>
              <span class="consent-desc">{{ t('accountSettings.cookiesDesc') }}</span>
            </div>
            <el-switch
              :model-value="consents.cookies"
              :disabled="savingConsents"
              @change="(val: string | number | boolean) => handleConsentChange('cookies', Boolean(val))"
            />
          </div>
        </div>
      </el-card>
    </div>
  </DashboardLayout>
</template>
<style scoped>
.account-settings {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-card {
  border: 1px solid var(--border-default);
  border-radius: 12px;
}

.settings-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
}

.settings-card :deep(.el-card__body) {
  padding: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-header--danger {
  color: var(--color-danger, #f56c6c);
}

.card-description {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0 0 16px 0;
  line-height: 1.6;
}

.deletion-alert {
  margin-bottom: 16px;
}

.grace-period-info {
  margin-bottom: 16px;
}

.dialog-alert {
  margin-bottom: 16px;
}

.delete-form {
  margin-top: 12px;
}

.consent-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.consent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-default);
}

.consent-item:last-child {
  border-bottom: none;
}

.consent-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.consent-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.consent-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

@media (max-width: 767px) {
  .account-settings {
    padding: 16px;
    gap: 16px;
  }
}
</style>
