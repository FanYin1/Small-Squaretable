import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User } from '@client/types';
import { authApi, ApiError } from '@client/services';

export const useUserStore = defineStore('user', () => {
  // State
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem('token'));
  const refreshToken = ref<string | null>(localStorage.getItem('refreshToken'));
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const isAuthenticated = computed(() => !!token.value && !!user.value);

  // Actions
  async function login(email: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await authApi.login({ email, password });

      // 保存用户信息和令牌
      user.value = response.user;
      token.value = response.token;
      refreshToken.value = response.refreshToken;

      // 持久化到 localStorage
      localStorage.setItem('token', response.token);
      localStorage.setItem('refreshToken', response.refreshToken);
      localStorage.setItem('tenantId', response.user.tenantId);
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message;
      } else {
        error.value = e instanceof Error ? e.message : 'Login failed';
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function register(email: string, password: string, name: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await authApi.register({ email, password, name });

      // 保存用户信息和令牌
      user.value = response.user;
      token.value = response.token;
      refreshToken.value = response.refreshToken;

      // 持久化到 localStorage
      localStorage.setItem('token', response.token);
      localStorage.setItem('refreshToken', response.refreshToken);
      localStorage.setItem('tenantId', response.user.tenantId);
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message;
      } else {
        error.value = e instanceof Error ? e.message : 'Registration failed';
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    try {
      // 调用后端登出接口
      if (token.value) {
        await authApi.logout();
      }
    } catch (e) {
      console.error('Logout API call failed:', e);
    } finally {
      // 无论 API 调用是否成功，都清除本地状态
      user.value = null;
      token.value = null;
      refreshToken.value = null;
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('tenantId');
    }
  }

  async function refreshAccessToken(): Promise<void> {
    if (!refreshToken.value) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await authApi.refreshToken({
        refreshToken: refreshToken.value
      });

      // 更新令牌
      token.value = response.token;
      refreshToken.value = response.refreshToken;

      // 持久化到 localStorage
      localStorage.setItem('token', response.token);
      localStorage.setItem('refreshToken', response.refreshToken);
    } catch (e) {
      // 刷新失败，清除认证状态
      await logout();
      throw e;
    }
  }

  async function fetchProfile(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await authApi.getMe();
      user.value = response.user;
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.message;
      } else {
        error.value = e instanceof Error ? e.message : 'Failed to fetch profile';
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function setToken(newToken: string, newRefreshToken?: string): void {
    token.value = newToken;
    localStorage.setItem('token', newToken);
    if (newRefreshToken) {
      refreshToken.value = newRefreshToken;
      localStorage.setItem('refreshToken', newRefreshToken);
    }
  }

  function clearAuth(): void {
    user.value = null;
    token.value = null;
    refreshToken.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tenantId');
  }

  // 初始化：如果有 token，尝试获取用户信息
  async function initialize(): Promise<void> {
    if (token.value && !user.value) {
      try {
        await fetchProfile();
      } catch {
        // 如果获取失败，清除认证状态
        clearAuth();
      }
    }
  }

  return {
    user,
    token,
    refreshToken,
    loading,
    error,
    isAuthenticated,
    login,
    register,
    logout,
    refreshAccessToken,
    fetchProfile,
    setToken,
    clearAuth,
    initialize,
  };
});
