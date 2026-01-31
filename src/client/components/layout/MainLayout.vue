<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import AppHeader from './AppHeader.vue';
import AppSidebar from './AppSidebar.vue';

const isMobile = ref(false);
const showSidebar = ref(true);

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768;
  if (isMobile.value) {
    showSidebar.value = false;
  } else {
    showSidebar.value = true;
  }
};

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});
</script>

<template>
  <el-container class="main-layout">
    <AppHeader />
    <el-container class="content-container">
      <AppSidebar v-if="showSidebar" />
      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.main-layout {
  height: 100vh;
  width: 100%;
  overflow: hidden;
}

.content-container {
  height: calc(100vh - 60px);
  overflow: hidden;
}

.main-content {
  background-color: #ffffff;
  overflow-y: auto;
  padding: 24px;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive Design */
@media (max-width: 768px) {
  .main-content {
    padding: 16px;
  }
}

/* Dark theme support preparation */
@media (prefers-color-scheme: dark) {
  .main-content {
    background-color: var(--el-bg-color);
  }
}
</style>
