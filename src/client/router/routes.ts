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
const loadWorldBooks = () => import(/* webpackChunkName: "worldbooks" */ '../pages/WorldBooks.vue');
const loadTerms = () => import('../pages/legal/Terms.vue');
const loadPrivacy = () => import('../pages/legal/Privacy.vue');
const loadAbout = () => import('../pages/legal/About.vue');
const loadNotFound = () => import('../pages/NotFound.vue');
const loadNotifications = () => import(/* webpackChunkName: "notifications" */ '../pages/Notifications.vue');
const loadUserProfile = () => import(/* webpackChunkName: "user-profile" */ '../pages/UserProfile.vue');
const loadDeveloperSettings = () => import(/* webpackChunkName: "developer" */ '../pages/DeveloperSettings.vue');
const loadPluginMarketplace = () => import(/* webpackChunkName: "plugins" */ '../pages/PluginMarketplace.vue');

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
    path: '/worldbooks',
    name: 'WorldBooks',
    component: loadWorldBooks,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/terms',
    name: 'Terms',
    component: loadTerms,
    meta: {
      requiresAuth: false,
      guestOnly: false,
    },
  },
  {
    path: '/privacy',
    name: 'Privacy',
    component: loadPrivacy,
    meta: {
      requiresAuth: false,
      guestOnly: false,
    },
  },
  {
    path: '/about',
    name: 'About',
    component: loadAbout,
    meta: {
      requiresAuth: false,
      guestOnly: false,
    },
  },
  {
    path: '/notifications',
    name: 'Notifications',
    component: loadNotifications,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/developer',
    name: 'DeveloperSettings',
    component: loadDeveloperSettings,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/user/:userId',
    name: 'UserProfile',
    component: loadUserProfile,
    meta: {
      requiresAuth: false,
      guestOnly: false,
    },
  },
  {
    path: '/plugins',
    name: 'PluginMarketplace',
    component: loadPluginMarketplace,
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
