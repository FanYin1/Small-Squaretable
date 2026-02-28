<template>
  <div
    class="chat-layout"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- Mobile hamburger button -->
    <div class="mobile-header">
      <button class="mobile-hamburger" aria-label="Open sidebar" @click="openMobileSidebar">
        <el-icon :size="22"><Fold /></el-icon>
      </button>
    </div>

    <!-- Sidebar backdrop (mobile only) -->
    <Transition name="fade">
      <div
        v-if="isMobile && mobileOpen"
        class="sidebar-backdrop"
        @click="closeMobileSidebar"
      />
    </Transition>

    <!-- Sidebar wrapper -->
    <aside
      :class="[
        'chat-sidebar-wrapper',
        {
          collapsed: !isMobile && sidebarCollapsed,
          'mobile-open': isMobile && mobileOpen,
          'mobile-closed': isMobile && !mobileOpen,
        },
      ]"
    >
      <ChatSidebar
        @toggle-collapse="toggleCollapse"
        @new-chat="emit('new-chat')"
        @select-chat="handleSelectChat"
      />
    </aside>

    <!-- Main content area -->
    <div :class="['chat-main', { 'sidebar-is-collapsed': !isMobile && sidebarCollapsed }]">
      <!-- Sidebar restore button (desktop only, when collapsed) -->
      <button
        v-if="!isMobile && sidebarCollapsed"
        class="sidebar-restore-btn"
        aria-label="Open sidebar"
        @click="toggleCollapse"
      >
        <el-icon :size="18"><Expand /></el-icon>
      </button>
      <slot />
    </div>

    <!-- Bottom tab bar (mobile only) -->
    <BottomTabBar v-if="isMobile" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Fold, Expand } from '@element-plus/icons-vue';
import ChatSidebar from '@client/components/chat/ChatSidebar.vue';
import BottomTabBar from '@client/components/layout/BottomTabBar.vue';

const MOBILE_BREAKPOINT = 768;
const STORAGE_KEY = 'chat-sidebar-collapsed';

interface Emits {
  (e: 'new-chat'): void;
  (e: 'select-chat', chatId: string): void;
}

const emit = defineEmits<Emits>();

const sidebarCollapsed = ref(localStorage.getItem(STORAGE_KEY) === 'true');
const isMobile = ref(window.innerWidth < MOBILE_BREAKPOINT);
const mobileOpen = ref(false);

const toggleCollapse = () => {
  if (isMobile.value) {
    mobileOpen.value = false;
  } else {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    localStorage.setItem(STORAGE_KEY, String(sidebarCollapsed.value));
  }
};

const openMobileSidebar = () => {
  mobileOpen.value = true;
};

const closeMobileSidebar = () => {
  mobileOpen.value = false;
};

const handleSelectChat = (chatId: string) => {
  emit('select-chat', chatId);
  if (isMobile.value) {
    mobileOpen.value = false;
  }
};

// Swipe gesture state
const touchStartX = ref(0);
const touchStartY = ref(0);
const isSwiping = ref(false);
const EDGE_ZONE = 20; // px from left edge to start swipe
const SWIPE_THRESHOLD = 50; // px to trigger open/close

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  touchStartX.value = touch.clientX;
  touchStartY.value = touch.clientY;
  // Only start swipe tracking if near left edge (for open) or sidebar is open (for close)
  isSwiping.value = touch.clientX < EDGE_ZONE || mobileOpen.value;
}

function onTouchMove(e: TouchEvent) {
  if (!isSwiping.value) return;
  // Prevent default only if horizontal swipe is dominant
  const touch = e.touches[0];
  const dx = touch.clientX - touchStartX.value;
  const dy = touch.clientY - touchStartY.value;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
    // Horizontal swipe detected — could add visual feedback here
  }
}

function onTouchEnd(e: TouchEvent) {
  if (!isSwiping.value) return;
  isSwiping.value = false;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX.value;
  const dy = touch.clientY - touchStartY.value;

  // Only process if horizontal movement is dominant
  if (Math.abs(dx) < Math.abs(dy)) return;

  if (!mobileOpen.value && touchStartX.value < EDGE_ZONE && dx > SWIPE_THRESHOLD) {
    // Swipe right from left edge → open sidebar
    mobileOpen.value = true;
  } else if (mobileOpen.value && dx < -SWIPE_THRESHOLD) {
    // Swipe left → close sidebar
    mobileOpen.value = false;
  }
}

const onResize = () => {
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
  if (!isMobile.value) {
    mobileOpen.value = false;
  }
};

onMounted(() => {
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
});
</script>

<style scoped>
.chat-layout {
  display: flex;
  height: 100vh;
  background: var(--chat-bg);
  position: relative;
}

/* ---- Sidebar wrapper ---- */
.chat-sidebar-wrapper {
  width: 280px;
  flex-shrink: 0;
  transition: width 0.3s ease;
  overflow: hidden;
  background: var(--chat-sidebar-bg);
  border-right: 1px solid var(--border-default);
}

.chat-sidebar-wrapper.collapsed {
  width: 0;
}

/* ---- Main content ---- */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
}

/* ---- Sidebar restore button ---- */
.sidebar-restore-btn {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.sidebar-restore-btn:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}

/* Offset chat header when sidebar restore button is visible */
.sidebar-is-collapsed :deep(.chat-header) {
  padding-left: 52px;
}

/* ---- Mobile header (hamburger) ---- */
.mobile-header {
  display: none;
}

.mobile-hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mobile-hamburger:hover {
  background: var(--chat-sidebar-bg);
}

/* ---- Sidebar backdrop (mobile) ---- */
.sidebar-backdrop {
  display: none;
}

/* ---- Fade transition for backdrop ---- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ---- Mobile styles ---- */
@media (max-width: 767px) {
  .mobile-header {
    display: flex;
    align-items: center;
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 50;
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 99;
  }

  .chat-sidebar-wrapper {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 100;
    width: 280px;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    border-right: 1px solid var(--border-default);
  }

  .chat-sidebar-wrapper.mobile-open {
    transform: translateX(0);
  }

  .chat-sidebar-wrapper.mobile-closed {
    transform: translateX(-100%);
  }

  .chat-sidebar-wrapper.collapsed {
    width: 280px;
    transform: translateX(-100%);
  }

  .chat-main {
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
