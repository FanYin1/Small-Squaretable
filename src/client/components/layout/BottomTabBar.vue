<script setup lang="ts">
import StoryNavigation from './StoryNavigation.vue';
</script>
<template><div class="bottom-tab-bar"><StoryNavigation horizontal /></div></template>
<style scoped lang="scss">
.bottom-tab-bar { display:flex; position:fixed; inset:auto 0 0; padding:8px 0 max(8px, env(safe-area-inset-bottom)); background:var(--bg-surface); border-top:1px solid var(--border-default); z-index:1000; }
@include from(lg) { .bottom-tab-bar { display:none; } }
</style>
