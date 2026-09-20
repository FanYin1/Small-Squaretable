<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '@client/composables/useToast';
import { useUserStore } from '@client/stores/user';
import { authApi } from '@client/services';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import { Lock, Check } from '@element-plus/icons-vue';

const { t } = useI18n();
const toast = useToast();
const userStore = useUserStore();

// State: 'idle' | 'setup' | 'verify' | 'enabled'
const mfaState = ref<'idle' | 'setup' | 'verify' | 'enabled'>('idle');
const loading = ref(false);

// Setup data
const qrDataUrl = ref('');
const manualSecret = ref('');
const verifyCode = ref('');
const verifyError = ref('');

// Backup codes
const backupCodes = ref<string[]>([]);
const showBackupCodes = ref(false);

// Disable
const disableCode = ref('');
const disableError = ref('');
const showDisableDialog = ref(false);

onMounted(async () => {
  if (!userStore.user) {
    await userStore.fetchProfile();
  }
  if (userStore.user?.mfaEnabled) {
    mfaState.value = 'enabled';
  }
});

// Start MFA setup
async function startSetup() {
  loading.value = true;
  try {
    const response = await authApi.mfaSetup();
    qrDataUrl.value = response.qrDataUrl;
    manualSecret.value = response.secret;
    mfaState.value = 'setup';
  } catch {
    toast.error(t('mfa.setupFailed'));
  } finally {
    loading.value = false;
  }
}

// Verify setup code
async function verifySetup() {
  const trimmed = verifyCode.value.trim();
  if (!trimmed) return;
  loading.value = true;
  verifyError.value = '';
  try {
    const response = await authApi.mfaVerifySetup(trimmed);
    backupCodes.value = response.backupCodes;
    showBackupCodes.value = true;
    mfaState.value = 'enabled';
    toast.success(t('mfa.enabledSuccess'));
  } catch {
    verifyError.value = t('mfa.invalidCode');
  } finally {
    loading.value = false;
  }
}

// Disable MFA
async function disableMfa() {
  const trimmed = disableCode.value.trim();
  if (!trimmed) return;
  loading.value = true;
  disableError.value = '';
  try {
    await authApi.mfaDisable(trimmed);
    mfaState.value = 'idle';
    showDisableDialog.value = false;
    disableCode.value = '';
    toast.success(t('mfa.disabledSuccess'));
  } catch {
    disableError.value = t('mfa.invalidCode');
  } finally {
    loading.value = false;
  }
}

// Regenerate backup codes
async function regenerateBackupCodes() {
  loading.value = true;
  try {
    const response = await authApi.mfaRegenerateBackupCodes();
    backupCodes.value = response.backupCodes;
    showBackupCodes.value = true;
    toast.success(t('mfa.backupCodesRegenerated'));
  } catch {
    toast.error(t('mfa.backupCodesRegenerateFailed'));
  } finally {
    loading.value = false;
  }
}

// Copy backup codes to clipboard
function copyBackupCodes() {
  const text = backupCodes.value.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    toast.success(t('common.copied'));
  });
}

