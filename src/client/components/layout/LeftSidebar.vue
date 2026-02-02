<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Home, ChatDotRound, Shop, User, TrendCharts, Setting } from '@element-plus/icons-vue';

const router = useRouter();
const route = useRoute();
const expanded = ref(false);

interface NavItem {
  key: string;
  label: string;
  icon: any;
  path: string;
}

const navItems: NavItem[] = [
  { key: 'home', label: '首页', icon: Home, path: '/' },
  { key: 'chat', label: '会话', icon: ChatDotRound, path: '/chat' },
  { key: 'market', label: '角色市场', icon: Shop, path: '/market' },
  { key: 'characters', label: '我的角色', icon: User, path: '/my-characters' },
  { key: 'subscription', label: '订阅管理', icon: TrendCharts, path: '/subscription' },
  { key: 'settings', label: '设置', icon: Setting, path: '/profile' },
];

const isActive = (path: string) => {
  return route.path === path;
};

const handleNavigate = (path: string) => {
  router.push(path);
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
        v-for="item in navItems"
        :key="item.key"
        :class="['nav-item', { active: isActive(item.path) }]"
        @click="handleNavigate(item.path)"
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
  background: #1F2937;
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
  color: #F9FAFB;
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
  background: #374151;
}

.nav-item.active {
  background: #3B82F6;
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
