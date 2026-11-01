<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import en from 'element-plus/es/locale/lang/en';
import LoadingOverlay from './components/ui/LoadingOverlay.vue';
import ToastContainer from './components/ui/ToastContainer.vue';
import SearchCommandPalette from './components/search/SearchCommandPalette.vue';
import { useLoading } from './composables';
import WorkbenchShell from './components/layout/WorkbenchShell.vue';
import { workbenchRoutes } from './components/layout/workbench';

const { locale } = useI18n();
const elementLocale = computed(() => locale.value === 'zh-CN' ? zhCn : en);
watch(locale, value => { document.documentElement.lang = value; }, { immediate: true });

const route = useRoute();
const { visible } = useLoading();

const inWorkbench = computed(() => workbenchRoutes.has(String(route.name)));

const isLoading = computed(() => visible.value.visible);
const loadingText = computed(() => visible.value.text);
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <router-view v-slot="{ Component }">
      <WorkbenchShell v-if="inWorkbench">
        <Transition name="workbench-page" mode="out-in"><component :is="Component" /></Transition>
      </WorkbenchShell>
      <Transition v-else name="page" mode="out-in"><component :is="Component" /></Transition>
    </router-view>
    <LoadingOverlay :visible="isLoading" :text="loadingText" />
    <ToastContainer />
    <SearchCommandPalette />
  </el-config-provider>
</template>

<style>
/* Global styles loaded via main.ts imports */
</style>
