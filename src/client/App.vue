<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import LoadingOverlay from './components/ui/LoadingOverlay.vue';
import ToastContainer from './components/ui/ToastContainer.vue';
import { useLoading } from './composables';

const route = useRoute();
const { visible } = useLoading();

const isLoading = computed(() => visible.value.visible);
const loadingText = computed(() => visible.value.text);
</script>

<template>
  <!-- All pages render directly through router-view -->
  <router-view />
  <LoadingOverlay :visible="isLoading" :text="loadingText" />
  <ToastContainer />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  width: 100%;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
    'Noto Color Emoji';
}
</style>
