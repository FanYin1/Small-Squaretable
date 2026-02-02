<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@client/stores/user';
import { ElMessage } from 'element-plus';
import { User, Lock, View, Hide } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

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

      ElMessage.success('登录成功');

      // Redirect to the original page or home
      const redirect = (route.query.redirect as string) || '/';
      router.push(redirect);
    } catch (error) {
      ElMessage.error(userStore.error || '登录失败，请检查邮箱和密码');
    } finally {
      loading.value = false;
    }
  });
};

// Navigate to register
const goToRegister = () => {
  router.push('/auth/register');
};

// Handle forgot password (placeholder)
const handleForgotPassword = () => {
  ElMessage.info('忘记密码功能即将推出');
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
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-container {
  width: 100%;
  max-width: 420px;
  animation: fadeInUp 0.6s ease-out;
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
  border-radius: 12px;
  overflow: hidden;
}

.card-header {
  text-align: center;
  padding: 10px 0;
}

.title {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 8px 0;
}

.subtitle {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.el-form {
  padding: 0 10px;
}

.form-options {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.password-toggle {
  cursor: pointer;
  transition: color 0.3s;
}

.password-toggle:hover {
  color: var(--el-color-primary);
}

.login-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  transition: all 0.3s;
}

.login-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
}

.register-link {
  text-align: center;
  padding: 10px 0;
}

.register-text {
  color: #606266;
  margin-right: 8px;
}

/* Responsive Design */
@media (max-width: 480px) {
  .login-page {
    padding: 10px;
  }

  .login-container {
    max-width: 100%;
  }

  .title {
    font-size: 24px;
  }

  .subtitle {
    font-size: 13px;
  }
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .login-page {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  }

  .title {
    color: var(--el-text-color-primary);
  }

  .subtitle {
    color: var(--el-text-color-secondary);
  }

  .register-text {
    color: var(--el-text-color-regular);
  }
}

/* Element Plus form item spacing */
:deep(.el-form-item) {
  margin-bottom: 24px;
}

:deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

/* Input focus effects */
:deep(.el-input__wrapper) {
  transition: all 0.3s;
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}
</style>
