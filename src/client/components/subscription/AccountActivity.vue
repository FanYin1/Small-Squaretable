<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, ArrowRight, Refresh } from '@element-plus/icons-vue';
import { creditsApi, type CreditActivity, type CreditBalance, type CreditLedgerResponse } from '@client/services/credits.api';
import { useUserStore } from '@client/stores/user';
import type { CreditLedgerFilters, CreditRange } from '../../../types/credit-activity';

const { t, locale } = useI18n();
const user = useUserStore();
const owner = computed(() => user.user ? JSON.stringify([user.user.tenantId, user.user.id]) : null);
const balance = ref<CreditBalance | null>(null);
const activity = ref<CreditActivity | null>(null);
const ledger = ref<CreditLedgerResponse | null>(null);
const balanceLoading = ref(false);
const activityLoading = ref(false);
const ledgerLoading = ref(false);
const balanceFailed = ref(false);
const activityFailed = ref(false);
const ledgerFailed = ref(false);
const days = ref(30);
const kind = ref<NonNullable<CreditLedgerFilters['kind']> | ''>('');
const page = ref(1);
const range = ref<CreditRange>(makeRange());
let balanceVersion = 0;
let activityVersion = 0;
let ledgerVersion = 0;

function makeRange(): CreditRange {
  const now = Date.now();
  return { from: new Date(now - days.value * 86400000).toISOString(), to: new Date(now).toISOString() };
}

function number(value: number) {
  return value.toLocaleString(locale.value, { maximumFractionDigits: 4 });
}

