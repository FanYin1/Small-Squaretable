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
  Lock,
  Unlock,
  SwitchButton,
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

const hovered = ref(false);
const pinned = ref(false);
const isMobile = ref(window.innerWidth < 768);

const isExpanded = computed(() => hovered.value || pinned.value || props.mobileVisible);

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
  { key: 'worldbooks', i18nKey: 'nav.worldBooks', icon: Notebook, name: 'WorldBooks', authRequired: true },
  { key: 'subscription', i18nKey: 'nav.subscription', icon: TrendCharts, name: 'Subscription', authRequired: true },
  { key: 'settings', i18nKey: 'nav.settings', icon: Setting, name: 'Profile', authRequired: true },
];

const isAuthenticated = computed(() => isTokenValid(localStorage.getItem('token')));
const visibleNavItems = computed(() => navItems.filter(item => !item.authRequired || isAuthenticated.value));

const isActive = (name: string) => {
  if (name === 'Home') return route.name === 'Home' || route.name === 'Dashboard';
  return route.name === name;
};

const handleNavigate = (name: string) => {
  if (name === 'Home' && isAuthenticated.value) {
    router.push({ name: 'Dashboard' });
  } else {
    router.push({ name });
  }
  emit('close');
};

const handleMouseEnter = () => { if (!pinned.value) hovered.value = true; };
const handleMouseLeave = () => { if (!pinned.value) hovered.value = false; };
</script>

<template>
  <!-- Mobile backdrop overlay -->
  <div
    v-if="props.mobileVisible"
    class="sidebar-backdrop"
    @click="emit('close')"
  />
  <aside
    :class="['left-sidebar', { expanded: isExpanded, pinned, 'mobile-visible': props.mobileVisible }]"
    role="navigation"
    aria-label="Main sidebar"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
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
      <div v-if="isExpanded" class="sidebar-user">
        <el-avatar :size="32" :src="userStore.user?.avatar">
          {{ userStore.user?.name?.[0] || '?' }}
        </el-avatar>
        <div class="user-info">
          <span class="user-name">{{ userStore.user?.name }}</span>
          <span class="user-email">{{ userStore.user?.email }}</span>
        </div>
      </div>
      <button class="nav-item" @click="toggleTheme">
        <el-icon class="nav-icon" :size="22"><component :is="isDark ? Sunny : Moon" /></el-icon>
        <span class="nav-label">{{ $t('theme.toggle') }}</span>
      </button>
      <button class="nav-item" @click="toggleLocale">
        <span class="nav-icon locale-icon">{{ currentLocale === 'zh-CN' ? 'EN' : '中' }}</span>
        <span class="nav-label">{{ currentLocale === 'zh-CN' ? 'English' : '中文' }}</span>
      </button>
      <button class="sidebar-action" :title="t('nav.logout')" :aria-label="t('nav.logout')" @click="handleLogout">
        <el-icon :size="18"><SwitchButton /></el-icon>
        <span v-if="isExpanded" class="action-label">{{ t('nav.logout') }}</span>
      </button>
      <button class="pin-btn" :aria-label="pinned ? t('nav.unpinSidebar') || 'Unpin sidebar' : t('nav.pinSidebar') || 'Pin sidebar'" @click="pinned = !pinned" v-if="!isMobile">
        <el-icon :size="16"><component :is="pinned ? Unlock : Lock" /></el-icon>
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
  width: var(--sidebar-width);
  background: var(--sidebar-bg);
  transition: width 0.3s ease;
  z-index: 100;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.left-sidebar.expanded,
.left-sidebar.pinned {
  width: var(--sidebar-width-expanded);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--sidebar-text-active) 8%, transparent);
  min-height: 64px;
}

.brand-icon {
  font-size: 20px;
  font-weight: 800;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  flex-shrink: 0;
  width: 32px;
  text-align: center;
}

.brand-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--sidebar-text-active);
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s;
}
.left-sidebar.expanded .brand-text,
.left-sidebar.pinned .brand-text {
  opacity: 1;
}

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
  padding: 10px 20px;
  background: transparent;
  border: none;
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
}
.nav-label {
  font-size: 14px;
  font-weight: 500;
  opacity: 0;
  transition: opacity 0.2s;
}

.left-sidebar.expanded .nav-label,
.left-sidebar.pinned .nav-label {
  opacity: 1;
}

.sidebar-bottom {
  border-top: 1px solid color-mix(in srgb, var(--sidebar-text-active) 8%, transparent);
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
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
  color: var(--text-primary);
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

.sidebar-action {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: transparent;
  border: none;
  color: var(--sidebar-text);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  min-height: 44px;
}

.sidebar-action:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-text-active);
}

.action-label {
  font-size: 14px;
  font-weight: 500;
}

.pin-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  margin: 4px 16px;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--sidebar-text-active) 10%, transparent);
  border-radius: var(--radius-sm);
  color: var(--sidebar-text);
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0;
}

.left-sidebar.expanded .pin-btn,
.left-sidebar.pinned .pin-btn {
  opacity: 1;
}

.pin-btn:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-text-active);
}

/* Mobile */
@media (max-width: 767px) {
  .left-sidebar {
    transform: translateX(-100%);
    width: var(--sidebar-width-expanded);
  }

  .left-sidebar.mobile-visible {
    transform: translateX(0);
  }

  .left-sidebar.mobile-visible .nav-label,
  .left-sidebar.mobile-visible .brand-text {
    opacity: 1;
  }

  .pin-btn {
    display: none;
  }
}

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
}
</style>
