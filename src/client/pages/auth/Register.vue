<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@client/stores/user';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { View, Hide } from '@element-plus/icons-vue';

const router = useRouter();
const userStore = useUserStore();

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

    ElMessage.success('注册成功！');

    // Redirect to home page after successful registration
    router.push('/');
  } catch (error: any) {
    ElMessage.error(error.message || '注册失败，请重试');
  } finally {
    loading.value = false;
  }
};

// Navigate to login
const goToLogin = () => {
  router.push('/auth/login');
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
.register-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 60px);
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.register-card {
  max-width: 480px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  animation: slideIn 0.3s ease-out;
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
}

.card-header h1 {
  font-size: 28px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 8px 0;
}

.subtitle {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin: 0;
}

.password-toggle {
  cursor: pointer;
  transition: color 0.2s;
}

.password-toggle:hover {
  color: var(--el-color-primary);
}

.password-strength {
  margin-top: 8px;
}

.strength-bar {
  height: 4px;
  background-color: var(--el-border-color-light);
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
  color: var(--el-color-primary);
  text-decoration: none;
  transition: color 0.2s;
}

.terms-link:hover {
  color: var(--el-color-primary-light-3);
  text-decoration: underline;
}

.register-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 500;
  margin-top: 8px;
}

.login-link {
  text-align: center;
  font-size: 14px;
  color: var(--el-text-color-regular);
  margin-top: 16px;
}

/* Responsive Design */
@media (max-width: 768px) {
  .register-page {
    padding: 16px;
    min-height: calc(100vh - 50px);
  }

  .register-card {
    max-width: 100%;
  }

  .card-header h1 {
    font-size: 24px;
  }

  .subtitle {
    font-size: 13px;
  }
}

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  .register-page {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  }

  .register-card {
    background-color: var(--el-bg-color);
  }
}

/* Form Item Spacing */
:deep(.el-form-item) {
  margin-bottom: 22px;
}

:deep(.el-form-item:last-of-type) {
  margin-bottom: 0;
}

/* Input Focus Effects */
:deep(.el-input__wrapper) {
  transition: all 0.2s;
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--el-input-hover-border-color) inset;
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

/* Checkbox Styling */
:deep(.el-checkbox) {
  height: auto;
  line-height: 1.5;
}

:deep(.el-checkbox__label) {
  white-space: normal;
  line-height: 1.5;
}
</style>
