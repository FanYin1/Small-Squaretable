<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '@client/composables/useToast';
import { authApi } from '@client/services/auth.api';
import { Message } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';

const router = useRouter();
const { t } = useI18n();
const toast = useToast();

const formRef = ref<FormInstance>();
const loading = ref(false);
const emailSent = ref(false);

const formData = reactive({
  email: '',
});

const rules: FormRules = {
  email: [
    { required: true, message: t('auth.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('auth.emailInvalid'), trigger: ['blur', 'change'] },
  ],
};

const handleSubmit = async (formEl: FormInstance | undefined) => {
  if (!formEl) return;

  await formEl.validate(async (valid) => {
    if (!valid) return;

    loading.value = true;
    try {
      await authApi.forgotPassword(formData.email);
      emailSent.value = true;
    } catch {
      // Still show success to prevent email enumeration
      emailSent.value = true;
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
  <div class="forgot-page">
    <div class="forgot-container">
      <el-card class="forgot-card" shadow="always">
        <template #header>
          <div class="card-header">
            <h1 class="title">{{ t('auth.forgotPassword') }}</h1>
            <p class="subtitle">{{ t('auth.forgotPasswordSubtitle') }}</p>
          </div>
        </template>

        <!-- Success state -->
        <div v-if="emailSent" class="success-state">
          <el-result
            icon="success"
            :title="t('auth.checkYourEmail')"
            :sub-title="t('auth.resetEmailSent')"
          >
            <template #extra>
              <el-button type="primary" class="action-button" @click="goToLogin">
                {{ t('auth.backToLogin') }}
              </el-button>
            </template>
          </el-result>
        </div>

        <!-- Form state -->
        <el-form
          v-else
          ref="formRef"
          :model="formData"
          :rules="rules"
          size="large"
          :aria-label="t('auth.forgotPassword')"
          @submit.prevent="handleSubmit(formRef)"
        >
          <el-form-item prop="email">
            <el-input
              v-model="formData.email"
              :placeholder="t('auth.email')"
              :prefix-icon="Message"
              clearable
              autocomplete="email"
            />
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              native-type="submit"
              :loading="loading"
              class="submit-button"
            >
              {{ loading ? t('auth.sending') : t('auth.sendResetLink') }}
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
.forgot-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--bg-base);
}

.forgot-container {
  width: 100%;
  max-width: 420px;
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.forgot-card {
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

.success-state {
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
  .forgot-page { padding: 16px; }
  .forgot-container { max-width: 100%; }
  .card-header { padding: 28px 20px 20px; }
  .el-form { padding: 0 20px 28px; }
  .title { font-size: 24px; }
}

@media (max-width: 480px) {
  .forgot-page { padding: 12px; }
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
</style>
