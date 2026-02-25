<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import { api } from '@client/services/api';
import { useToast } from '@client/composables';
import { ElMessageBox } from 'element-plus';

const { t } = useI18n();
const toast = useToast();

interface GdprRequest {
  id: string;
  email: string;
  displayName?: string;
  deletionRequestedAt: string;
  scheduledAt: string | null;
}

const requests = ref<GdprRequest[]>([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);

async function fetchRequests() {
  loading.value = true;
  try {
    const res = await api.get('/api/v1/admin/gdpr/requests', {
      searchParams: { page: currentPage.value, limit: pageSize.value },
    });
    const data = await res.json();
    if (data.success) {
      requests.value = data.data.items;
      total.value = data.data.pagination.total;
    }
  } catch {
    toast.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function handleProcess(row: GdprRequest) {
  try {
    await ElMessageBox.confirm(
      t('admin.gdpr.confirmProcess'),
      t('common.confirm'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    const res = await api.post(`/api/v1/admin/gdpr/requests/${row.id}/process`);
    const data = await res.json();
    if (data.success) {
      toast.success(t('admin.gdpr.processed'));
      fetchRequests();
    }
  } catch {
    toast.error(t('common.retry'));
  }
}

function handlePageChange(page: number) {
  currentPage.value = page;
  fetchRequests();
}

function formatDate(d?: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleString();
}

onMounted(() => fetchRequests());
</script>

<template>
  <div class="gdpr-management">
    <div class="page-header">
      <h2 class="page-title">{{ t('admin.gdpr.title') }}</h2>
      <el-button :icon="Refresh" @click="fetchRequests">{{ t('common.refresh') }}</el-button>
    </div>

    <el-table v-loading="loading" :data="requests" stripe row-key="id" class="gdpr-table">
      <el-table-column prop="id" :label="t('admin.gdpr.requestId')" min-width="160">
        <template #default="{ row }">
          <code>{{ row.id.slice(0, 8) }}...</code>
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.users.email')" min-width="200">
        <template #default="{ row }">
          {{ row.email || row.displayName || row.id }}
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.gdpr.requestedAt')" width="190">
        <template #default="{ row }">
          {{ formatDate(row.deletionRequestedAt) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.gdpr.scheduledAt')" width="190">
        <template #default="{ row }">
          {{ formatDate(row.scheduledAt) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.users.actions')" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="danger" @click="handleProcess(row)">
            {{ t('admin.gdpr.processNow') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && requests.length === 0" :description="t('admin.gdpr.noRequests')" />

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

<style scoped>
.gdpr-management {
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

.gdpr-table {
  border-radius: 8px;
  overflow: hidden;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
