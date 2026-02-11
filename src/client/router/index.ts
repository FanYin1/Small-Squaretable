import { createRouter, createWebHistory } from 'vue-router';
import { routes } from './routes';
import './types';
import { useUserStore } from '@client/stores/user';
import { isTokenValid } from '@client/utils/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Role hierarchy: admin > moderator > user
const ROLE_HIERARCHY: Record<string, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
};

function hasRequiredRole(userRole: string | undefined, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole || 'user'] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}

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
  } else if (to.meta.requiresRole && isAuthenticated) {
    // Check role-based access for the most specific matched route
    const requiredRole = to.matched
      .filter(record => record.meta.requiresRole)
      .map(record => record.meta.requiresRole as string)
      .pop();
    if (requiredRole && !hasRequiredRole(userStore.user?.role, requiredRole)) {
      // Insufficient role, redirect to dashboard
      next({ name: 'Dashboard' });
    } else {
      next();
    }
  } else {
    // Allow navigation
    next();
  }
});

export default router;
