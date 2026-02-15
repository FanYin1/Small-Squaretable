<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, Refresh } from '@element-plus/icons-vue';
import { useAdminStore } from '@client/stores/admin';

const { t } = useI18n();
const adminStore = useAdminStore();

const currentPage = ref(1);
const pageSize = ref(20);
const actionFilter = ref('');
const actorSearch = ref('');
const dateRange = ref<[string, string] | null>(null);

function loadLogs() {
  adminStore.fetchAuditLogs({
    page: currentPage.value,
    limit: pageSize.value,
    action: actionFilter.value || undefined,
    userId: actorSearch.value || undefined,
  });
}

function handlePageChange(page: number) {
  currentPage.value = page;
  loadLogs();
}

function handleFilterChange() {
  currentPage.value = 1;
  loadLogs();
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}


const actionOptions = [
  'user.login',
  'user.logout',
  'user.register',
  'user.password.reset',
  'user.password.change',
  'user.role.change',
  'user.suspend',
  'user.unsuspend',
  'oauth.login',
  'mfa.enable',
  'mfa.disable',
  'admin.report.resolve',
  'admin.gdpr.process',
];

onMounted(() => loadLogs());

watch(actorSearch, () => {
  if (actorSearch.value === '') handleFilterChange();
});
</script>

<template>
  <div class="audit-logs">
    <div class="page-header">
      <h2 class="page-title">{{ t('admin.auditLogs.title') }}</h2>
      <el-button :icon="Refresh" @click="loadLogs">{{ t('common.refresh') }}</el-button>
    </div>

    <div class="filter-bar">
      <el-select
        v-model="actionFilter"
        :placeholder="t('admin.auditLogs.filterAction')"
        clearable
        class="filter-select"
        @change="handleFilterChange"
      >
        <el-option v-for="a in actionOptions" :key="a" :label="a" :value="a" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        :start-placeholder="t('admin.auditLogs.filterDate')"
        :end-placeholder="t('admin.auditLogs.filterDate')"
        value-format="YYYY-MM-DD"
        class="filter-date"
        @change="handleFilterChange"
      />
      <el-input
        v-model="actorSearch"
        :placeholder="t('admin.auditLogs.filterActor')"
        :prefix-icon="Search"
        clearable
        class="filter-input"
        @keyup.enter="handleFilterChange"
      />
    </div>

    <el-table
      v-loading="adminStore.loadingAuditLogs"
      :data="adminStore.auditLogs"
      stripe
      class="logs-table"
      row-key="id"
    >
      <el-table-column :label="t('admin.auditLogs.timestamp')" width="190">
        <template #default="{ row }">
          {{ formatTimestamp(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column prop="userId" :label="t('admin.auditLogs.actor')" min-width="160">
        <template #default="{ row }">
          <span>{{ row.userEmail || row.userId }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="action" :label="t('admin.auditLogs.action')" min-width="180">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.action }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="targetType" :label="t('admin.auditLogs.targetType')" width="140">
        <template #default="{ row }">
          <span v-if="row.targetType">{{ row.targetType }}</span>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="targetId" :label="t('admin.auditLogs.targetId')" min-width="140">
        <template #default="{ row }">
          <code v-if="row.targetId">{{ row.targetId }}</code>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.auditLogs.ip')" width="140">
        <template #default="{ row }">
          <code v-if="row.ipAddress">{{ row.ipAddress.slice(0, 12) }}...</code>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!adminStore.loadingAuditLogs && adminStore.auditLogs.length === 0" :description="t('admin.auditLogs.noLogs')" />

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="adminStore.auditLogsTotal"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.audit-logs {
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

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-select {
  width: 220px;
}

.filter-date {
  width: 280px;
}

.filter-input {
  width: 240px;
}

.logs-table {
  border-radius: 8px;
  overflow: hidden;
}

.text-muted {
  color: var(--text-tertiary);
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
