<script setup lang="ts">
import { ref, computed, watch, onScopeDispose } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@client/stores/user';
import { creditsApi, type CreditBalance, type CreditLedgerItem } from '@client/services/credits.api';

const { t } = useI18n();
const emit = defineEmits<{ mode: [value: 'credits' | 'subscription' | null] }>();

const LEDGER_PAGE_SIZE = 10;

const balance = ref<CreditBalance | null>(null);
const items = ref<CreditLedgerItem[]>([]);
const failed = ref(false);
const loading = ref(false);
const userStore = useUserStore();
const owner = computed(() => userStore.user ? JSON.stringify([userStore.user.tenantId, userStore.user.id]) : null);
let version = 0;

async function load() {
  const requestedVersion = ++version;
  if (!owner.value) return;
  failed.value = false;
  loading.value = true;
  try {
    const result = await creditsApi.getBalance();
    if (requestedVersion !== version) return;
    balance.value = result;
    emit('mode', result.billingMode);
    items.value = [];
    if (result.billingMode === 'credits') {
      const ledger = await creditsApi.getLedger({ page: 1, limit: LEDGER_PAGE_SIZE });
      if (requestedVersion !== version) return;
      items.value = ledger.items;
    }
  } catch {
    if (requestedVersion === version) failed.value = true;
  } finally {
    if (requestedVersion === version) loading.value = false;
  }
}

function formatPoints(points: number): string {
  const text = Math.abs(points).toLocaleString(undefined, { maximumFractionDigits: 4 });
  return points > 0 ? `+${text}` : points < 0 ? `-${text}` : text;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString();
}

watch(owner, () => {
  version += 1;
  balance.value = null;
  items.value = [];
  failed.value = false;
  loading.value = false;
  emit('mode', null);
  void load();
}, { immediate: true, flush: 'sync' });
onScopeDispose(() => { version += 1; });

defineExpose({ load });
</script>

<template>
  <section v-if="balance && balance.billingMode === 'credits'" class="credits-balance" :aria-label="t('credits.title')">
    <h3 class="credits-title">{{ t('credits.title') }}</h3>

    <dl class="balance-grid">
      <div>
        <dt>{{ t('credits.available') }}</dt>
        <dd class="balance-main" data-testid="available-points">{{ balance.unlimited ? t('credits.unlimited') : balance.availablePoints }}</dd>
      </div>
      <div v-if="balance.heldTokens > 0">
        <dt>{{ t('credits.held') }}</dt>
        <dd data-testid="held-points">{{ (balance.heldTokens / balance.tokensPerPoint).toLocaleString(undefined, { maximumFractionDigits: 4 }) }}</dd>
      </div>
    </dl>

    <h4 class="credits-subtitle">{{ t('credits.rulesTitle') }}</h4>
    <p v-if="balance.unlimited" class="credits-rules" data-testid="credits-rules">{{ t('credits.unlimitedHint') }}</p>
    <ul v-else class="credits-rules" data-testid="credits-rules">
      <li>{{ t('credits.ruleNoExpiry') }}</li>
      <li>{{ t('credits.ruleNoRefund') }}</li>
      <li>{{ t('credits.ruleReversal') }}</li>
    </ul>

    <h4 class="credits-subtitle">{{ t('credits.recent') }}</h4>
    <p v-if="failed" class="credits-error" role="alert">{{ t('credits.refreshFailed') }} <button type="button" @click="load">{{ t('credits.refresh') }}</button></p>
    <p v-else-if="loading" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="items.length === 0" class="credits-empty">{{ t('credits.noRecords') }}</p>
    <div v-else class="ledger-scroll" tabindex="0" :aria-label="t('credits.recent')"><table class="credits-ledger">
      <thead>
        <tr>
          <th scope="col">{{ t('credits.time') }}</th>
          <th scope="col">{{ t('credits.kind') }}</th>
          <th scope="col">{{ t('credits.points') }}</th>
          <th scope="col">{{ t('credits.story') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>{{ formatDate(item.createdAt) }}</td>
          <td>{{ t(`credits.kinds.${item.kind}`) }}</td>
          <td class="points" :class="{ negative: item.points < 0 }">{{ formatPoints(item.points) }}</td>
          <td><RouterLink v-if="item.chatId" :to="{ name: 'ChatSession', params: { chatId: item.chatId } }">{{ t('credits.openStory') }}<span v-if="item.messageId"> #{{ item.messageId }}</span></RouterLink></td>
        </tr>
      </tbody>
    </table></div>
  </section>
  <p v-else-if="failed" class="credits-error" role="alert">{{ t('credits.loadFailed') }} <button type="button" @click="load">{{ t('credits.refresh') }}</button></p>
  <p v-else-if="loading" role="status">{{ t('common.loading') }}</p>
</template>

<style scoped lang="scss">
.ledger-scroll { overflow-x: auto; }
.credits-error button { min-height: 44px; padding: 8px 16px; border: 1px solid var(--border-interactive); border-radius: 8px; color: var(--accent-text); background: var(--bg-surface); cursor: pointer; }
.credits-balance {
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.credits-title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.credits-subtitle {
  margin: 16px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.balance-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
  margin: 0;

  dt {
    font-size: 13px;
    color: var(--text-secondary);
  }

  dd {
    margin: 4px 0 0;
    font-size: 16px;
    color: var(--text-primary);
  }
}

.balance-main {
  font-size: 28px !important;
  font-weight: 700;
}

.credits-rules {
  margin: 0;
  padding-left: 20px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.credits-empty,
.credits-error {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.credits-ledger {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;

  th,
  td {
    padding: 6px 8px;
    text-align: left;
    border-bottom: 1px solid var(--border-default);
  }

  th {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .points {
    font-variant-numeric: tabular-nums;
  }

  .negative {
    color: var(--text-secondary);
  }
}
</style>
