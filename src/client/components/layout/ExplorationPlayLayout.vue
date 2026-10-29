<template><div class="exploration-layout story-shell exploration-play"><slot /></div></template>
<script setup lang="ts">
import '@client/styles/exploration-entry.css';
</script>
<style scoped>
.exploration-play { height: 100dvh; min-height: 0; overflow: hidden; }
</style>
