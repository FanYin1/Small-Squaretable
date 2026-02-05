<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@client/stores/user';
import { useToast } from '@client/composables/useToast';
import { User, Lock, View, Hide } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';

const router = useRouter();
const route = useRoute();
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
    { required: true, message: '请输入邮箱地址', trigger: 'blur' },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: ['blur', 'change'] },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少为 6 位', trigger: 'blur' },
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

      toast.success('登录成功');

      // Redirect to the original page or home
      const redirect = (route.query.redirect as string) || '/';
      router.push(redirect);
    } catch (error) {
      toast.error('登录失败', {
        message: userStore.error || '邮箱或密码错误，请重试'
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

// Handle forgot password (placeholder)
const handleForgotPassword = () => {
  toast.info('忘记密码功能即将推出');
};
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <el-card class="login-card" shadow="always">
        <template #header>
          <div class="card-header">
            <h1 class="title">登录</h1>
            <p class="subtitle">欢迎回到 Small Squaretable</p>
          </div>
        </template>

        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="rules"
          size="large"
          @submit.prevent="handleLogin(loginFormRef)"
        >
          <el-form-item prop="email">
            <el-input
              v-model="loginForm.email"
              placeholder="邮箱地址"
              :prefix-icon="User"
              clearable
              autocomplete="email"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="密码"
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
                记住我
              </el-checkbox>
              <el-link
                type="primary"
                :underline="false"
                @click="handleForgotPassword"
              >
                忘记密码？
              </el-link>
            </div>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              native-type="submit"
              :loading="loading"
              class="login-button"
            >
              {{ loading ? '登录中...' : '登录' }}
            </el-button>
          </el-form-item>
        </el-form>

        <el-divider>或</el-divider>

        <div class="register-link">
          <span class="register-text">还没有账号？</span>
          <el-link type="primary" :underline="false" @click="goToRegister">
            立即注册
          </el-link>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
/* Color Scheme */
:root {
  --primary-50: #EFF6FF;
  --primary-500: #3B82F6;
  --primary-600: #2563EB;
  --primary-700: #1D4ED8;
  --gray-50: #F9FAFB;
  --gray-100: #F3F4F6;
  --gray-200: #E5E7EB;
  --gray-400: #9CA3AF;
  --gray-600: #4B5563;
  --gray-900: #111827;
  --success-500: #10B981;
  --success-600: #059669;
  --error-500: #EF4444;
}

.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: var(--gray-50);
  background-image:
    radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 50%);
}

.login-container {
  width: 100%;
  max-width: 420px;
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-card {
  border-radius: 16px;
  overflow: hidden;
  background-color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--gray-200);
}

.card-header {
  text-align: center;
  padding: 32px 24px 24px;
}

.title {
  font-size: 28px;
  font-weight: 700;
  color: var(--gray-900);
  margin: 0 0 8px 0;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 14px;
  color: var(--gray-400);
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
  color: var(--gray-400);
}

.password-toggle:hover {
  color: var(--primary-500);
}

.login-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  transition: all 0.2s ease;
  background-color: var(--primary-500);
  border: none;
  color: white;
}

.login-button:hover {
  background-color: var(--primary-600);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.15);
}

.login-button:active {
  background-color: var(--primary-700);
  transform: translateY(0);
}

.register-link {
  text-align: center;
  padding: 16px 0 0;
  border-top: 1px solid var(--gray-200);
  margin-top: 16px;
}

.register-text {
  color: var(--gray-600);
  margin-right: 8px;
  font-size: 14px;
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

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .login-page {
    background-color: #111827;
    background-image:
      radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 50%);
  }

  .login-card {
    background-color: #1F2937;
    border-color: #374151;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .title {
    color: #F9FAFB;
  }

  .subtitle {
    color: #9CA3AF;
  }

  .register-text {
    color: #D1D5DB;
  }

  .register-link {
    border-top-color: #374151;
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
  border: 1px solid var(--gray-200);
  background-color: white;
  transition: all 0.2s ease;
}

:deep(.el-input__wrapper:hover) {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

:deep(.el-input__wrapper.is-focus) {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

:deep(.el-input__inner) {
  color: var(--gray-900);
}

:deep(.el-input__inner::placeholder) {
  color: var(--gray-400);
}

/* Dark mode input */
@media (prefers-color-scheme: dark) {
  :deep(.el-input__wrapper) {
    background-color: #374151;
    border-color: #4B5563;
  }

  :deep(.el-input__wrapper:hover) {
    border-color: var(--primary-500);
  }

  :deep(.el-input__inner) {
    color: #F9FAFB;
  }

  :deep(.el-input__inner::placeholder) {
    color: #9CA3AF;
  }
}

/* Validation success state */
:deep(.el-form-item.is-success .el-input__wrapper) {
  border-color: #10B981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

/* Validation error state */
:deep(.el-form-item.is-error .el-input__wrapper) {
  border-color: #EF4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

/* Error message animation */
:deep(.el-form-item__error) {
  display: flex;
  align-items: center;
  gap: 4px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Checkbox styling */
:deep(.el-checkbox) {
  height: auto;
  line-height: 1.5;
}

:deep(.el-checkbox__label) {
  white-space: normal;
  line-height: 1.5;
  color: var(--gray-600);
  font-size: 14px;
}

:deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: var(--primary-500);
  border-color: var(--primary-500);
}

/* Link styling */
:deep(.el-link) {
  color: var(--primary-500);
  transition: color 0.2s ease;
}

:deep(.el-link:hover) {
  color: var(--primary-600);
}

/* Divider styling */
:deep(.el-divider) {
  background-color: var(--gray-200);
  margin: 20px 0;
}

:deep(.el-divider__text) {
  color: var(--gray-400);
  font-size: 14px;
}

@media (prefers-color-scheme: dark) {
  :deep(.el-divider) {
    background-color: #374151;
  }

  :deep(.el-divider__text) {
    color: #9CA3AF;
  }
}
</style>
