<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { User, Document, DataBoard, List, Delete, TrendCharts, Ticket } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores/user';
import { useModulesStore } from '@client/stores/modules';
import type { ModuleName } from '@/types/modules';

const { t } = useI18n();
const route = useRoute();
const userStore = useUserStore();
const modulesStore = useModulesStore();

const isAdmin = computed(() => userStore.user?.role === 'admin');

interface MenuItem {
  path: string;
  icon: unknown;
  label: string;
  /** 所属功能模块（P2-1）；模块关闭时不显示。不带 module 的条目始终显示。 */
  module?: ModuleName;
}

const menuItems = computed(() => {
  const items: MenuItem[] = [
    { path: '/admin/content', icon: Document, label: t('admin.nav.content') },
  ];
  if (isAdmin.value) {
    items.unshift({ path: '/admin/users', icon: User, label: t('admin.nav.users') });
    items.push(
      { path: '/admin/system', icon: DataBoard, label: t('admin.nav.system'), module: 'admin_advanced' },
      { path: '/admin/audit-logs', icon: List, label: t('admin.nav.auditLogs'), module: 'admin_advanced' },
      { path: '/admin/gdpr', icon: Delete, label: t('admin.nav.gdpr'), module: 'admin_advanced' },
      { path: '/admin/experiments', icon: TrendCharts, label: t('admin.nav.experiments'), module: 'analytics' },
      { path: '/admin/invite-codes', icon: Ticket, label: t('admin.nav.inviteCodes') },
    );
  }
  return items.filter((item) => modulesStore.isEnabled(item.module));
});

const activeMenu = computed(() => route.path);
</script>

<template>
  <div class="admin-layout">
    <aside class="admin-sidebar" role="navigation" :aria-label="t('admin.title')">
      <div class="sidebar-header">
        <h2 class="sidebar-title">{{ t('admin.title') }}</h2>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="admin-menu"
      >
        <el-menu-item
          v-for="item in menuItems"
          :key="item.path"
          :index="item.path"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <main class="admin-content" role="main">
      <router-view />
    </main>
  </div>
</template>

<style scoped lang="scss">
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-base);
}

.admin-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 24px 20px 16px;
  border-bottom: 1px solid var(--border-default);
}

.sidebar-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.admin-menu {
  border-right: none;
  padding: 8px 0;
}

.admin-content {
  flex: 1;
  padding: 24px 32px;
  min-width: 0;
  overflow-y: auto;
}

@include below(md) {
  .admin-layout {
    flex-direction: column;
  }

  .admin-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border-default);
  }

  .admin-menu {
    display: flex;
    overflow-x: auto;
  }

  .admin-content {
    padding: 16px;
  }
}
</style>
