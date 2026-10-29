<template>
  <section v-if="visible" class="story-onboarding" :aria-label="t('storyShell.getStarted')">
    <div aria-live="polite"><small>{{ step + 1 }} / 3 · {{ t('storyShell.getStarted') }}</small><h2>{{ t(`storyShell.onboarding${step + 1}`) }}</h2><p>{{ t(`storyShell.onboardingCopy${step + 1}`) }}</p></div>
    <div class="onboarding-actions"><button type="button" @click="dismiss">{{ t('storyShell.skip') }}</button><button type="button" @click="next">{{ step === 2 ? t('common.confirm') : t('storyShell.next') }}</button></div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@client/stores/user';
import { useStoryOnboarding } from '@client/composables/useStoryOnboarding';
const { t } = useI18n();
const user = useUserStore();
const owner = computed(() => user.isAuthenticated && user.user ? JSON.stringify([user.user.tenantId, user.user.id]) : null);
const { visible, step, next, dismiss } = useStoryOnboarding(owner);
</script>
<style scoped lang="scss">
.story-onboarding { display:flex; gap:20px; align-items:center; justify-content:space-between; padding:20px 24px; border:1px solid var(--border-default); border-radius:14px; background:var(--bg-subtle); }
small { color:var(--accent-text); }
h2 { font-family:var(--font-display); font-size:22px; font-weight:500; margin:8px 0; }
p { color:var(--text-secondary); margin:0; line-height:1.7; }
.onboarding-actions { display:flex; gap:8px; flex-shrink:0; }
button { min-height:44px; padding:8px 16px; border:1px solid var(--border-interactive); border-radius:10px; color:var(--text-primary); background:var(--bg-surface); cursor:pointer; }
button:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
@include below(md) { .story-onboarding { flex-direction:column; align-items:flex-start; } }
</style>
