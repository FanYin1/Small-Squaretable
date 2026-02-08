<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@client/stores/user';
import { useToast } from '@client/composables/useToast';
import type { FormInstance, FormRules } from 'element-plus';
import { View, Hide } from '@element-plus/icons-vue';

const router = useRouter();
const { t } = useI18n();
const userStore = useUserStore();
const toast = useToast();

// Form data
const formRef = ref<FormInstance>();
const formData = reactive({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  agreeToTerms: false,
});

// UI state
const loading = ref(false);
const showPassword = ref(false);
const showConfirmPassword = ref(false);

// Password strength calculation
const passwordStrength = computed(() => {
  const password = formData.password;
  if (!password) return { level: 0, text: '', color: '' };

  let strength = 0;

  // Length check
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;

  // Character variety checks
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;

  // Determine level (0-3)
  let level = 0;
  let text = '';
  let color = '';

  if (strength <= 2) {
    level = 1;
    text = t('auth.passwordWeak');
    color = 'var(--color-danger)';
  } else if (strength <= 4) {
    level = 2;
    text = t('auth.passwordMedium');
    color = 'var(--color-warning)';
  } else {
    level = 3;
    text = t('auth.passwordStrong');
    color = 'var(--color-success)';
  }

  return { level, text, color };
});

// Custom validators
const validatePassword = (_rule: any, value: any, callback: any) => {
  if (!value) {
    callback(new Error(t('auth.passwordRequired')));
  } else if (value.length < 8) {
    callback(new Error(t('auth.passwordMinLength8')));
  } else if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    callback(new Error(t('auth.passwordAlphanumeric')));
  } else {
    callback();
  }
};

const validateConfirmPassword = (_rule: any, value: any, callback: any) => {
  if (!value) {
    callback(new Error(t('auth.confirmPasswordRequired')));
  } else if (value !== formData.password) {
    callback(new Error(t('auth.passwordMismatch')));
  } else {
    callback();
  }
};

const validateTerms = (_rule: any, value: any, callback: any) => {
  if (!value) {
    callback(new Error(t('auth.agreeTermsRequired')));
  } else {
    callback();
  }
};

// Form validation rules
const rules = reactive<FormRules>({
  name: [
    { required: true, message: t('auth.nameRequired'), trigger: 'blur' },
    { min: 2, max: 50, message: t('auth.nameLength'), trigger: 'blur' },
  ],
  email: [
    { required: true, message: t('auth.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('auth.emailInvalid'), trigger: 'blur' },
  ],
  password: [
    { required: true, validator: validatePassword, trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, validator: validateConfirmPassword, trigger: 'blur' },
  ],
  agreeToTerms: [
    { required: true, validator: validateTerms, trigger: 'change' },
  ],
});

// Handle registration
const handleRegister = async () => {
  if (!formRef.value) return;

  try {
    const valid = await formRef.value.validate();
    if (!valid) return;

    loading.value = true;

    await userStore.register(formData.email, formData.password, formData.name);

    toast.success(t('auth.registerSuccess'));

    // Redirect to home page after successful registration
    router.push({ name: 'Home' });
  } catch (error: unknown) {
    toast.error(t('auth.registerFailed'), {
      message: error instanceof Error ? error.message : t('auth.checkInputRetry')
    });
  } finally {
    loading.value = false;
  }
};

// Navigate to login
const goToLogin = () => {
  router.push({ name: 'Login' });
};
</script>

<template>
  <div class="register-page">
    <el-card class="register-card">
      <template #header>
        <div class="card-header">
          <h1>{{ t('auth.createAccount') }}</h1>
          <p class="subtitle">{{ t('auth.startJourney') }}</p>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-position="top"
        size="large"
        :aria-label="t('auth.register')"
        @submit.prevent="handleRegister"
      >
        <!-- Name Field -->
        <el-form-item :label="t('auth.name')" prop="name">
          <el-input
            v-model="formData.name"
            :placeholder="t('auth.enterName')"
            :disabled="loading"
            clearable
          />
        </el-form-item>

        <!-- Email Field -->
        <el-form-item :label="t('auth.email')" prop="email">
          <el-input
            v-model="formData.email"
            type="email"
            :placeholder="t('auth.enterEmail')"
            :disabled="loading"
            clearable
          />
        </el-form-item>

        <!-- Password Field -->
        <el-form-item :label="t('auth.password')" prop="password">
          <el-input
            v-model="formData.password"
            :type="showPassword ? 'text' : 'password'"
            :placeholder="t('auth.enterPassword')"
            :disabled="loading"
            clearable
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

          <!-- Password Strength Indicator -->
          <div v-if="formData.password" class="password-strength">
            <div class="strength-bar">
              <div
                class="strength-fill"
                :style="{
                  width: `${(passwordStrength.level / 3) * 100}%`,
                  backgroundColor: passwordStrength.color,
                }"
              />
            </div>
            <span
              class="strength-text"
              :style="{ color: passwordStrength.color }"
            >
              {{ t('auth.passwordStrength') }}{{ passwordStrength.text }}
            </span>
          </div>
        </el-form-item>

        <!-- Confirm Password Field -->
        <el-form-item :label="t('auth.confirmPassword')" prop="confirmPassword">
          <el-input
            v-model="formData.confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            :placeholder="t('auth.reenterPassword')"
            :disabled="loading"
            clearable
          >
            <template #suffix>
              <el-icon
                class="password-toggle"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <View v-if="!showConfirmPassword" />
                <Hide v-else />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>

        <!-- Terms and Conditions -->
        <el-form-item prop="agreeToTerms">
          <el-checkbox v-model="formData.agreeToTerms" :disabled="loading">
            {{ t('auth.agreeToTerms') }}
            <router-link :to="{ name: 'Terms' }" class="terms-link">{{ t('auth.termsOfService') }}</router-link>
            {{ t('auth.and') }}
            <router-link :to="{ name: 'Privacy' }" class="terms-link">{{ t('auth.privacyPolicy') }}</router-link>
          </el-checkbox>
        </el-form-item>

        <!-- Register Button -->
        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            :disabled="loading"
            class="register-button"
          >
            {{ loading ? t('auth.registering') : t('auth.register') }}
          </el-button>
        </el-form-item>

        <!-- Social Login -->
        <div class="social-divider">
          <el-divider>{{ t('auth.orContinueWith') }}</el-divider>
        </div>

        <div class="social-buttons">
          <el-tooltip :content="t('auth.comingSoon')" placement="top">
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
          <el-tooltip :content="t('auth.comingSoon')" placement="top">
            <button class="social-btn" disabled>
              <svg class="social-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </button>
          </el-tooltip>
        </div>

        <!-- Login Link -->
        <div class="login-link">
          {{ t('auth.hasAccount') }}
          <el-button type="primary" link @click="goToLogin">
            {{ t('auth.loginNow') }}
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.register-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  background: var(--bg-surface);
  background-image:
    radial-gradient(circle at 20% 50%, color-mix(in srgb, var(--accent-purple) 12%, transparent) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--accent-cyan) 8%, transparent) 0%, transparent 50%),
    radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--accent-pink) 5%, transparent) 0%, transparent 50%);
}

