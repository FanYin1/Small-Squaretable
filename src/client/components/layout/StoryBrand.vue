<template>
  <RouterLink :to="{ name: 'Market' }" class="story-brand" :aria-label="t('storyShell.brand')">
    <span class="story-brand-mark" aria-hidden="true">◈</span>
    <span>{{ t('storyShell.brand') }}<small>SMALL SQUARETABLE</small></span>
  </RouterLink>
</template>
<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>
<style scoped>
.story-brand { display:flex; align-items:center; gap:12px; padding:28px 24px; color:var(--text-primary); text-decoration:none; font-size:21px; letter-spacing:.08em; }
.story-brand-mark { font-size:36px; color:var(--accent-text); }
.story-brand small { display:block; font-size:9px; letter-spacing:.12em; color:var(--text-tertiary); }
.story-brand:focus-visible { outline:2px solid var(--accent); outline-offset:-4px; }
</style>
