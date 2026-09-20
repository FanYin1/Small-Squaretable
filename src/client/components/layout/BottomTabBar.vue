<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChatDotRound, User, ShoppingBag, Search, Setting } from '@element-plus/icons-vue';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const tabs = [
  { name: 'Chat', icon: ChatDotRound, label: () => t('nav.chat'), path: '/chat' },
  { name: 'MyCharacters', icon: User, label: () => t('nav.characters'), path: '/my-characters' },
  { name: 'Market', icon: ShoppingBag, label: () => t('nav.market'), path: '/market' },
  { name: 'Search', icon: Search, label: () => t('search.title'), path: '/search' },
  { name: 'Profile', icon: Setting, label: () => t('nav.settings'), path: '/profile' },
];

const activeTab = computed(() => {
  const path = route.path;
  for (const tab of tabs) {
    if (path.startsWith(tab.path)) return tab.name;
  }
  return 'Chat';
});

function navigate(tab: typeof tabs[0]) {
  router.push({ name: tab.name });
}
</script>

<template>
  <nav class="bottom-tab-bar">
    <button
      v-for="tab in tabs"
      :key="tab.name"
      class="tab-item"
      :class="{ active: activeTab === tab.name }"
      @click="navigate(tab)"
    >
      <el-icon :size="20"><component :is="tab.icon" /></el-icon>
      <span class="tab-label">{{ tab.label() }}</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color-lighter);
  z-index: 1000;
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: 1;
  height: 100%;
  border: none;
  background: none;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.2s;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

.tab-item.active {
  color: var(--el-color-primary);
}

.tab-label {
  font-size: 10px;
  line-height: 1;
}

@media (min-width: 768px) {
  .bottom-tab-bar {
    display: none;
  }
}
</style>
