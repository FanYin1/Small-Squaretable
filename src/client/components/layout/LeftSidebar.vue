<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import StorySidebarContent from './StorySidebarContent.vue';
defineProps<{ mobileVisible?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const mobile = ref(window.innerWidth < 1024);
function resize() { mobile.value = window.innerWidth < 1024; if (!mobile.value) emit('close'); }
onMounted(() => window.addEventListener('resize', resize));
onUnmounted(() => window.removeEventListener('resize', resize));
</script>
<template>
  <aside v-if="!mobile" class="left-sidebar"><StorySidebarContent @navigate="emit('close')" /></aside>
  <el-drawer v-else :model-value="mobileVisible" :title="t('storyShell.navigation')" direction="ltr" size="min(300px, 90vw)" :show-close="true" @update:model-value="emit('close')">
    <StorySidebarContent @navigate="emit('close')" />
  </el-drawer>
</template>
<style scoped>
.left-sidebar { position:fixed; inset:0 auto 0 0; width:240px; background:var(--bg-subtle); border-right:1px solid var(--border-default); overflow-y:auto; z-index:100; }
</style>
