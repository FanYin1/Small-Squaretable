<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import {
  adminApi,
  type CreditLedgerEntry,
  type CreditLookupResult,
} from '@client/services/admin.api';
import { ApiError } from '@client/services/api';
import { useToast } from '@client/composables';
import { ElMessageBox } from 'element-plus';

const { t, te } = useI18n();
const toast = useToast();

const MAX_TOPUP_POINTS = 100000;

// ── 账户查询 ──
const lookupQuery = ref('');
const looking = ref(false);
const account = ref<CreditLookupResult | null>(null);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function newIdempotencyKey(): string {
  return `topup-${crypto.randomUUID()}`;
}

// 一次提交意图一个幂等键：失败后重试复用同一个键，成功后才换新，避免网络抖动造成重复入账
const topUp = reactive<{ points: number | null; note: string; key: string }>({
  points: null,
  note: '',
  key: newIdempotencyKey(),
});
const topUpBusy = ref(false);

// ── 运营流水 ──
const entries = ref<CreditLedgerEntry[]>([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);

const canTopUp = computed(
  () =>
    !!account.value &&
    typeof topUp.points === 'number' &&
    topUp.points > 0 &&
    topUp.points <= MAX_TOPUP_POINTS,
);

function errorMessage(error: unknown, fallbackKey: string): string {
  if (error instanceof ApiError) {
    const key = `admin.credits.errors.${error.code}`;
    if (error.code && te(key)) return t(key);
  }
  return t(fallbackKey);
}

function formatDate(d?: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleString();
}

function formatPoints(tokens: number, tokensPerPoint: number): string {
  return (tokens / tokensPerPoint).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

async function handleLookup() {
  const q = lookupQuery.value.trim();
  if (!q) return;
  looking.value = true;
  try {
    account.value = await adminApi.lookupCreditAccount(UUID_RE.test(q) ? { userId: q } : { email: q });
    topUp.key = newIdempotencyKey();
  } catch (error) {
    account.value = null;
    toast.error(errorMessage(error, 'admin.credits.lookupFailed'));
  } finally {
    looking.value = false;
  }
}

async function fetchEntries() {
  loading.value = true;
  try {
    const res = await adminApi.getCreditEntries({ page: currentPage.value, limit: pageSize.value });
    entries.value = res.items;
    total.value = res.pagination.total;
  } catch {
    toast.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function handleTopUp() {
  if (!account.value || !canTopUp.value || topUpBusy.value) return;
  const points = topUp.points as number;
  const target = account.value.user;
  try {
    await ElMessageBox.confirm(
      t('admin.credits.confirmTopUp', { points, email: target.email }),
      t('common.confirm'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' },
    );
  } catch {
    return;
  }
  topUpBusy.value = true;
  try {
    const note = topUp.note.trim();
    const res = await adminApi.topUpCredits({
      userId: target.id,
      points,
      idempotencyKey: topUp.key,
      ...(note ? { note } : {}),
    });
    account.value = { user: target, summary: res.summary };
    toast.success(t(res.replayed ? 'admin.credits.topUpReplayed' : 'admin.credits.topUpOk', { points }));
    topUp.points = null;
    topUp.note = '';
    topUp.key = newIdempotencyKey();
    currentPage.value = 1;
    await fetchEntries();
  } catch (error) {
    // 失败保留幂等键：用户点重试时，若第一次其实已入账，会命中重放而不是重复入账
    toast.error(errorMessage(error, 'admin.credits.topUpFailed'));
  } finally {
    topUpBusy.value = false;
  }
}

async function handleReverse(row: Pick<CreditLedgerEntry, 'id' | 'amount' | 'tenantEmail'>) {
  try {
    await ElMessageBox.confirm(
      t('admin.credits.confirmReverse', {
        points: account.value ? formatPoints(row.amount, account.value.summary.tokensPerPoint) : row.amount,
        email: row.tenantEmail ?? '-',
      }),
      t('common.confirm'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    const res = await adminApi.reverseCreditEntry(row.id, {});
    if (account.value && res.entry.tenantId === account.value.user.tenantId) {
      account.value = { user: account.value.user, summary: res.summary };
    }
    toast.success(t('admin.credits.reverseOk'));
    await fetchEntries();
  } catch (error) {
    toast.error(errorMessage(error, 'admin.credits.reverseFailed'));
  }
}

function handlePageChange(page: number) {
  currentPage.value = page;
  fetchEntries();
}

onMounted(() => fetchEntries());
</script>

<template>
  <div class="admin-credits">
    <div class="page-header">
      <h2 class="page-title">{{ t('admin.credits.title') }}</h2>
      <el-button :icon="Refresh" @click="fetchEntries">{{ t('common.refresh') }}</el-button>
    </div>

    <section class="panel" :aria-label="t('admin.credits.lookup')">
      <el-form inline class="lookup-form" @submit.prevent="handleLookup">
        <el-form-item :label="t('admin.credits.lookup')">
          <el-input
            v-model="lookupQuery"
            class="lookup-input"
            :placeholder="t('admin.credits.lookupPlaceholder')"
            @keyup.enter="handleLookup"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="looking" :disabled="!lookupQuery.trim()" @click="handleLookup">
            {{ t('admin.credits.lookupAction') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="account" class="account-box">
        <div class="account-head">
          <strong>{{ account.user.email }}</strong>
          <code>{{ account.user.id }}</code>
        </div>
        <dl class="balance-grid">
          <div>
            <dt>{{ t('admin.credits.balance') }}</dt>
            <dd class="balance-points">{{ account.summary.balancePoints }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.credits.held') }}</dt>
            <dd>{{ formatPoints(account.summary.heldTokens, account.summary.tokensPerPoint) }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.credits.available') }}</dt>
            <dd>{{ account.summary.availablePoints }}</dd>
          </div>
        </dl>

        <el-form inline class="topup-form" @submit.prevent="handleTopUp">
          <el-form-item :label="t('admin.credits.points')">
            <el-input-number
              v-model="topUp.points"
              :min="0"
              :max="MAX_TOPUP_POINTS"
              :precision="4"
              :step="1"
              :controls="false"
            />
          </el-form-item>
          <el-form-item :label="t('admin.credits.note')">
            <el-input v-model="topUp.note" maxlength="200" :placeholder="t('admin.credits.notePlaceholder')" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="topUpBusy" :disabled="!canTopUp" @click="handleTopUp">
              {{ t('admin.credits.topUp') }}
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </section>

    <h3 class="section-title">{{ t('admin.credits.entries') }}</h3>
    <el-table v-loading="loading" :data="entries" stripe row-key="id" class="entries-table">
      <el-table-column :label="t('admin.credits.time')" width="190">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column :label="t('admin.credits.kind')" width="110">
        <template #default="{ row }">
          <el-tag :type="row.kind === 'topup' ? 'success' : 'warning'" size="small">
            {{ t(`admin.credits.kinds.${row.kind}`) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="tenantEmail" :label="t('admin.credits.account')" min-width="180" />
      <el-table-column :label="t('admin.credits.points')" width="140">
        <template #default="{ row }">
          {{ formatPoints(row.amount, account?.summary.tokensPerPoint ?? 10000) }}
        </template>
      </el-table-column>
      <el-table-column prop="operatorEmail" :label="t('admin.credits.operator')" min-width="180" />
      <el-table-column prop="note" :label="t('admin.credits.note')" min-width="140" />
      <el-table-column :label="t('admin.users.actions')" width="110" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.kind === 'topup'" size="small" type="danger" @click="handleReverse(row)">
            {{ t('admin.credits.reverse') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && entries.length === 0" :description="t('admin.credits.noEntries')" />

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.admin-credits {
  max-width: 1200px;
  margin: 0 auto;
  animation: fadeIn 0.3s var(--ease-out) both;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px;
}

.panel {
  padding: 16px 16px 0;
  margin-bottom: 24px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.lookup-input {
  width: 320px;
}

.account-box {
  margin: 0 0 16px;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--bg-hover);
}

.account-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.balance-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
  margin: 0 0 16px;

  dt {
    font-size: 13px;
    color: var(--text-secondary);
  }

  dd {
    margin: 4px 0 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.entries-table {
  border-radius: 8px;
  overflow: hidden;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

@include below(md) {
  .panel {
    padding: 12px 12px 0;
  }

  .lookup-input {
    width: 100%;
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
