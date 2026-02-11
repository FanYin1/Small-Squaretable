<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { authApi } from '@client/services/auth.api';
import { Loading } from '@element-plus/icons-vue';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const token = route.query.token as string;
const status = ref<'loading' | 'success' | 'error'>('loading');
const errorMessage = ref('');

onMounted(async () => {
  if (!token) {
    status.value = 'error';
    errorMessage.value = t('auth.missingVerificationToken');
    return;
  }

  try {
    await authApi.verifyEmail(token);
    status.value = 'success';
  } catch {
    status.value = 'error';
    errorMessage.value = t('auth.verificationFailed');
  }
});

const goToLogin = () => {
  router.push({ name: 'Login' });
};
</script>

<template>
  <div class="verify-page">
    <div class="verify-container">
      <el-card class="verify-card" shadow="always">
        <template #header>
          <div class="card-header">
            <h1 class="title">{{ t('auth.emailVerification') }}</h1>
          </div>
        </template>

        <div v-if="status === 'loading'" class="state-container">
          <el-icon class="loading-icon" :size="48"><Loading /></el-icon>
          <p class="state-text">{{ t('auth.verifyingEmail') }}</p>
        </div>

        <div v-else-if="status === 'success'" class="state-container">
          <el-result
            icon="success"
            :title="t('auth.emailVerified')"
            :sub-title="t('auth.emailVerifiedDesc')"
          >
            <template #extra>
              <el-button type="primary" class="action-button" @click="goToLogin">
                {{ t('auth.goToLogin') }}
              </el-button>
            </template>
          </el-result>
        </div>

        <div v-else class="state-container">
          <el-result
            icon="error"
            :title="t('auth.verificationFailed')"
            :sub-title="errorMessage"
          >
            <template #extra>
              <el-button type="primary" class="action-button" @click="goToLogin">
                {{ t('auth.backToLogin') }}
              </el-button>
            </template>
          </el-result>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.verify-page {
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
.verify-container {
  width: 100%;
  max-width: 420px;
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.verify-card {
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
  margin: 0;
  letter-spacing: -0.5px;
}
.state-container {
  padding: 24px;
  text-align: center;
}
.loading-icon {
  color: var(--accent-purple);
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.state-text {
  margin-top: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}
.action-button {
  min-width: 160px;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  background-color: var(--accent-purple);
  border: none;
  color: white;
}
@media (max-width: 768px) {
  .verify-page { padding: 16px; }
  .verify-container { max-width: 100%; }
  .title { font-size: 24px; }
}
@media (max-width: 480px) {
  .verify-page { padding: 12px; }
  .title { font-size: 22px; }
}
</style>
