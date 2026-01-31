import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../pages/Home.vue'),
    meta: {
      requiresAuth: false,
      guestOnly: false,
    },
  },
  {
    path: '/auth/login',
    name: 'Login',
    component: () => import('../pages/auth/Login.vue'),
    meta: {
      requiresAuth: false,
      guestOnly: true,
    },
  },
  {
    path: '/auth/register',
    name: 'Register',
    component: () => import('../pages/auth/Register.vue'),
    meta: {
      requiresAuth: false,
      guestOnly: true,
    },
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('../pages/Chat.vue'),
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/chat/:chatId',
    name: 'ChatSession',
    component: () => import('../pages/Chat.vue'),
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/market',
    name: 'Market',
    component: () => import('../pages/Market.vue'),
    meta: {
      requiresAuth: false,
      guestOnly: false,
    },
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('../pages/Profile.vue'),
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/subscription',
    name: 'Subscription',
    component: () => import('../pages/Subscription.vue'),
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
];
