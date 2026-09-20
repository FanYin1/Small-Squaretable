<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '@client/composables/useToast';
import { authApi } from '@client/services/auth.api';
import { Lock, View, Hide } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const toast = useToast();

const formRef = ref<FormInstance>();
const loading = ref(false);
const showPassword = ref(false);
const showConfirmPassword = ref(false);

const token = route.query.token as string;

const formData = reactive({
  password: '',
  confirmPassword: '',
});

const validateConfirmPassword = (_rule: any, value: any, callback: any) => {
  if (!value) {
    callback(new Error(t('auth.confirmPasswordRequired')));
  } else if (value !== formData.password) {
    callback(new Error(t('auth.passwordMismatch')));
  } else {
    callback();
  }
};

const rules: FormRules = {
  password: [
    { required: true, message: t('auth.passwordRequired'), trigger: 'blur' },
    { min: 8, message: t('auth.passwordMinLength8'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, validator: validateConfirmPassword, trigger: 'blur' },
  ],
};

const handleSubmit = async (formEl: FormInstance | undefined) => {
  if (!formEl) return;
  if (!token) {
    toast.error(t('auth.invalidResetToken'));
    return;
  }

  await formEl.validate(async (valid) => {
    if (!valid) return;

    loading.value = true;
    try {
      await authApi.resetPassword(token, formData.password);
      toast.success(t('auth.passwordResetSuccess'));
      router.push({ name: 'Login' });
    } catch {
      toast.error(t('auth.passwordResetFailed'));
    } finally {
      loading.value = false;
    }
  });
};

const goToLogin = () => {
  router.push({ name: 'Login' });
};
</script>

<template>
  <div class="reset-page">
    <div class="reset-container">
      <el-card class="reset-card" shadow="always">
        <template #header>
          <div class="card-header">
            <h1 class="title">{{ t('auth.resetPassword') }}</h1>
            <p class="subtitle">{{ t('auth.resetPasswordSubtitle') }}</p>
          </div>
        </template>

        <div v-if="!token" class="error-state">
          <el-result
            icon="error"
            :title="t('auth.invalidResetToken')"
            :sub-title="t('auth.invalidResetTokenDesc')"
          >
            <template #extra>
              <el-button type="primary" class="action-button" @click="goToLogin">
                {{ t('auth.backToLogin') }}
              </el-button>
            </template>
          </el-result>
        </div>

        <el-form
          v-else
          ref="formRef"
          :model="formData"
          :rules="rules"
          size="large"
          :aria-label="t('auth.resetPassword')"
          @submit.prevent="handleSubmit(formRef)"
        >
          <el-form-item prop="password">
            <el-input
              v-model="formData.password"
              :type="showPassword ? 'text' : 'password'"
              :placeholder="t('auth.enterPassword')"
              :prefix-icon="Lock"
              autocomplete="new-password"
            >
              <template #suffix>
                <el-icon class="password-toggle" @click="showPassword = !showPassword">
                  <View v-if="!showPassword" />
                  <Hide v-else />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="confirmPassword">
            <el-input
              v-model="formData.confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              :placeholder="t('auth.reenterPassword')"
              :prefix-icon="Lock"
              autocomplete="new-password"
            >
              <template #suffix>
                <el-icon class="password-toggle" @click="showConfirmPassword = !showConfirmPassword">
                  <View v-if="!showConfirmPassword" />
                  <Hide v-else />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              native-type="submit"
              :loading="loading"
              class="submit-button"
            >
              {{ loading ? t('auth.resetting') : t('auth.resetPassword') }}
            </el-button>
          </el-form-item>
        </el-form>

        <div class="back-link">
          <el-link type="primary" underline="never" @click="goToLogin">
            {{ t('auth.backToLogin') }}
          </el-link>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.reset-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--bg-base);
}

.reset-container {
  width: 100%;
  max-width: 420px;
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.reset-card {
  border-radius: var(--radius-lg);
  overflow: hidden;
  background-color: var(--bg-surface);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--text-primary) 8%, transparent);
  border: 1px solid var(--border-default);
}

.card-header {
  text-align: center;
  padding: 32px 24px 24px;
}

.title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 14px;
  color: var(--text-tertiary);
  margin: 0;
  font-weight: 500;
}

.el-form {
  padding: 0 24px 32px;
}

.password-toggle {
  cursor: pointer;
  transition: color 0.2s ease;
  color: var(--text-tertiary);
}

.password-toggle:hover {
  color: var(--accent-text);
}

.submit-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
  background-color: var(--accent);
  border: none;
  color: white;
}

.submit-button:hover {
  background-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--accent) 15%, transparent);
}

.error-state {
  padding: 24px;
  text-align: center;
}

.action-button {
  min-width: 160px;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  border-radius: var(--radius-md);
  background-color: var(--accent);
  border: none;
  color: white;
}

.back-link {
  text-align: center;
  padding: 16px 0 0;
  border-top: 1px solid var(--border-default);
  margin-top: 16px;
}

@media (max-width: 768px) {
  .reset-page { padding: 16px; }
  .reset-container { max-width: 100%; }
  .card-header { padding: 28px 20px 20px; }
  .el-form { padding: 0 20px 28px; }
  .title { font-size: 24px; }
}

@media (max-width: 480px) {
  .reset-page { padding: 12px; }
  .card-header { padding: 24px 16px 16px; }
  .el-form { padding: 0 16px 24px; }
  .title { font-size: 22px; }
  .submit-button { height: 40px; font-size: 15px; }
}

:deep(.el-form-item) { margin-bottom: 20px; }
:deep(.el-form-item:last-of-type) { margin-bottom: 0; }
:deep(.el-input__wrapper) {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background-color: var(--bg-surface);
  transition: all 0.2s ease;
}
:deep(.el-input__wrapper:hover) {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
}
:deep(.el-input__wrapper.is-focus) {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
}
:deep(.el-input__inner) { color: var(--text-primary); }
:deep(.el-input__inner::placeholder) { color: var(--text-tertiary); }
:deep(.el-link) { color: var(--accent-text); transition: color 0.2s ease; }
:deep(.el-form-item.is-error .el-input__wrapper) {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-danger) 10%, transparent);
}
</style>