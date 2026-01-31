import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User } from '@client/types';

export const useUserStore = defineStore('user', () => {
  // State
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem('token'));
  const refreshToken = ref<string | null>(localStorage.getItem('refreshToken'));
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const isAuthenticated = computed(() => !!token.value);

  // Actions
  async function login(email: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      console.log('Login called (API integration in Task 4):', { email, password });
      // TODO: Task 4 - API integration
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Login failed';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function register(email: string, password: string, name: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      console.log('Register called (API integration in Task 4):', { email, password, name });
      // TODO: Task 4 - API integration
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Registration failed';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function logout(): void {
    user.value = null;
    token.value = null;
    refreshToken.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    console.log('User logged out');
  }

  async function refreshAccessToken(): Promise<void> {
    console.log('Refresh token called (API integration in Task 4)');
    // TODO: Task 4 - API integration
  }

  async function fetchProfile(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      console.log('Fetch profile called (API integration in Task 4)');
      // TODO: Task 4 - API integration
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch profile';
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
    logout();
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
  };
});
