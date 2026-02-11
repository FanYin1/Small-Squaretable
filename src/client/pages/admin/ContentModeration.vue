<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAdminStore } from '@client/stores/admin';
import type { ContentReport } from '@client/services/admin.api';

const { t } = useI18n();
const adminStore = useAdminStore();

const currentPage = ref(1);
const pageSize = ref(20);
const statusFilter = ref('pending');

function loadReports() {
  adminStore.fetchReports({
    page: currentPage.value,
    limit: pageSize.value,
    status: statusFilter.value as any || undefined,
  });
}

function handlePageChange(page: number) {
  currentPage.value = page;
  loadReports();
}

function handleStatusFilter(status: string) {
  statusFilter.value = status;
  currentPage.value = 1;
  loadReports();
}

async function handleResolve(report: ContentReport, action: 'approve' | 'reject' | 'dismiss') {
  const actionLabel = t(`admin.content.action_${action}`);
  try {
    await ElMessageBox.confirm(
      t('admin.content.resolveConfirm', { action: actionLabel }),
      actionLabel,
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    );
    const ok = await adminStore.resolveReport(report.id, { action });
    if (ok) ElMessage.success(t('admin.content.resolved'));
  } catch { /* cancelled */ }
}

function getStatusType(status: string) {
  switch (status) {
    case 'pending': return 'warning';
    case 'resolved': return 'success';
    case 'dismissed': return 'info';
    default: return 'info';
  }
}

onMounted(() => loadReports());
</script>

<template>
  <div class="content-moderation">
    <div class="page-header">
      <h2 class="page-title">{{ t('admin.content.title') }}</h2>
      <div class="header-actions">
        <el-radio-group v-model="statusFilter" size="small" @change="handleStatusFilter">
          <el-radio-button value="pending">{{ t('admin.content.pending') }}</el-radio-button>
          <el-radio-button value="resolved">{{ t('admin.content.resolved') }}</el-radio-button>
          <el-radio-button value="dismissed">{{ t('admin.content.dismissed') }}</el-radio-button>
          <el-radio-button value="">{{ t('admin.content.all') }}</el-radio-button>
        </el-radio-group>
        <el-button :icon="Refresh" @click="loadReports">{{ t('common.refresh') }}</el-button>
      </div>
    </div>

    <el-table
      v-loading="adminStore.loadingReports"
      :data="adminStore.reports"
      stripe
      class="reports-table"
      row-key="id"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="report-detail">
            <p v-if="row.description"><span class="detail-label">{{ t('admin.content.description') }}:</span> {{ row.description }}</p>
            <p><span class="detail-label">{{ t('admin.content.targetType') }}:</span> {{ row.targetType }}</p>
            <p><span class="detail-label">{{ t('admin.content.targetId') }}:</span> <code>{{ row.targetId }}</code></p>
            <p v-if="row.resolution"><span class="detail-label">{{ t('admin.content.resolution') }}:</span> {{ row.resolution }}</p>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="reporterEmail" :label="t('admin.content.reporter')" min-width="180" />
      <el-table-column prop="targetType" :label="t('admin.content.targetType')" width="140">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.targetType }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="reason" :label="t('admin.content.reason')" min-width="200" />
      <el-table-column prop="status" :label="t('admin.content.status')" width="120">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" :label="t('admin.content.createdAt')" width="180">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleDateString() }}
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.users.actions')" width="240" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button size="small" text type="success" @click="handleResolve(row, 'approve')">
              {{ t('admin.content.action_approve') }}
            </el-button>
            <el-button size="small" text type="danger" @click="handleResolve(row, 'reject')">
              {{ t('admin.content.action_reject') }}
            </el-button>
            <el-button size="small" text @click="handleResolve(row, 'dismiss')">
              {{ t('admin.content.action_dismiss') }}
            </el-button>
          </template>
          <span v-else class="resolved-label">{{ row.status }}</span>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="adminStore.reportsTotal"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.content-moderation {
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.reports-table {
  border-radius: 8px;
  overflow: hidden;
}

.report-detail {
  padding: 12px 24px;
  font-size: 14px;
  color: var(--text-secondary);
}

.report-detail p {
  margin: 4px 0;
}

.detail-label {
  font-weight: 600;
  color: var(--text-primary);
}

.resolved-label {
  font-size: 13px;
  color: var(--text-tertiary);
  font-style: italic;
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
