<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  visible: boolean;
  loading?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  (e: 'submit', code: string): void;
  (e: 'cancel'): void;
}>();

const { t } = useI18n();

const code = ref('');
const useBackupCode = ref(false);
const codeInputRef = ref<HTMLInputElement>();

function switchMode() {
  useBackupCode.value = !useBackupCode.value;
  code.value = '';
  nextTick(() => codeInputRef.value?.focus());
}

function handleSubmit() {
  const trimmed = code.value.trim();
  if (!trimmed) return;
  emit('submit', trimmed);
}

function handleDialogOpen() {
  nextTick(() => codeInputRef.value?.focus());
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="t('mfa.challengeTitle')"
    width="400px"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    @close="emit('cancel')"
    @opened="handleDialogOpen"
  >
    <div class="mfa-challenge">
      <p class="mfa-description">
        {{ useBackupCode ? t('mfa.enterBackupCode') : t('mfa.enterTotpCode') }}
      </p>

      <el-form @submit.prevent="handleSubmit">
        <el-form-item :error="error || undefined">
          <el-input
            ref="codeInputRef"
            v-model="code"
            :placeholder="useBackupCode ? t('mfa.backupCodePlaceholder') : t('mfa.totpPlaceholder')"
            :maxlength="useBackupCode ? 20 : 6"
            size="large"
            clearable
            autocomplete="one-time-code"
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-button
          type="primary"
          :loading="loading"
          :disabled="!code.trim()"
          class="mfa-submit-btn"
          native-type="submit"
        >
          {{ loading ? t('mfa.verifying') : t('mfa.verify') }}
        </el-button>
      </el-form>

      <el-link type="primary" :underline="false" class="mfa-switch-link" @click="switchMode">
        {{ useBackupCode ? t('mfa.useTotpCode') : t('mfa.useBackupCode') }}
      </el-link>
    </div>
  </el-dialog>
</template>

<style scoped>
.mfa-challenge {
  text-align: center;
}

.mfa-description {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 20px;
}

.mfa-submit-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  background-color: var(--accent-purple);
  border: none;
  color: white;
}

.mfa-switch-link {
  display: inline-block;
  margin-top: 16px;
  font-size: 13px;
}

:deep(.el-input__wrapper) {
  border-radius: 8px;
  text-align: center;
}

:deep(.el-input__inner) {
  text-align: center;
  font-size: 20px;
  letter-spacing: 4px;
}
</style>
