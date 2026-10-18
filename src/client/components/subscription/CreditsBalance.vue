<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { creditsApi, type CreditBalance, type CreditLedgerItem } from '@client/services/credits.api';

const { t } = useI18n();

const LEDGER_PAGE_SIZE = 10;

const balance = ref<CreditBalance | null>(null);
const items = ref<CreditLedgerItem[]>([]);
const failed = ref(false);

async function load() {
  failed.value = false;
  try {
    balance.value = await creditsApi.getBalance();
    // 订阅模式没有点数账本，不必再拉流水
    if (balance.value.billingMode === 'credits') {
      const ledger = await creditsApi.getLedger({ page: 1, limit: LEDGER_PAGE_SIZE });
      items.value = ledger.items;
    }
  } catch {
    failed.value = true;
  }
}

function formatPoints(points: number): string {
  const text = Math.abs(points).toLocaleString(undefined, { maximumFractionDigits: 4 });
  return points > 0 ? `+${text}` : points < 0 ? `-${text}` : text;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString();
}

onMounted(load);

defineExpose({ load });
</script>

<template>
  <section v-if="balance && balance.billingMode === 'credits'" class="credits-balance" :aria-label="t('credits.title')">
    <h3 class="credits-title">{{ t('credits.title') }}</h3>

    <dl class="balance-grid">
      <div>
        <dt>{{ t('credits.available') }}</dt>
        <dd class="balance-main" data-testid="available-points">{{ balance.availablePoints }}</dd>
      </div>
      <div v-if="balance.heldTokens > 0">
        <dt>{{ t('credits.held') }}</dt>
        <dd data-testid="held-points">{{ (balance.heldTokens / balance.tokensPerPoint).toLocaleString(undefined, { maximumFractionDigits: 4 }) }}</dd>
      </div>
    </dl>

    <h4 class="credits-subtitle">{{ t('credits.rulesTitle') }}</h4>
    <ul class="credits-rules" data-testid="credits-rules">
      <li>{{ t('credits.ruleNoExpiry') }}</li>
      <li>{{ t('credits.ruleNoRefund') }}</li>
      <li>{{ t('credits.ruleReversal') }}</li>
    </ul>

    <h4 class="credits-subtitle">{{ t('credits.recent') }}</h4>
    <p v-if="items.length === 0" class="credits-empty">{{ t('credits.noRecords') }}</p>
    <table v-else class="credits-ledger">
      <thead>
        <tr>
          <th scope="col">{{ t('credits.time') }}</th>
          <th scope="col">{{ t('credits.kind') }}</th>
          <th scope="col">{{ t('credits.points') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>{{ formatDate(item.createdAt) }}</td>
          <td>{{ t(`credits.kinds.${item.kind}`) }}</td>
          <td class="points" :class="{ negative: item.points < 0 }">{{ formatPoints(item.points) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
  <p v-else-if="failed" class="credits-error" role="alert">{{ t('credits.loadFailed') }}</p>
</template>

<style scoped lang="scss">
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
