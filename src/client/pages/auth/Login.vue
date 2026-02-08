<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@client/stores/user';
import { useToast } from '@client/composables/useToast';
import { User, Lock, View, Hide } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const userStore = useUserStore();
const toast = useToast();

// Form data
const loginForm = reactive({
  email: '',
  password: '',
  rememberMe: false,
});

// Form ref
const loginFormRef = ref<FormInstance>();

// Password visibility
const showPassword = ref(false);

// Loading state
const loading = ref(false);

// Form validation rules
const rules: FormRules = {
  email: [
    { required: true, message: t('auth.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('auth.emailInvalid'), trigger: ['blur', 'change'] },
  ],
  password: [
    { required: true, message: t('auth.passwordRequired'), trigger: 'blur' },
    { min: 6, message: t('auth.passwordMinLength'), trigger: 'blur' },
  ],
};

// Handle login
const handleLogin = async (formEl: FormInstance | undefined) => {
  if (!formEl) return;

  await formEl.validate(async (valid) => {
    if (!valid) return;

    loading.value = true;
    try {
      await userStore.login(loginForm.email, loginForm.password);

      toast.success(t('auth.loginSuccess'));

      // Redirect to the original page or home
      const redirect = (route.query.redirect as string) || '/';
      router.push(redirect);
    } catch (error) {
      toast.error(t('auth.loginFailed'), {
        message: userStore.error || t('auth.invalidCredentials')
      });
    } finally {
      loading.value = false;
    }
  });
};

// Navigate to register
const goToRegister = () => {
  router.push({ name: 'Register' });
};

</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <el-card class="login-card" shadow="always">
        <template #header>
          <div class="card-header">
            <h1 class="title">{{ t('auth.login') }}</h1>
            <p class="subtitle">{{ t('auth.welcomeBack') }}</p>
          </div>
        </template>

        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="rules"
          size="large"
          :aria-label="t('auth.login')"
          @submit.prevent="handleLogin(loginFormRef)"
        >
          <el-form-item prop="email">
            <el-input
              v-model="loginForm.email"
              :placeholder="t('auth.email')"
              :prefix-icon="User"
              clearable
              autocomplete="email"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              :type="showPassword ? 'text' : 'password'"
              :placeholder="t('auth.password')"
              :prefix-icon="Lock"
              autocomplete="current-password"
            >
              <template #suffix>
                <el-icon
                  class="password-toggle"
                  @click="showPassword = !showPassword"
                >
                  <View v-if="!showPassword" />
                  <Hide v-else />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item>
            <div class="form-options">
              <el-checkbox v-model="loginForm.rememberMe">
                {{ t('auth.rememberMe') }}
              </el-checkbox>
              <el-tooltip :content="t('auth.forgotPasswordComingSoon')" placement="top">
                <el-link type="primary" :underline="false" class="forgot-link">
                  {{ t('auth.forgotPassword') }}
                </el-link>
              </el-tooltip>
            </div>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              native-type="submit"
              :loading="loading"
              class="login-button"
            >
              {{ loading ? t('auth.loggingIn') : t('auth.login') }}
            </el-button>
          </el-form-item>
        </el-form>

        <el-divider>{{ t('auth.or') }}</el-divider>

        <div class="social-login">
          <el-tooltip :content="t('auth.socialComingSoon')" placement="top">
            <button class="social-btn" disabled>
              <svg class="social-icon" viewBox="0 0 24 24" width="20" height="20">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
          </el-tooltip>
          <el-tooltip :content="t('auth.socialComingSoon')" placement="top">
            <button class="social-btn" disabled>
              <svg class="social-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </button>
          </el-tooltip>
        </div>

        <div class="register-link">
          <span class="register-text">{{ t('auth.noAccount') }}</span>
          <el-link type="primary" :underline="false" @click="goToRegister">
            {{ t('auth.registerNow') }}
          </el-link>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--bg-surface);
  background-image:
    radial-gradient(circle at 20% 50%, color-mix(in srgb, var(--accent-purple) 12%, transparent) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--accent-cyan) 8%, transparent) 0%, transparent 50%),
    radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--accent-pink) 5%, transparent) 0%, transparent 50%);
}