// Download backup codes as text file
function downloadBackupCodes() {
  const text = backupCodes.value.join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'backup-codes.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// Copy secret to clipboard
function copySecret() {
  navigator.clipboard.writeText(manualSecret.value).then(() => {
    toast.success(t('common.copied'));
  });
}
</script>

<template>
  <DashboardLayout>
    <div class="security-settings">
      <div class="page-header">
        <h1 class="page-title">{{ t('mfa.securitySettings') }}</h1>
        <p class="page-subtitle">{{ t('mfa.securitySubtitle') }}</p>
      </div>

      <el-card class="mfa-card" shadow="never">
        <template #header>
          <div class="card-header-row">
            <div class="card-header-left">
              <el-icon :size="20"><Lock /></el-icon>
              <span>{{ t('mfa.twoFactorAuth') }}</span>
            </div>
            <el-tag v-if="mfaState === 'enabled'" type="success" size="small">
              {{ t('mfa.enabled') }}
            </el-tag>
            <el-tag v-else type="info" size="small">
              {{ t('mfa.disabled') }}
            </el-tag>
          </div>
        </template>
        <!-- State: Not enabled -->
        <div v-if="mfaState === 'idle'" class="mfa-idle">
          <p class="mfa-desc">{{ t('mfa.description') }}</p>
          <el-button type="primary" :loading="loading" @click="startSetup">
            {{ t('mfa.enableButton') }}
          </el-button>
        </div>

        <!-- State: Setup - show QR code -->
        <div v-else-if="mfaState === 'setup'" class="mfa-setup">
          <el-steps :active="0" align-center class="mfa-steps">
            <el-step :title="t('mfa.stepScan')" />
            <el-step :title="t('mfa.stepVerify')" />
            <el-step :title="t('mfa.stepDone')" />
          </el-steps>

          <div class="qr-section">
            <p class="mfa-desc">{{ t('mfa.scanQrCode') }}</p>
            <img :src="qrDataUrl" alt="QR Code" class="qr-image" />
            <div class="manual-secret">
              <span class="secret-label">{{ t('mfa.manualEntry') }}:</span>
              <code class="secret-code">{{ manualSecret }}</code>
              <el-button text size="small" @click="copySecret">{{ t('common.copy') }}</el-button>
            </div>
          </div>

          <el-form class="verify-form" @submit.prevent="verifySetup">
            <el-form-item :label="t('mfa.verificationCode')" :error="verifyError || undefined">
              <el-input
                v-model="verifyCode"
                :placeholder="t('mfa.totpPlaceholder')"
                maxlength="6"
                size="large"
                clearable
                @keyup.enter="verifySetup"
              />
            </el-form-item>
            <el-button type="primary" :loading="loading" :disabled="!verifyCode.trim()" native-type="submit">
              {{ t('mfa.verifyAndEnable') }}
            </el-button>
          </el-form>
        </div>

        <!-- State: Enabled -->
        <div v-else-if="mfaState === 'enabled'" class="mfa-enabled">
          <div class="enabled-status">
            <el-icon :size="24" color="var(--color-success)"><Check /></el-icon>
            <span>{{ t('mfa.currentlyEnabled') }}</span>
          </div>

          <div class="mfa-actions">
            <el-button @click="regenerateBackupCodes" :loading="loading">
              {{ t('mfa.regenerateBackupCodes') }}
            </el-button>
            <el-button type="danger" plain @click="showDisableDialog = true">
              {{ t('mfa.disableButton') }}
            </el-button>
          </div>
        </div>

        <!-- Backup codes display -->
        <el-dialog v-model="showBackupCodes" :title="t('mfa.backupCodesTitle')" width="460px" :close-on-click-modal="false">
          <div class="backup-codes-dialog">
            <el-alert :title="t('mfa.backupCodesWarning')" type="warning" :closable="false" show-icon class="backup-warning" />
            <div class="backup-codes-grid">
              <code v-for="bc in backupCodes" :key="bc" class="backup-code-item">{{ bc }}</code>
            </div>
            <div class="backup-actions">
              <el-button @click="copyBackupCodes">{{ t('common.copy') }}</el-button>
              <el-button type="primary" @click="downloadBackupCodes">{{ t('mfa.download') }}</el-button>
            </div>
          </div>
        </el-dialog>

        <!-- Disable MFA dialog -->
        <el-dialog v-model="showDisableDialog" :title="t('mfa.disableTitle')" width="400px">
          <div class="disable-dialog">
            <el-alert :title="t('mfa.disableWarning')" type="warning" :closable="false" show-icon />
            <el-form class="disable-form" @submit.prevent="disableMfa">
              <el-form-item :label="t('mfa.verificationCode')" :error="disableError || undefined">
                <el-input
                  v-model="disableCode"
                  :placeholder="t('mfa.totpPlaceholder')"
                  maxlength="6"
                  size="large"
                  @keyup.enter="disableMfa"
                />
              </el-form-item>
              <el-button type="danger" :loading="loading" :disabled="!disableCode.trim()" native-type="submit">
                {{ t('mfa.confirmDisable') }}
              </el-button>
            </el-form>
          </div>
        </el-dialog>
      </el-card>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.security-settings {
  max-width: 680px;
  margin: 0 auto;
  padding: 24px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-tertiary);
  margin: 0;
}

.mfa-card {
  border-radius: 12px;
  border: 1px solid var(--border-default);
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
}

.mfa-desc {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 16px;
}

/* Setup */
.mfa-steps {
  margin-bottom: 24px;
}

.qr-section {
  text-align: center;
  margin-bottom: 24px;
}

.qr-image {
  width: 200px;
  height: 200px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 8px;
  background: white;
}

.manual-secret {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.secret-label {
  color: var(--text-tertiary);
  font-size: 13px;
}

.secret-code {
  background: var(--surface-hover);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  letter-spacing: 1px;
  word-break: break-all;
}

.verify-form {
  max-width: 320px;
  margin: 0 auto;
}

/* Enabled */
.enabled-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 20px;
}

.mfa-actions {
  display: flex;
  gap: 12px;
}

/* Backup codes */
.backup-codes-dialog {
  text-align: center;
}

.backup-warning {
  margin-bottom: 16px;
}

.backup-codes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 20px;
}

.backup-code-item {
  background: var(--surface-hover);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  letter-spacing: 1px;
}

.backup-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

/* Disable dialog */
.disable-dialog .el-alert {
  margin-bottom: 16px;
}

.disable-form {
  margin-top: 12px;
}
</style>
