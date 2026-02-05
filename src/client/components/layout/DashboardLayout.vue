<script setup lang="ts">
import LeftSidebar from './LeftSidebar.vue';
import UserMenu from './UserMenu.vue';
</script>

<template>
  <div class="dashboard-layout">
    <LeftSidebar />

    <div class="dashboard-main">
      <header class="top-bar">
        <div class="top-bar-left">
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
          <UserMenu />
        </div>
      </header>

      <main class="dashboard-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-color-page);
}

.dashboard-main {
  flex: 1;
  margin-left: 64px;
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
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
  box-shadow: var(--box-shadow-sm);
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
  color: var(--text-color-primary);
  margin: 0;
  white-space: nowrap;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-color-secondary);
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
}

.dashboard-content {
  flex: 1;
  padding: 24px 32px;
}

@media (max-width: 1024px) {
  .top-bar {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 12px;
  }

  .top-bar-center,
  .top-bar-actions,
  .top-bar-user {
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .dashboard-content {
    padding: 16px;
  }
}
</style>
