<template>
  <nav class="story-navigation" :class="{ horizontal }" :aria-label="t('storyShell.navigation')">
    <RouterLink v-for="item in storyNavigation" :key="item.name" :to="{ name: item.name }"
      :class="{ selected: active === item.name }" :aria-current="active === item.name ? 'page' : undefined"
      @click="emit('navigate')">
      <span class="nav-symbol" aria-hidden="true">{{ item.symbol }}</span><span>{{ t(item.label) }}</span>
    </RouterLink>
  </nav>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storyNavigation, storyNavigationSection } from './story-navigation';
const props = defineProps<{ horizontal?: boolean; section?: string }>();
const emit = defineEmits<{ navigate: [] }>();
const route = useRoute();
const { t } = useI18n();
const active = computed(() => props.section || storyNavigationSection(route.name));
</script>
<style scoped>
.story-navigation { display:grid; gap:6px; padding:0 16px; }
a { display:flex; align-items:center; gap:14px; min-height:48px; padding:10px 14px; border-radius:10px; color:var(--text-secondary); text-decoration:none; }
a:hover { background:var(--bg-hover); }
a.selected { color:var(--accent-text); background:var(--accent-light); }
a:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.nav-symbol { width:22px; font-size:22px; text-align:center; }
.horizontal { display:flex; padding:0 8px; gap:4px; width:100%; }
.horizontal a { flex:1; flex-direction:column; gap:2px; padding:4px; font-size:11px; min-height:52px; }
.horizontal .nav-symbol { font-size:20px; }
</style>
