<script setup lang="ts">
import { computed } from 'vue';
import MainLayout from './components/layout/MainLayout.vue';
import LoadingOverlay from './components/ui/LoadingOverlay.vue';
import { useLoading } from './composables';

const { visible, startLoading, stopLoading } = useLoading();

// Compute the visible state from the reactive object
const isLoading = computed(() => visible.value.visible);
const loadingText = computed(() => visible.value.text);
</script>

<template>
  <MainLayout />
  <LoadingOverlay :visible="isLoading" :text="loadingText" />
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
