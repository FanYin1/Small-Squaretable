<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@client/stores/user';
import { useToast } from '@client/composables/useToast';
import type { FormInstance, FormRules } from 'element-plus';
import { View, Hide } from '@element-plus/icons-vue';

const router = useRouter();
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
    text = '弱';
    color = '#F56C6C';
  } else if (strength <= 4) {
    level = 2;
    text = '中';
    color = '#E6A23C';
  } else {
    level = 3;
    text = '强';
    color = '#67C23A';
  }

  return { level, text, color };
});

// Custom validators
const validatePassword = (_rule: any, value: any, callback: any) => {
  if (!value) {
    callback(new Error('请输入密码'));
  } else if (value.length < 8) {
    callback(new Error('密码至少需要 8 个字符'));
  } else if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    callback(new Error('密码必须包含字母和数字'));
  } else {
    callback();
  }
};

const validateConfirmPassword = (_rule: any, value: any, callback: any) => {
  if (!value) {
    callback(new Error('请确认密码'));
  } else if (value !== formData.password) {
    callback(new Error('两次输入的密码不一致'));
  } else {
    callback();
  }
};

const validateTerms = (_rule: any, value: any, callback: any) => {
  if (!value) {
    callback(new Error('请阅读并同意服务条款'));
  } else {
    callback();
  }
};

// Form validation rules
const rules = reactive<FormRules>({
  name: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { min: 2, max: 50, message: '姓名长度应在 2-50 个字符之间', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' },
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

    toast.success('注册成功');

    // Redirect to home page after successful registration
    router.push({ name: 'Home' });
  } catch (error: any) {
    toast.error('注册失败', {
      message: error.message || '请检查输入信息后重试'
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
          <h1>创建账号</h1>
          <p class="subtitle">开始您的 SillyTavern 之旅</p>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-position="top"
        size="large"
        @submit.prevent="handleRegister"
      >
        <!-- Name Field -->
        <el-form-item label="姓名" prop="name">
          <el-input
            v-model="formData.name"
            placeholder="请输入您的姓名"
            :disabled="loading"
            clearable
          />
        </el-form-item>

        <!-- Email Field -->
        <el-form-item label="邮箱" prop="email">
          <el-input
            v-model="formData.email"
            type="email"
            placeholder="请输入您的邮箱"
            :disabled="loading"
            clearable
          />
        </el-form-item>

        <!-- Password Field -->
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="formData.password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="请输入密码（至少 8 个字符，包含字母和数字）"
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
              密码强度：{{ passwordStrength.text }}
            </span>
          </div>
        </el-form-item>

        <!-- Confirm Password Field -->
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="formData.confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            placeholder="请再次输入密码"
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
            我已阅读并同意
            <a href="#" class="terms-link" @click.prevent>服务条款</a>
            和
            <a href="#" class="terms-link" @click.prevent>隐私政策</a>
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
            {{ loading ? '注册中...' : '注册' }}
          </el-button>
        </el-form-item>

        <!-- Login Link -->
        <div class="login-link">
          已有账号？
          <el-button type="primary" link @click="goToLogin">
            立即登录
          </el-button>
        </div>
      </el-form>
    </el-card>
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

.register-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  background-color: var(--gray-50);
  background-image:
    radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 50%);
}

.register-card {
  max-width: 480px;
  width: 100%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: white;
  border: 1px solid var(--gray-200);
  overflow: hidden;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card-header {
  text-align: center;
  padding: 32px 24px 24px;
}

.card-header h1 {
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

.password-toggle {
  cursor: pointer;
  transition: color 0.2s ease;
  color: var(--gray-400);
}

.password-toggle:hover {
  color: var(--primary-500);
}

.password-strength {
  margin-top: 8px;
}

.strength-bar {
  height: 4px;
  background-color: var(--gray-200);
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
  color: var(--primary-500);
  text-decoration: none;
  transition: color 0.2s ease;
}

.terms-link:hover {
  color: var(--primary-600);
  text-decoration: underline;
}

.register-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  margin-top: 8px;
  background-color: var(--primary-500);
  border: none;
  color: white;
  transition: all 0.2s ease;
}

.register-button:hover {
  background-color: var(--primary-600);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.15);
}

.register-button:active {
  background-color: var(--primary-700);
  transform: translateY(0);
}

.login-link {
  text-align: center;
  font-size: 14px;
  color: var(--gray-600);
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--gray-200);
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

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  .register-page {
    background-color: #111827;
    background-image:
      radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 50%);
  }

  .register-card {
    background-color: #1F2937;
    border-color: #374151;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .card-header h1 {
    color: #F9FAFB;
  }

  .subtitle {
    color: #9CA3AF;
  }

  .login-link {
    color: #D1D5DB;
    border-top-color: #374151;
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

/* Checkbox Styling */
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
</style>
