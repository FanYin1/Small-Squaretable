<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@client/stores/user';
import { creditsApi, type CreditBalance } from '@client/services/credits.api';
import { llmApi, type ModelMeta } from '@client/services/llm.api';

const { t } = useI18n();
const user = useUserStore();
const owner = computed(() => user.user ? JSON.stringify([user.user.tenantId, user.user.id]) : null);
const balance = ref<CreditBalance | null>(null);
const models = ref<ModelMeta[]>([]);
const failed = ref(false);
const loading = ref(false);
let version = 0;
async function refresh() {
  const requestedVersion = ++version;
  balance.value = null;
  models.value = [];
  failed.value = false;
  loading.value = Boolean(owner.value);
  if (!owner.value) return;
  const [balanceResult, modelResult] = await Promise.allSettled([creditsApi.getBalance(), llmApi.getModels()]);
  if (version !== requestedVersion) return;
  if (balanceResult.status === 'fulfilled') balance.value = balanceResult.value;
  if (modelResult.status === 'fulfilled') models.value = modelResult.value;
  failed.value = balanceResult.status === 'rejected' || modelResult.status === 'rejected';
  loading.value = false;
}
watch(owner, refresh, { immediate: true, flush: 'sync' });
onScopeDispose(() => { version += 1; });
</script>

<template>
  <section class="story-entry-context" :aria-label="t('storyShell.beforeEntry')" :aria-busy="loading">
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <p v-if="balance?.billingMode === 'credits'">{{ t('characterDetail.availablePoints', { points: balance.unlimited ? t('credits.unlimited') : balance.availablePoints }) }}</p>
    <p v-if="balance?.billingMode === 'credits' && !balance.unlimited && balance.availableTokens <= 0" role="status">{{ t('credits.insufficient') }}</p>
    <p v-if="failed" role="alert">{{ t('storyShell.entryContextFailed') }} <button type="button" @click="refresh">{{ t('common.retry') }}</button></p>
    <details v-if="!loading"><summary>{{ t('storyShell.modelOptions') }}</summary><p>{{ t('storyShell.modelHint') }}</p><ul v-if="models.length"><li v-for="model in models" :key="model.id">{{ model.id }}</li></ul><p v-else>{{ t('storyShell.noModels') }}</p></details>
  </section>
</template>

<style scoped>
.story-entry-context { padding:16px; margin:16px 0; border:1px solid var(--border-default); border-radius:12px; background:var(--bg-subtle); font-size:14px; color:var(--text-secondary); line-height:1.75; }
p { margin:0 0 8px; }
summary { min-height:44px; padding:10px 0; cursor:pointer; color:var(--text-primary); }
li { overflow-wrap:anywhere; }
button { min-height:44px; padding:8px 16px; background:var(--bg-surface); color:var(--accent-text); border:1px solid var(--border-interactive); border-radius:8px; cursor:pointer; }
</style>
