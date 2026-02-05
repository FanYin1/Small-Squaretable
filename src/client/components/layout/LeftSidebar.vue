<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { HomeFilled, ChatDotRound, Shop, User, TrendCharts, Setting } from '@element-plus/icons-vue';
import { isTokenValid } from '@client/utils/auth';

const router = useRouter();
const route = useRoute();
const expanded = ref(false);

interface NavItem {
  key: string;
  label: string;
  icon: any;
  path: string;
  name: string;
  authRequired?: boolean;
}

const navItems: NavItem[] = [
  { key: 'home', label: '首页', icon: HomeFilled, path: '/', name: 'Home', authRequired: false },
  { key: 'chat', label: '会话', icon: ChatDotRound, path: '/chat', name: 'Chat', authRequired: true },
  { key: 'market', label: '角色市场', icon: Shop, path: '/market', name: 'Market', authRequired: false },
  { key: 'characters', label: '我的角色', icon: User, path: '/my-characters', name: 'MyCharacters', authRequired: true },
  { key: 'subscription', label: '订阅管理', icon: TrendCharts, path: '/subscription', name: 'Subscription', authRequired: true },
  { key: 'settings', label: '设置', icon: Setting, path: '/profile', name: 'Profile', authRequired: true },
];

const isAuthenticated = computed(() => {
  const token = localStorage.getItem('token');
  return isTokenValid(token);
});

const visibleNavItems = computed(() => {
  return navItems.filter(item => !item.authRequired || isAuthenticated.value);
});

const isActive = (name: string) => {
  // 对于首页，需要同时检查 Home 和 Dashboard
  if (name === 'Home') {
    return route.name === 'Home' || route.name === 'Dashboard';
  }
  return route.name === name;
};

const handleNavigate = (name: string) => {
  // 如果点击首页且已登录，导航到 Dashboard
  if (name === 'Home' && isAuthenticated.value) {
    router.push({ name: 'Dashboard' });
  } else {
    router.push({ name });
  }
};

const handleMouseEnter = () => {
  expanded.value = true;
};

const handleMouseLeave = () => {
  expanded.value = false;
};
</script>

<template>
  <aside
    :class="['left-sidebar', { expanded }]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <nav class="nav-list">
      <button
        v-for="item in visibleNavItems"
        :key="item.key"
        :class="['nav-item', { active: isActive(item.name) }]"
        @click="handleNavigate(item.name)"
      >
        <el-icon class="nav-icon" :size="24">
          <component :is="item.icon" />
        </el-icon>
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </nav>
  </aside>
</template>

<style scoped>
.left-sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 64px;
  background: var(--sidebar-bg);
  transition: width 0.3s ease;
  z-index: 100;
  overflow: hidden;
}

.left-sidebar.expanded {
  width: 240px;
}

.nav-list {
  display: flex;
  flex-direction: column;
  padding: 16px 0;
  gap: 4px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 8px;
  margin: 0 8px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--sidebar-text-color);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
  min-height: 64px;
}

.left-sidebar.expanded .nav-item {
  flex-direction: row;
  justify-content: flex-start;
  padding: 12px 16px;
  gap: 12px;
  text-align: left;
}

.nav-item:hover {
  background: var(--sidebar-hover-bg);
}

.nav-item.active {
  background: var(--sidebar-active-bg);
  color: white;
}

.nav-icon {
  flex-shrink: 0;
}

.nav-label {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.left-sidebar.expanded .nav-label {
  font-size: 15px;
}

/* 移动端隐藏 */
@media (max-width: 767px) {
  .left-sidebar {
    transform: translateX(-100%);
  }

  .left-sidebar.mobile-visible {
    transform: translateX(0);
  }
}
</style>
