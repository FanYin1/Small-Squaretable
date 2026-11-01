<script setup lang="ts">
import { inject, watch, onBeforeUnmount } from 'vue';
import { workbenchSection } from './workbench';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useUserStore } from '@client/stores/user';
import { useTheme } from '@client/composables/useTheme';
import StoryBrand from './StoryBrand.vue';
import StoryNavigation from './StoryNavigation.vue';
import '@client/styles/exploration-entry.css';

const props = withDefaults(defineProps<{ navigationSection?: string; reading?: boolean }>(), { reading: false });
const section = inject(workbenchSection, undefined);
const inWorkbench = Boolean(section);
watch(() => props.navigationSection, value => { if (section) section.value = value; }, { immediate: true });
onBeforeUnmount(() => { if (section && section.value === props.navigationSection) section.value = undefined; });
const { t } = useI18n();
const route = useRoute();
const user = useUserStore();
const { theme, toggleTheme } = useTheme();
</script>

<template>
  <div :class="inWorkbench ? ['workbench-page-content', { 'workbench-page-reading': reading }] : 'exploration-layout story-shell'">
    <a class="exploration-skip" href="#exploration-content">{{ t('exploration.skipToContent') }}</a>
    <header v-if="!inWorkbench" class="exploration-header">
      <StoryBrand />
      <StoryNavigation class="exploration-navigation" :section="navigationSection" />
      <div class="exploration-account">
        <button type="button" class="exploration-theme" :aria-label="t(theme === 'dark' ? 'exploration.lightTheme' : 'exploration.darkTheme')" @click="toggleTheme">
          <span aria-hidden="true">{{ theme === 'dark' ? '☼' : '☾' }}</span>
        </button>
        <RouterLink v-if="user.isAuthenticated" :to="{ name: 'Profile' }" class="exploration-profile">{{ user.user?.name || t('storyShell.account') }}</RouterLink>
        <RouterLink v-else :to="{ name: 'Login', query: { redirect: route.fullPath } }" class="guest-login">{{ t('nav.login') }}</RouterLink>
      </div>
    </header>
    <main id="exploration-content" class="exploration-content" :class="{ 'reading-content': reading }" tabindex="-1">
      <div v-if="$slots.actions || $slots.center" class="exploration-page-actions"><slot name="center" /><slot name="actions" /></div>
      <slot />
    </main>
  </div>
</template>
