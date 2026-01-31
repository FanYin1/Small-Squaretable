import { createRouter, createWebHistory } from 'vue-router';
import { routes } from './routes';
import './types';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Navigation guard for authentication
router.beforeEach((to, from, next) => {
  const isAuthenticated = localStorage.getItem('token') !== null;

  if (to.meta.requiresAuth && !isAuthenticated) {
    // Redirect to login if route requires auth and user is not authenticated
    next('/auth/login');
  } else if (to.meta.guestOnly && isAuthenticated) {
    // Redirect to home if route is guest-only and user is authenticated
    next('/');
  } else {
    // Allow navigation
    next();
  }
});

export default router;
