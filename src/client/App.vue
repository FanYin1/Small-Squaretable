<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import zhCn from 'element-plus/dist/locale/zh-cn.mjs';
import en from 'element-plus/dist/locale/en.mjs';
import LoadingOverlay from './components/ui/LoadingOverlay.vue';
import ToastContainer from './components/ui/ToastContainer.vue';
import { useLoading } from './composables';

const { locale } = useI18n();
const elementLocale = computed(() => locale.value === 'zh-CN' ? zhCn : en);

const route = useRoute();
const { visible } = useLoading();

const isLoading = computed(() => visible.value.visible);
const loadingText = computed(() => visible.value.text);
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <!-- All pages render with page transition -->
    <router-view v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </router-view>
    <LoadingOverlay :visible="isLoading" :text="loadingText" />
    <ToastContainer />
  </el-config-provider>
</template>

<style>
/* Global styles loaded via main.ts imports */
</style>
