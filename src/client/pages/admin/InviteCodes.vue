<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import { adminApi, type InviteCode } from '@client/services/admin.api';
import { useToast } from '@client/composables';
import { ElMessageBox } from 'element-plus';

const { t } = useI18n();
const toast = useToast();

type InviteStatus = 'active' | 'disabled' | 'exhausted' | 'expired';

const codes = ref<InviteCode[]>([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);

const form = reactive<{
  count: number;
  maxUses: number;
  expiresAt: Date | null;
  note: string;
}>({ count: 1, maxUses: 1, expiresAt: null, note: '' });
const generating = ref(false);
// 刚生成的码，只在本页会话里展示一次方便复制；列表里随时也能看到
const generated = ref<string[]>([]);

async function fetchCodes() {
  loading.value = true;
  try {
    const res = await adminApi.getInviteCodes({ page: currentPage.value, limit: pageSize.value });
    codes.value = res.items;
    total.value = res.pagination.total;
  } catch {
    toast.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function handleGenerate() {
  generating.value = true;
  try {
    const note = form.note.trim();
    const created = await adminApi.generateInviteCodes({
      count: form.count,
      maxUses: form.maxUses,
      ...(form.expiresAt ? { expiresAt: form.expiresAt.toISOString() } : {}),
      ...(note ? { note } : {}),
    });
    generated.value = created.map((c) => c.code);
    toast.success(t('admin.inviteCodes.generated', { count: created.length }));
    currentPage.value = 1;
    await fetchCodes();
  } catch {
    toast.error(t('admin.inviteCodes.generateFailed'));
  } finally {
    generating.value = false;
  }
}

async function handleDisable(row: Pick<InviteCode, 'id' | 'code'>) {
  try {
    await ElMessageBox.confirm(
      t('admin.inviteCodes.confirmDisable', { code: row.code }),
      t('common.confirm'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await adminApi.disableInviteCode(row.id);
    toast.success(t('admin.inviteCodes.disabledOk'));
    await fetchCodes();
  } catch {
    toast.error(t('admin.inviteCodes.disableFailed'));
  }
}

async function copyGenerated() {
  try {
    await navigator.clipboard.writeText(generated.value.join('\n'));
    toast.success(t('admin.inviteCodes.copied'));
  } catch {
    toast.error(t('admin.inviteCodes.copyFailed'));
  }
}

// 与服务端消费条件一致：禁用 > 用尽 > 过期 > 可用
function statusOf(
  row: Pick<InviteCode, 'disabled' | 'usedCount' | 'maxUses' | 'expiresAt'>,
): InviteStatus {
  if (row.disabled) return 'disabled';
  if (row.usedCount >= row.maxUses) return 'exhausted';
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

const STATUS_TAG: Record<InviteStatus, string> = {
  active: 'success',
  disabled: 'info',
  exhausted: 'warning',
  expired: 'danger',
};

function handlePageChange(page: number) {
  currentPage.value = page;
  fetchCodes();
}

function formatDate(d?: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleString();
}

function disablePastDates(d: Date) {
  return d.getTime() < Date.now() - 24 * 60 * 60 * 1000;
}

onMounted(() => fetchCodes());
</script>

<template>
  <div class="invite-codes">
    <div class="page-header">
      <h2 class="page-title">{{ t('admin.inviteCodes.title') }}</h2>
      <el-button :icon="Refresh" @click="fetchCodes">{{ t('common.refresh') }}</el-button>
    </div>

    <section class="generate-panel" :aria-label="t('admin.inviteCodes.generate')">
      <el-form inline class="generate-form" @submit.prevent="handleGenerate">
        <el-form-item :label="t('admin.inviteCodes.count')">
          <el-input-number v-model="form.count" :min="1" :max="100" />
        </el-form-item>
        <el-form-item :label="t('admin.inviteCodes.maxUses')">
          <el-input-number v-model="form.maxUses" :min="1" :max="100000" />
        </el-form-item>
        <el-form-item :label="t('admin.inviteCodes.expiresAt')">
          <el-date-picker
            v-model="form.expiresAt"
            type="datetime"
            :placeholder="t('admin.inviteCodes.neverExpires')"
            :disabled-date="disablePastDates"
          />
        </el-form-item>
        <el-form-item :label="t('admin.inviteCodes.note')">
          <el-input v-model="form.note" maxlength="200" :placeholder="t('admin.inviteCodes.note')" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="generating" @click="handleGenerate">
            {{ t('admin.inviteCodes.generate') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="generated.length" class="generated-box">
        <div class="generated-head">
          <span>{{ t('admin.inviteCodes.justGenerated') }}</span>
          <el-button size="small" @click="copyGenerated">{{ t('admin.inviteCodes.copyAll') }}</el-button>
        </div>
        <ul class="generated-list">
          <li v-for="code in generated" :key="code"><code>{{ code }}</code></li>
        </ul>
      </div>
    </section>

    <el-table v-loading="loading" :data="codes" stripe row-key="id" class="codes-table">
      <el-table-column :label="t('admin.inviteCodes.code')" min-width="180">
        <template #default="{ row }">
          <code>{{ row.code }}</code>
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.inviteCodes.usage')" width="110">
        <template #default="{ row }">
          {{ row.usedCount }} / {{ row.maxUses }}
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.inviteCodes.status')" width="110">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[statusOf(row)]" size="small">
            {{ t(`admin.inviteCodes.statusLabel.${statusOf(row)}`) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.inviteCodes.expiresAt')" width="190">
        <template #default="{ row }">
          {{ row.expiresAt ? formatDate(row.expiresAt) : t('admin.inviteCodes.neverExpires') }}
        </template>
      </el-table-column>
      <el-table-column prop="note" :label="t('admin.inviteCodes.note')" min-width="140" />
      <el-table-column :label="t('admin.inviteCodes.createdAt')" width="190">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.users.actions')" width="120" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            type="danger"
            :disabled="row.disabled"
            @click="handleDisable(row)"
          >
            {{ t('admin.inviteCodes.disable') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && codes.length === 0" :description="t('admin.inviteCodes.noCodes')" />

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
.invite-codes {
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

.generate-panel {
  padding: 16px 16px 0;
  margin-bottom: 20px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.generated-box {
  margin: 0 0 16px;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--bg-hover);
}

.generated-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}

.generated-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.codes-table {
  border-radius: 8px;
  overflow: hidden;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

@include below(md) {
  .generate-panel {
    padding: 12px 12px 0;
  }

  .generated-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
