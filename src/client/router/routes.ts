import type { RouteRecordRaw } from 'vue-router';

// Define preload/prefetch hints for performance
// @ts-ignore - Custom webpackChunkName comment for code splitting
const loadHome = () => import(/* webpackPrefetch: true */ '../pages/Home.vue');
const loadDashboard = () => import(/* webpackPrefetch: true */ '../pages/Dashboard.vue');
const loadLogin = () => import(/* webpackPrefetch: true */ '../pages/auth/Login.vue');
const loadRegister = () => import(/* webpackPrefetch: true */ '../pages/auth/Register.vue');
const loadChat = () => import(/* webpackChunkName: "chat" */ '../pages/Chat.vue');
const loadMarket = () => import(/* webpackPrefetch: true */ '../pages/Market.vue');
const loadMyCharacters = () => import(/* webpackChunkName: "characters" */ '../pages/MyCharacters.vue');
const loadProfile = () => import(/* webpackChunkName: "profile" */ '../pages/Profile.vue');
const loadSubscription = () => import(/* webpackChunkName: "subscription" */ '../pages/Subscription.vue');
const loadNotFound = () => import('../pages/NotFound.vue');

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: loadHome,
    meta: {
      requiresAuth: false,
      guestOnly: true,
    },
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: loadDashboard,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/auth/login',
    name: 'Login',
    component: loadLogin,
    meta: {
      requiresAuth: false,
      guestOnly: true,
    },
  },
  {
    path: '/login',
    redirect: '/auth/login',
  },
  {
    path: '/auth/register',
    name: 'Register',
    component: loadRegister,
    meta: {
      requiresAuth: false,
      guestOnly: true,
    },
  },
  {
    path: '/register',
    redirect: '/auth/register',
  },
  {
    path: '/chat',
    name: 'Chat',
    component: loadChat,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/chat/:chatId',
    name: 'ChatSession',
    component: loadChat,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/market',
    name: 'Market',
    component: loadMarket,
    meta: {
      requiresAuth: false,
      guestOnly: false,
    },
  },
  {
    path: '/my-characters',
    name: 'MyCharacters',
    component: loadMyCharacters,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/profile',
    name: 'Profile',
    component: loadProfile,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/subscription',
    name: 'Subscription',
    component: loadSubscription,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: loadNotFound,
    meta: {
      requiresAuth: false,
      guestOnly: false,
    },
  },
];
