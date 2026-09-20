<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@client/stores/user';
import { authApi } from '@client/services';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const userStore = useUserStore();

const loading = ref(true);
const errorMessage = ref('');

onMounted(async () => {
  const code = route.query.code as string;

  if (!code) {
    errorMessage.value = t('auth.oauthNoCode');
    loading.value = false;
    return;
  }

  try {
    const response = await authApi.oauthExchange(code);

    // Store tokens the same way login does
    userStore.user = response.user;
    userStore.setToken(response.token, response.refreshToken);
    localStorage.setItem('tenantId', response.user.tenantId);

    router.push({ name: 'Dashboard' });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.oauthFailed');
    loading.value = false;
  }
});

const goToLogin = () => {
  router.push({ name: 'Login' });
};
</script>

<template>
  <div class="oauth-callback-page">
    <el-card class="oauth-card">
      <!-- Loading State -->
      <div v-if="loading" class="callback-state">
        <el-icon class="loading-spinner" :size="48">
          <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
            <path d="M512 64a32 32 0 0 1 32 32v192a32 32 0 0 1-64 0V96a32 32 0 0 1 32-32z" fill="currentColor" opacity="0.3"/>
            <path d="M512 736a32 32 0 0 1 32 32v192a32 32 0 0 1-64 0V768a32 32 0 0 1 32-32z" fill="currentColor" opacity="0.3"/>
            <path d="M96 480h192a32 32 0 0 1 0 64H96a32 32 0 0 1 0-64z" fill="currentColor" opacity="0.3"/>
            <path d="M736 480h192a32 32 0 0 1 0 64H736a32 32 0 0 1 0-64z" fill="currentColor" opacity="0.3"/>
          </svg>
        </el-icon>
        <p class="state-text">{{ t('auth.oauthLoggingIn') }}</p>
      </div>

      <!-- Error State -->
      <div v-else class="callback-state">
        <div class="error-icon">!</div>
        <p class="state-text error-text">{{ errorMessage }}</p>
        <el-button type="primary" @click="goToLogin">
          {{ t('auth.backToLogin') }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.oauth-callback-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  background: var(--bg-surface);
}

.oauth-card {
  max-width: 400px;
  width: 100%;
  border-radius: 16px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-default);
}

.callback-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  gap: 16px;
}

.loading-spinner {
  color: var(--accent-text);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-danger);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
}

.state-text {
  font-size: 16px;
  color: var(--text-secondary);
  text-align: center;
  margin: 0;
}

.error-text {
  color: var(--color-danger-text);
}
</style>
