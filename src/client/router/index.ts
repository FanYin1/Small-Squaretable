import { createRouter, createWebHistory } from 'vue-router';
import { routes } from './routes';
import './types';
import { useUserStore } from '@client/stores/user';
import { isTokenValid } from '@client/utils/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Navigation guard for authentication
router.beforeEach((to, from, next) => {
  const userStore = useUserStore();
  const token = userStore.token;

  // 使用 token 有效性验证（检查是否过期）
  const isAuthenticated = isTokenValid(token);

  // 如果 token 存在但已过期，清除认证状态
  if (token && !isAuthenticated) {
    userStore.clearAuth();
  }

  if (to.meta.requiresAuth && !isAuthenticated) {
    // Redirect to login if route requires auth and user is not authenticated
    next({
      path: '/auth/login',
      query: { redirect: to.fullPath }
    });
  } else if (to.meta.guestOnly && isAuthenticated) {
    // Redirect to dashboard if route is guest-only and user is authenticated
    next({ name: 'Dashboard' });
  } else {
    // Allow navigation
    next();
  }
});

export default router;