function date(value: string) {
  return new Date(value).toLocaleString(locale.value, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadBalance() {
  const version = ++balanceVersion;
  if (!owner.value) return;
  balanceLoading.value = true;
  balanceFailed.value = false;
  try {
    const result = await creditsApi.getBalance();
    if (version === balanceVersion) balance.value = result;
  } catch {
    if (version === balanceVersion) balanceFailed.value = true;
  } finally {
    if (version === balanceVersion) balanceLoading.value = false;
  }
}

async function loadActivity() {
  const version = ++activityVersion;
  if (!owner.value || balance.value?.billingMode !== 'credits') return;
  activityLoading.value = true;
  activityFailed.value = false;
  activity.value = null;
  try {
    const result = await creditsApi.getActivity({ ...range.value });
    if (version === activityVersion) activity.value = result;
  } catch {
    if (version === activityVersion) activityFailed.value = true;
  } finally {
    if (version === activityVersion) activityLoading.value = false;
  }
}

async function loadLedger() {
  const version = ++ledgerVersion;
  if (!owner.value || balance.value?.billingMode !== 'credits') return;
  ledgerLoading.value = true;
  ledgerFailed.value = false;
  ledger.value = null;
  try {
    const result = await creditsApi.getLedger({ ...range.value, page: page.value, limit: 10, ...(kind.value ? { kind: kind.value } : {}) });
    if (version === ledgerVersion) ledger.value = result;
  } catch {
    if (version === ledgerVersion) ledgerFailed.value = true;
  } finally {
    if (version === ledgerVersion) ledgerLoading.value = false;
  }
}

function resetActivity() {
  activityVersion++;
  ledgerVersion++;
  activity.value = null;
  ledger.value = null;
  activityLoading.value = false;
  ledgerLoading.value = false;
  activityFailed.value = false;
  ledgerFailed.value = false;
}

function refreshPeriod() {
  range.value = makeRange();
  page.value = 1;
  void loadActivity();
  void loadLedger();
}

function changeKind() {
  page.value = 1;
  void loadLedger();
}

function movePage(direction: -1 | 1) {
  if (ledgerLoading.value || !(direction === 1 ? ledger.value?.pagination.hasNext : ledger.value?.pagination.hasPrev)) return;
  page.value += direction;
  void loadLedger();
}

watch(() => balance.value?.billingMode, mode => {
  resetActivity();
  if (mode === 'credits') { void loadActivity(); void loadLedger(); }
}, { flush: 'sync' });
watch(owner, () => {
  balanceVersion++;
  resetActivity();
  balance.value = null;
  balanceLoading.value = false;
  balanceFailed.value = false;
  kind.value = '';
  page.value = 1;
  days.value = 30;
  range.value = makeRange();
  void loadBalance();
}, { immediate: true, flush: 'sync' });
onScopeDispose(() => { balanceVersion++; activityVersion++; ledgerVersion++; });
</script>

<template>
  <section class="account-activity" :aria-label="t('accountActivity.heading')">
    <div class="section-heading">
      <h2>{{ t('accountActivity.heading') }}</h2>
      <button class="icon-button" type="button" :title="t('credits.refresh')" :aria-label="t('credits.refresh')" :disabled="balanceLoading" @click="loadBalance"><Refresh aria-hidden="true" /></button>
    </div>
    <p v-if="balanceFailed" role="alert" class="request-state">{{ t('credits.loadFailed') }} <button type="button" @click="loadBalance">{{ t('common.retry') }}</button></p>
    <p v-else-if="balanceLoading" role="status" class="request-state">{{ t('common.loading') }}</p>
    <div v-else-if="balance?.billingMode === 'credits'" class="balance-summary">
      <div><span>{{ t('credits.available') }}</span><strong data-testid="account-available">{{ balance.unlimited ? t('credits.unlimited') : number(balance.availablePoints) }} <small>{{ t('credits.points') }}</small></strong></div>
      <div><span>{{ t('credits.held') }}</span><strong data-testid="account-held">{{ number(balance.heldTokens / balance.tokensPerPoint) }} <small>{{ t('credits.points') }}</small></strong></div>
    </div>
    <p v-if="balance?.billingMode === 'subscription'" class="subscription-mode">{{ t('accountActivity.subscriptionMode') }} <RouterLink :to="{ name: 'Subscription' }">{{ t('storyShell.credits') }}</RouterLink></p>

    <template v-if="balance?.billingMode === 'credits'">
      <div class="period-heading">
        <h3>{{ t('accountActivity.periodSummary') }}</h3>
        <div class="period-controls">
          <label for="account-period" class="visually-hidden">{{ t('accountActivity.period') }}</label>
          <select id="account-period" v-model.number="days" @change="refreshPeriod"><option v-for="period in [7, 30, 90]" :key="period" :value="period">{{ t('accountActivity.lastDays', { days: period }) }}</option></select>
          <button class="icon-button" type="button" :title="t('accountActivity.refreshPeriod')" :aria-label="t('accountActivity.refreshPeriod')" :disabled="activityLoading || ledgerLoading" @click="refreshPeriod"><Refresh aria-hidden="true" /></button>
        </div>
      </div>
      <p class="period-range"><time :datetime="range.from">{{ date(range.from) }}</time> ~ <time :datetime="range.to">{{ date(range.to) }}</time><span>{{ t('accountActivity.rangeBoundary') }}</span></p>
      <p v-if="activityFailed" role="alert" class="request-state">{{ t('accountActivity.summaryFailed') }} <button type="button" @click="loadActivity">{{ t('common.retry') }}</button></p>
      <p v-else-if="activityLoading" role="status" class="request-state">{{ t('common.loading') }}</p>
      <template v-else-if="activity">
        <dl class="period-metrics">
          <div><dt>{{ t('accountActivity.spent') }}</dt><dd>{{ number(activity.spentPoints) }} <small>{{ t('credits.points') }}</small></dd></div>
          <div><dt>{{ t('accountActivity.credited') }}</dt><dd>{{ number(activity.creditedPoints) }} <small>{{ t('credits.points') }}</small></dd></div>
          <div><dt>{{ t('accountActivity.adjustments') }}</dt><dd>{{ number(activity.adjustmentPoints) }} <small>{{ t('credits.points') }}</small></dd></div>
        </dl>
        <div class="recorded-usage" data-testid="recorded-usage">
          <span>{{ t('accountActivity.recordedUsage') }}</span>
          <strong>{{ activity.inputTokens === null ? t('accountActivity.unknown') : number(activity.inputTokens) }} <small>{{ t('accountActivity.input') }}</small></strong>
          <strong>{{ activity.outputTokens === null ? t('accountActivity.unknown') : number(activity.outputTokens) }} <small>{{ t('accountActivity.output') }}</small></strong>
          <p>{{ activity.chargeCount ? t('accountActivity.coverage', { known: activity.knownUsageCount, total: activity.chargeCount }) : t('accountActivity.noCharges') }}<span v-if="activity.unknownUsageCount"> · {{ t('accountActivity.missingUsage', { count: activity.unknownUsageCount }) }}</span></p>
        </div>
      </template>

      <div class="period-heading ledger-heading">
        <h3>{{ t('accountActivity.ledger') }}</h3>
        <label class="kind-filter"><span>{{ t('credits.kind') }}</span><select v-model="kind" data-testid="ledger-kind" @change="changeKind"><option value="">{{ t('accountActivity.allKinds') }}</option><option v-for="value in ['topup', 'charge', 'reversal']" :key="value" :value="value">{{ t(`accountActivity.kinds.${value}`) }}</option></select></label>
      </div>
      <p v-if="ledgerFailed" role="alert" class="request-state">{{ t('accountActivity.ledgerFailed') }} <button type="button" @click="loadLedger">{{ t('common.retry') }}</button></p>
      <p v-else-if="ledgerLoading" role="status" class="request-state">{{ t('common.loading') }}</p>
      <p v-else-if="ledger?.items.length === 0" class="request-state">{{ t('accountActivity.empty') }}</p>
      <template v-else-if="ledger">
        <ol class="activity-ledger" aria-live="polite">
          <li v-for="item in ledger.items" :key="item.id">
            <time :datetime="item.createdAt">{{ date(item.createdAt) }}</time>
            <div class="entry-purpose"><strong>{{ t(`accountActivity.kinds.${item.kind}`) }}</strong><RouterLink v-if="item.chatId" :to="{ name: 'ChatSession', params: { chatId: item.chatId } }">{{ t('credits.openStory') }}</RouterLink><small v-if="item.kind === 'charge'">{{ item.inputTokens === undefined || item.outputTokens === undefined ? t('accountActivity.usageUnknown') : t('accountActivity.entryUsage', { input: number(item.inputTokens), output: number(item.outputTokens) }) }}</small></div>
            <strong class="entry-amount" :class="{ incoming: item.points > 0 }">{{ item.points > 0 ? '+' : '' }}{{ number(item.points) }} <small>{{ t('credits.points') }}</small></strong>
          </li>
        </ol>
        <nav class="ledger-pagination" :aria-label="t('accountActivity.pagination')">
          <span>{{ t('accountActivity.page', { page: ledger.pagination.page, pages: ledger.pagination.totalPages, count: ledger.pagination.total }) }}</span>
          <button class="icon-button" type="button" :disabled="!ledger.pagination.hasPrev" :aria-label="t('accountActivity.previous')" :title="t('accountActivity.previous')" @click="movePage(-1)"><ArrowLeft aria-hidden="true" /></button>
          <button class="icon-button" type="button" :disabled="!ledger.pagination.hasNext" :aria-label="t('accountActivity.next')" :title="t('accountActivity.next')" @click="movePage(1)"><ArrowRight aria-hidden="true" /></button>
        </nav>
      </template>
    </template>
  </section>
</template>

<style scoped lang="scss">
.account-activity { min-width: 0; border-block: 1px solid var(--border-default); padding-block: 24px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.section-heading, .period-heading, .period-controls, .kind-filter { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2, h3, p, dl { margin: 0; }
h2 { font-size: 22px; font-weight: 500; }
h3 { font-size: 16px; font-weight: 600; }
.icon-button { width: 44px; height: 44px; flex-shrink: 0; display: inline-grid; place-items: center; padding: 11px; border: 1px solid var(--border-default); border-radius: 6px; color: var(--text-secondary); background: transparent; cursor: pointer; }
.icon-button svg { width: 20px; height: 20px; }
button:disabled { cursor: default; opacity: .45; }
select { min-height: 44px; max-width: 100%; padding: 8px 12px; border: 1px solid var(--border-interactive); border-radius: 6px; color: var(--text-primary); background: var(--bg-surface); font: inherit; }
select:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.balance-summary { display: flex; flex-wrap: wrap; gap: 24px 64px; padding: 16px 0 28px; }
.balance-summary > div { display: grid; gap: 8px; }
.balance-summary span, dt, .recorded-usage > span { color: var(--text-secondary); font-size: 13px; }
.balance-summary strong { font-size: 32px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
small { font-size: 12px; font-weight: 400; color: var(--text-secondary); }
.period-heading { flex-wrap: wrap; }
.period-range { margin: 8px 0 20px; font-size: 12px; color: var(--text-secondary); overflow-wrap: anywhere; }
.period-range span { display: block; margin-top: 4px; }
.period-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
dd { margin: 8px 0 0; font-size: 22px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.recorded-usage { display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px 24px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-default); }
.recorded-usage strong { font-size: 16px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.recorded-usage p { width: 100%; font-size: 12px; color: var(--text-secondary); line-height: 1.7; }
.ledger-heading { margin-top: 32px; }
.kind-filter > span { font-size: 13px; color: var(--text-secondary); }
.activity-ledger { list-style: none; padding: 0; margin: 12px 0 0; }
.activity-ledger li { display: grid; grid-template-columns: 150px minmax(0, 1fr) minmax(80px, auto); align-items: start; gap: 16px; padding: 16px 0; border-top: 1px solid var(--border-default); }
.activity-ledger time { font-size: 12px; color: var(--text-secondary); line-height: 1.8; }
.entry-purpose { display: flex; flex-wrap: wrap; gap: 6px 12px; min-width: 0; font-size: 14px; overflow-wrap: anywhere; }
.entry-purpose small { width: 100%; line-height: 1.7; }
.entry-amount { text-align: right; font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.entry-amount.incoming { color: var(--accent-text); }
a { color: var(--accent-text); text-underline-offset: 3px; }
.ledger-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.ledger-pagination span { margin-right: auto; font-size: 12px; color: var(--text-secondary); }
.request-state { min-height: 72px; padding-block: 20px; font-size: 14px; color: var(--text-secondary); line-height: 1.8; }
.request-state button { min-height: 44px; padding: 8px 12px; margin-left: 8px; border: 1px solid var(--border-interactive); border-radius: 6px; background: transparent; color: var(--accent-text); cursor: pointer; }
.subscription-mode { padding-top: 16px; line-height: 1.8; }
@include below(md) {
  .activity-ledger li { grid-template-columns: minmax(0, 1fr) minmax(80px, auto); gap: 8px 12px; }
  .activity-ledger time { grid-column: 1 / -1; }
  .balance-summary { gap: 24px 32px; }
  .balance-summary strong { font-size: 28px; }
  dd { font-size: 19px; }
  .kind-filter { gap: 8px; }
}
</style>
