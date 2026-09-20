<script setup lang="ts">
import { ref } from 'vue';
import { Fold } from '@element-plus/icons-vue';
import LeftSidebar from './LeftSidebar.vue';
import UserMenu from './UserMenu.vue';
import BottomTabBar from './BottomTabBar.vue';
import DeviceIndicator from './DeviceIndicator.vue';
import ConnectionIndicator from './ConnectionIndicator.vue';
import NotificationBell from './NotificationBell.vue';

const mobileSidebarVisible = ref(false);

const toggleMobileSidebar = () => {
  mobileSidebarVisible.value = !mobileSidebarVisible.value;
};

const closeMobileSidebar = () => {
  mobileSidebarVisible.value = false;
};
</script>

<template>
  <div class="dashboard-layout">
    <LeftSidebar :mobile-visible="mobileSidebarVisible" @close="closeMobileSidebar" />

    <div class="dashboard-main">
      <header class="top-bar" role="banner">
        <div class="top-bar-left">
          <button class="mobile-menu-btn" aria-label="Toggle menu" @click="toggleMobileSidebar">
            <el-icon :size="22"><Fold /></el-icon>
          </button>
          <div class="title-wrapper">
            <h1 v-if="$slots.title" class="page-title">
              <slot name="title" />
            </h1>
            <p v-if="$slots.subtitle" class="page-subtitle">
              <slot name="subtitle" />
            </p>
          </div>
        </div>

        <div class="top-bar-center">
          <slot name="center" />
        </div>

        <div class="top-bar-actions">
          <slot name="actions" />
        </div>

        <div class="top-bar-user">
          <ConnectionIndicator />
          <DeviceIndicator />
          <NotificationBell />
          <UserMenu />
        </div>
      </header>

      <main class="dashboard-content" role="main">
        <slot />
      </main>
    </div>

    <BottomTabBar />
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-base);
}

.dashboard-main {
  flex: 1;
  margin-left: 280px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.top-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 24px;
  padding: 16px 32px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  box-shadow: none;
}

.top-bar-left {
  display: flex;
  align-items: center;
  min-width: 0;
}

.title-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.top-bar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.top-bar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-bar-user {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.dashboard-content {
  flex: 1;
  padding: 24px 32px;
}

@media (max-width: 1024px) {
  .top-bar {
    grid-template-columns: 1fr auto;
    gap: 8px;
  }

  .top-bar-center {
    display: none;
  }

  .top-bar-actions {
    justify-content: flex-end;
  }
}

@media (max-width: 768px) {
  .dashboard-main {
    margin-left: 0;
  }

  .dashboard-content {
    padding: 16px;
    padding-bottom: 72px;
  }
}

.mobile-menu-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  margin-right: 12px;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.mobile-menu-btn:hover {
  background: var(--bg-base);
  border-color: var(--accent);
  color: var(--accent-text);
}

@media (max-width: 767px) {
  .mobile-menu-btn {
    display: flex;
  }
}

</style>
