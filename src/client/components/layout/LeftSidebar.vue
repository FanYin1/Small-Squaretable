<script setup lang="ts">
import { ref, computed, type Component } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  HomeFilled,
  ChatDotRound,
  Shop,
  User,
  TrendCharts,
  Setting,
  Notebook,
  Sunny,
  Moon,
  SwitchButton,
  Key,
  Connection,
  Avatar,
} from '@element-plus/icons-vue';
import { useTheme, useLocale } from '@client/composables';
import { useUserStore } from '@client/stores';
import { isTokenValid } from '@client/utils/auth';

const props = defineProps<{
  mobileVisible?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const { isDark, toggleTheme } = useTheme();
const { currentLocale, toggleLocale } = useLocale();
const userStore = useUserStore();

const handleLogout = async () => {
  await userStore.logout();
  router.push({ name: 'Login' });
};

const isMobile = ref(window.innerWidth < 768);

interface NavItem {
  key: string;
  i18nKey: string;
  icon: Component;
  name: string;
  authRequired?: boolean;
}

const navItems: NavItem[] = [
  { key: 'home', i18nKey: 'nav.home', icon: HomeFilled, name: 'Home' },
  { key: 'chat', i18nKey: 'nav.chat', icon: ChatDotRound, name: 'Chat', authRequired: true },
  { key: 'market', i18nKey: 'nav.market', icon: Shop, name: 'Market' },
  { key: 'characters', i18nKey: 'nav.myCharacters', icon: User, name: 'MyCharacters', authRequired: true },
  { key: 'personas', i18nKey: 'nav.personas', icon: Avatar, name: 'UserPersonas', authRequired: true },
  { key: 'worldbooks', i18nKey: 'nav.worldBooks', icon: Notebook, name: 'WorldBooks', authRequired: true },
  { key: 'subscription', i18nKey: 'nav.subscription', icon: TrendCharts, name: 'Subscription', authRequired: true },
  { key: 'developer', i18nKey: 'nav.developer', icon: Key, name: 'DeveloperSettings', authRequired: true },
  { key: 'plugins', i18nKey: 'nav.plugins', icon: Connection, name: 'PluginMarketplace', authRequired: true },
  { key: 'settings', i18nKey: 'nav.settings', icon: Setting, name: 'Profile', authRequired: true },
];

const isAuthenticated = computed(() => isTokenValid(localStorage.getItem('token')));
const visibleNavItems = computed(() => navItems.filter(item => !item.authRequired || isAuthenticated.value));

const isActive = (name: string) => {
  if (name === 'Home') return route.name === 'Home' || route.name === 'Chat' || route.name === 'ChatSession';
  return route.name === name;
};

const handleNavigate = (name: string) => {
  if (name === 'Home' && isAuthenticated.value) {
    router.push({ name: 'Chat' });
  } else {
    router.push({ name });
  }
  emit('close');
};
</script>

<template>
  <!-- Mobile backdrop overlay -->
  <div
    v-if="props.mobileVisible"
    class="sidebar-backdrop"
    @click="emit('close')"
  />
  <aside
    :class="['left-sidebar', { 'mobile-visible': props.mobileVisible }]"
    role="navigation"
    aria-label="Main sidebar"
  >
    <!-- Brand -->
    <div class="sidebar-brand">
      <span class="brand-icon">SS</span>
      <span class="brand-text">Small Squaretable</span>
    </div>

    <!-- Navigation -->
    <nav class="nav-list">
      <button
        v-for="item in visibleNavItems"
        :key="item.key"
        :class="['nav-item', { active: isActive(item.name) }]"
        @click="handleNavigate(item.name)"
      >
        <el-icon class="nav-icon" :size="22"><component :is="item.icon" /></el-icon>
        <span class="nav-label">{{ $t(item.i18nKey) }}</span>
      </button>
    </nav>

    <!-- Bottom section -->
    <div class="sidebar-bottom">
      <!-- User info section -->
      <div class="sidebar-user">
        <el-avatar :size="32" :src="userStore.user?.avatar">
          {{ userStore.user?.name?.[0] || '?' }}
        </el-avatar>
        <div class="user-info">
          <span class="user-name">{{ userStore.user?.name }}</span>
          <span class="user-email">{{ userStore.user?.email }}</span>
        </div>
      </div>

      <!-- Theme toggle -->
      <button class="nav-item" @click="toggleTheme">
        <el-icon class="nav-icon" :size="22"><component :is="isDark ? Sunny : Moon" /></el-icon>
        <span class="nav-label">{{ $t('theme.toggle') }}</span>
      </button>

      <!-- Language toggle -->
      <button class="nav-item" @click="toggleLocale">
        <span class="nav-icon locale-icon">{{ currentLocale === 'zh-CN' ? 'EN' : '中' }}</span>
        <span class="nav-label">{{ currentLocale === 'zh-CN' ? $t('settings.languageEn') : $t('settings.languageZh') }}</span>
      </button>

      <!-- Logout -->
      <button class="nav-item logout-item" :title="t('nav.logout')" :aria-label="t('nav.logout')" @click="handleLogout">
        <el-icon class="nav-icon" :size="22"><SwitchButton /></el-icon>
        <span class="nav-label">{{ t('nav.logout') }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.left-sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Brand */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px;
  border-bottom: 1px solid var(--sidebar-border);
  min-height: 64px;
}

.brand-icon {
  font-size: 20px;
  font-weight: 800;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  flex-shrink: 0;
  width: 32px;
  text-align: center;
}

.brand-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--sidebar-text-active);
  white-space: nowrap;
}

/* Navigation */
.nav-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  gap: 2px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  margin: 1px 8px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--sidebar-text);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  min-height: 44px;
}

.nav-item:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-text-active);
}

.nav-item.active {
  background: var(--sidebar-active);
  color: var(--sidebar-text-active);
  font-weight: 600;
}

.nav-icon {
  flex-shrink: 0;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.locale-icon {
  font-size: 13px;
  font-weight: 700;
  width: 24px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-label {
  font-size: 14px;
  font-weight: 500;
}

/* Bottom section */
.sidebar-bottom {
  border-top: 1px solid var(--sidebar-border);
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* User info */
.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sidebar-border);
  margin-bottom: 8px;
}

.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sidebar-text-active);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Logout item styling */
.logout-item {
  margin-top: 4px;
}

/* Mobile backdrop */
.sidebar-backdrop {
  display: none;
}

@media (max-width: 767px) {
  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--text-primary) 50%, transparent);
    z-index: 99;
  }

  .left-sidebar {
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .left-sidebar.mobile-visible {
    transform: translateX(0);
  }
}
</style>