.login-container {
  width: 100%;
  max-width: 420px;
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.login-card {
  border-radius: 16px;
  overflow: hidden;
  background-color: var(--surface-card);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--text-primary) 8%, transparent);
  border: 1px solid var(--border-subtle);
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

.form-options {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.password-toggle {
  cursor: pointer;
  transition: color 0.2s ease;
  color: var(--text-tertiary);
}

.password-toggle:hover {
  color: var(--accent-purple);
}

.login-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  transition: all 0.2s ease;
  background-color: var(--accent-purple);
  border: none;
  color: white;
}

.login-button:hover {
  background-color: var(--accent-purple);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--accent-purple) 15%, transparent);
}

.login-button:active {
  background-color: var(--accent-purple);
  transform: translateY(0);
}

.register-link {
  text-align: center;
  padding: 16px 0 0;
  border-top: 1px solid var(--border-subtle);
  margin-top: 16px;
}

.register-text {
  color: var(--text-secondary);
  margin-right: 8px;
  font-size: 14px;
}

.social-login {
  display: flex;
  gap: 12px;
  padding: 0 24px;
  margin-bottom: 16px;
}

.social-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: not-allowed;
  opacity: 0.6;
  transition: all 0.2s ease;
}

.social-btn:hover {
  border-color: var(--border-default);
  background: var(--surface-hover);
}

.social-icon {
  flex-shrink: 0;
}

.forgot-link {
  cursor: help;
}

/* Responsive Design */
@media (max-width: 768px) {
  .login-page {
    padding: 16px;
  }

  .login-container {
    max-width: 100%;
  }

  .card-header {
    padding: 28px 20px 20px;
  }

  .el-form {
    padding: 0 20px 28px;
  }

  .title {
    font-size: 24px;
  }

  .subtitle {
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .login-page {
    padding: 12px;
  }

  .card-header {
    padding: 24px 16px 16px;
  }

  .el-form {
    padding: 0 16px 24px;
  }

  .title {
    font-size: 22px;
  }

  .subtitle {
    font-size: 12px;
  }

  .login-button {
    height: 40px;
    font-size: 15px;
  }
}

/* Element Plus form item spacing */
:deep(.el-form-item) {
  margin-bottom: 20px;
}

:deep(.el-form-item:last-of-type) {
  margin-bottom: 0;
}

/* Input styling */
:deep(.el-input__wrapper) {
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background-color: var(--surface-card);
  transition: all 0.2s ease;
}

:deep(.el-input__wrapper:hover) {
  border-color: var(--accent-purple);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-purple) 10%, transparent);
}

:deep(.el-input__wrapper.is-focus) {
  border-color: var(--accent-purple);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-purple) 10%, transparent);
}

:deep(.el-input__inner) {
  color: var(--text-primary);
}

:deep(.el-input__inner::placeholder) {
  color: var(--text-tertiary);
}

/* Validation success state */
:deep(.el-form-item.is-success .el-input__wrapper) {
  border-color: var(--color-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-success) 10%, transparent);
}

/* Validation error state */
:deep(.el-form-item.is-error .el-input__wrapper) {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-danger) 10%, transparent);
}

/* Error message animation */
:deep(.el-form-item__error) {
  display: flex;
  align-items: center;
  gap: 4px;
  animation: slideDown 0.2s ease;
}

/* Checkbox styling */
:deep(.el-checkbox) {
  height: auto;
  line-height: 1.5;
}

:deep(.el-checkbox__label) {
  white-space: normal;
  line-height: 1.5;
  color: var(--text-secondary);
  font-size: 14px;
}

:deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: var(--accent-purple);
  border-color: var(--accent-purple);
}

/* Link styling */
:deep(.el-link) {
  color: var(--accent-purple);
  transition: color 0.2s ease;
}

:deep(.el-link:hover) {
  color: var(--accent-purple);
}

/* Divider styling */
:deep(.el-divider) {
  background-color: var(--border-subtle);
  margin: 20px 0;
}

:deep(.el-divider__text) {
  color: var(--text-tertiary);
  font-size: 14px;
}
</style>
