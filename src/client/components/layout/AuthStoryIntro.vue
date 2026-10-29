<template><section class="auth-story-intro"><StoryBrand /><h2>{{ t('storyShell.authHeading') }}</h2><p>{{ t('storyShell.authDescription') }}</p></section></template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import StoryBrand from './StoryBrand.vue';
const { t } = useI18n();
</script>