.register-card {
  max-width: 480px;
  width: 100%;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--text-primary) 8%, transparent);
  border-radius: 16px;
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: var(--surface-card);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
}

.card-header {
  text-align: center;
  padding: 32px 24px 24px;
}

.card-header h1 {
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

.password-toggle {
  cursor: pointer;
  transition: color 0.2s ease;
  color: var(--text-tertiary);
}

.password-toggle:hover {
  color: var(--accent-purple);
}

.password-strength {
  margin-top: 8px;
}

.strength-bar {
  height: 4px;
  background-color: var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.strength-fill {
  height: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
  border-radius: 2px;
}

.strength-text {
  font-size: 12px;
  font-weight: 500;
  transition: color 0.3s ease;
}

.terms-link {
  color: var(--accent-purple);
  text-decoration: none;
  transition: color 0.2s ease;
}

.terms-link:hover {
  color: var(--accent-purple);
  text-decoration: underline;
}

.register-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  margin-top: 8px;
  background-color: var(--accent-purple);
  border: none;
  color: white;
  transition: all 0.2s ease;
}

.register-button:hover {
  background-color: var(--accent-purple);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--accent-purple) 15%, transparent);
}

.register-button:active {
  background-color: var(--accent-purple);
  transform: translateY(0);
}

.login-link {
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.social-divider {
  margin: 8px 0 0;
}

.social-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
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

/* Responsive Design */
@media (max-width: 768px) {
  .register-page {
    padding: 16px;
  }

  .register-card {
    max-width: 100%;
  }

  .card-header {
    padding: 28px 20px 20px;
  }

  .card-header h1 {
    font-size: 24px;
  }

  .subtitle {
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .register-page {
    padding: 12px;
  }

  .card-header {
    padding: 24px 16px 16px;
  }

  .card-header h1 {
    font-size: 22px;
  }

  .subtitle {
    font-size: 12px;
  }

  .register-button {
    height: 40px;
    font-size: 15px;
  }
}

/* Form Item Spacing */
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

/* Checkbox Styling */
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

/* Form wrapper padding */
:deep(.el-form) {
  padding: 0 24px 32px;
}

@media (max-width: 768px) {
  :deep(.el-form) {
    padding: 0 20px 28px;
  }
}

@media (max-width: 480px) {
  :deep(.el-form) {
    padding: 0 16px 24px;
  }
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
