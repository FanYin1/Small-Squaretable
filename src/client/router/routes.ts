import type { RouteRecordRaw } from 'vue-router';

// Define preload/prefetch hints for performance
// @ts-ignore - Custom webpackChunkName comment for code splitting
const loadHome = () => import(/* webpackPrefetch: true */ '../pages/Home.vue');
const loadLogin = () => import(/* webpackPrefetch: true */ '../pages/auth/Login.vue');
const loadRegister = () => import(/* webpackPrefetch: true */ '../pages/auth/Register.vue');
const loadForgotPassword = () => import('../pages/auth/ForgotPassword.vue');
const loadResetPassword = () => import('../pages/auth/ResetPassword.vue');
const loadVerifyEmail = () => import('../pages/auth/VerifyEmail.vue');
const loadOAuthCallback = () => import('../pages/auth/OAuthCallback.vue');
const loadChat = () => import(/* webpackChunkName: "chat" */ '../pages/Chat.vue');
const loadMarket = () => import(/* webpackPrefetch: true */ '../pages/Market.vue');
const loadMyCharacters = () => import(/* webpackChunkName: "characters" */ '../pages/MyCharacters.vue');
const loadCharacterEditor = () => import(/* webpackChunkName: "character-editor" */ '../pages/CharacterEditor.vue');
const loadProfile = () => import(/* webpackChunkName: "profile" */ '../pages/Profile.vue');
const loadSubscription = () => import(/* webpackChunkName: "subscription" */ '../pages/Subscription.vue');
const loadWorldBooks = () => import(/* webpackChunkName: "worldbooks" */ '../pages/WorldBooks.vue');
const loadWorldBookDetail = () => import(/* webpackChunkName: "worldbooks" */ '../pages/WorldBookDetail.vue');
const loadTerms = () => import('../pages/legal/Terms.vue');
const loadPrivacy = () => import('../pages/legal/Privacy.vue');
const loadAbout = () => import('../pages/legal/About.vue');
const loadNotFound = () => import('../pages/NotFound.vue');
const loadCharacterDetail = () => import(/* webpackChunkName: "character-detail" */ '../pages/CharacterDetail.vue');
const loadNotifications = () => import(/* webpackChunkName: "notifications" */ '../pages/Notifications.vue');
const loadUserProfile = () => import(/* webpackChunkName: "user-profile" */ '../pages/UserProfile.vue');
const loadDeveloperSettings = () => import(/* webpackChunkName: "developer" */ '../pages/DeveloperSettings.vue');
const loadPluginMarketplace = () => import(/* webpackChunkName: "plugins" */ '../pages/PluginMarketplace.vue');
const loadActivityFeed = () => import(/* webpackChunkName: "activity-feed" */ '../pages/ActivityFeed.vue');
const loadSearch = () => import(/* webpackChunkName: "search" */ '../pages/Search.vue');
const loadAnalytics = () => import(/* webpackChunkName: "analytics" */ '../pages/analytics/AnalyticsDashboard.vue');
const loadSecuritySettings = () => import(/* webpackChunkName: "security" */ '../pages/SecuritySettings.vue');
const loadAccountSettings = () => import(/* webpackChunkName: "account" */ '../pages/AccountSettings.vue');
const loadAdminLayout = () => import(/* webpackChunkName: "admin" */ '../pages/admin/AdminLayout.vue');
const loadAdminUsers = () => import(/* webpackChunkName: "admin" */ '../pages/admin/UserManagement.vue');
const loadAdminContent = () => import(/* webpackChunkName: "admin" */ '../pages/admin/ContentModeration.vue');
const loadAdminSystem = () => import(/* webpackChunkName: "admin" */ '../pages/admin/SystemDashboard.vue');
const loadAdminAuditLogs = () => import(/* webpackChunkName: "admin" */ '../pages/admin/AuditLogs.vue');
const loadAdminExperiments = () => import(/* webpackChunkName: "admin" */ '../pages/admin/Experiments.vue');
const loadCharacterTemplates = () => import(/* webpackChunkName: "character-templates" */ '../pages/CharacterTemplates.vue');

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
    redirect: { name: 'Chat' },
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
    path: '/auth/forgot-password',
    name: 'ForgotPassword',
    component: loadForgotPassword,
    meta: {
      requiresAuth: false,
      guestOnly: true,
    },
  },
  {
    path: '/auth/reset-password',
    name: 'ResetPassword',
    component: loadResetPassword,
    meta: {
      requiresAuth: false,
      guestOnly: true,
    },
  },
  {
    path: '/auth/verify-email',
    name: 'VerifyEmail',
    component: loadVerifyEmail,
    meta: {
      requiresAuth: false,
      guestOnly: true,
    },
  },
  {
    path: '/auth/oauth-callback',
    name: 'OAuthCallback',
    component: loadOAuthCallback,
    meta: {
      requiresAuth: false,
      guestOnly: true,
    },
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
    path: '/characters/new',
    name: 'CharacterCreate',
    component: loadCharacterEditor,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/characters/:id/edit',
    name: 'CharacterEdit',
    component: loadCharacterEditor,
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
    path: '/security',
    name: 'SecuritySettings',
    component: loadSecuritySettings,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/account',
    name: 'AccountSettings',
    component: loadAccountSettings,
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
    path: '/worldbooks/:id',
    name: 'WorldBookDetail',
    component: loadWorldBookDetail,
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
    path: '/feed',
    name: 'ActivityFeed',
    component: loadActivityFeed,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/search',
    name: 'Search',
    component: loadSearch,
    meta: {
      requiresAuth: true,
      layout: 'chat',
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
    path: '/analytics',
    name: 'Analytics',
    component: loadAnalytics,
    meta: {
      requiresAuth: true,
      guestOnly: false,
    },
  },
  {
    path: '/admin',
    component: loadAdminLayout,
    meta: {
      requiresAuth: true,
      requiresRole: 'moderator',
    },
    children: [
      {
        path: '',
        redirect: '/admin/content',
      },
      {
        path: 'users',
        name: 'AdminUsers',
        component: loadAdminUsers,
        meta: {
          requiresAuth: true,
          requiresRole: 'admin',
        },
      },
      {
        path: 'content',
        name: 'AdminContent',
        component: loadAdminContent,
        meta: {
          requiresAuth: true,
          requiresRole: 'moderator',
        },
      },
      {
        path: 'system',
        name: 'AdminSystem',
        component: loadAdminSystem,
        meta: {
          requiresAuth: true,
          requiresRole: 'admin',
        },
      },
      {
        path: 'audit-logs',
        name: 'AdminAuditLogs',
        component: loadAdminAuditLogs,
        meta: {
          requiresAuth: true,
          requiresRole: 'admin',
        },
      },
      {
        path: 'experiments',
        name: 'AdminExperiments',
        component: loadAdminExperiments,
        meta: {
          requiresAuth: true,
          requiresRole: 'admin',
        },
      },
    ],
  },
  {
    path: '/characters/:id',
    name: 'CharacterDetail',
    component: loadCharacterDetail,
    meta: {
      requiresAuth: false,
      guestOnly: false,
    },
  },
  {
    path: '/character-templates',
    name: 'CharacterTemplates',
    component: loadCharacterTemplates,
    meta: {
      requiresAuth: false,
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
