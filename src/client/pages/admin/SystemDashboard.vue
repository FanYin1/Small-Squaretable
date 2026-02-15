<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh, User, UserFilled, Files, Warning, Timer } from '@element-plus/icons-vue';
import { useAdminStore } from '@client/stores/admin';
import { api } from '@client/services/api';

interface JobStatus {
  name: string;
  intervalMs: number;
  lastRunAt: string | null;
  lastStatus: 'success' | 'error' | 'pending';
  lastError: string | null;
  runCount: number;
}

const { t } = useI18n();
const adminStore = useAdminStore();

const jobs = ref<JobStatus[]>([]);
const loadingJobs = ref(false);
const runningJob = ref<string | null>(null);

function formatInterval(ms: number): string {
  if (ms >= 86400000) return `${Math.round(ms / 86400000)}d`;
  if (ms >= 3600000) return `${Math.round(ms / 3600000)}h`;
  if (ms >= 60000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function statusTagType(status: string): '' | 'success' | 'danger' | 'info' {
  if (status === 'success') return 'success';
  if (status === 'error') return 'danger';
  return 'info';
}

async function fetchJobs() {
  loadingJobs.value = true;
  try {
    const res = await api.get<{ data: JobStatus[] }>('/api/v1/admin/jobs');
    jobs.value = (res as any).data ?? [];
  } catch {
    jobs.value = [];
  } finally {
    loadingJobs.value = false;
  }
}

async function runJob(name: string) {
  runningJob.value = name;
  try {
    await api.post(`/api/v1/admin/jobs/${encodeURIComponent(name)}/run`);
    await fetchJobs();
  } catch {
    // silent
  } finally {
    runningJob.value = null;
  }
}

function refresh() {
  adminStore.fetchSystemStats();
  fetchJobs();
}

onMounted(() => refresh());
</script>

<template>
  <div class="system-dashboard">
    <div class="page-header">
      <h2 class="page-title">{{ t('admin.system.title') }}</h2>
      <el-button :icon="Refresh" @click="refresh">{{ t('common.refresh') }}</el-button>
    </div>

    <div v-loading="adminStore.loadingStats" class="stats-grid">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-icon-wrapper stat-blue">
          <el-icon :size="28"><User /></el-icon>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ adminStore.systemStats?.totalUsers ?? '-' }}</span>
          <span class="stat-label">{{ t('admin.system.totalUsers') }}</span>
        </div>
      </el-card>

      <el-card shadow="hover" class="stat-card">
        <div class="stat-icon-wrapper stat-green">
          <el-icon :size="28"><UserFilled /></el-icon>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ adminStore.systemStats?.activeUsers30d ?? '-' }}</span>
          <span class="stat-label">{{ t('admin.system.activeUsers30d') }}</span>
        </div>
      </el-card>

      <el-card shadow="hover" class="stat-card">
        <div class="stat-icon-wrapper stat-purple">
          <el-icon :size="28"><Files /></el-icon>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ adminStore.systemStats?.totalCharacters ?? '-' }}</span>
          <span class="stat-label">{{ t('admin.system.totalCharacters') }}</span>
        </div>
      </el-card>

      <el-card shadow="hover" class="stat-card">
        <div class="stat-icon-wrapper stat-orange">
          <el-icon :size="28"><Warning /></el-icon>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ adminStore.systemStats?.pendingReports ?? '-' }}</span>
          <span class="stat-label">{{ t('admin.system.pendingReports') }}</span>
        </div>
      </el-card>
    </div>

    <div v-if="adminStore.systemStats" class="detail-section">
      <el-card shadow="hover" class="detail-card">
        <template #header>
          <span class="detail-card-title">{{ t('admin.system.subscriptionBreakdown') }}</span>
        </template>
        <div class="subscription-bars">
          <div class="sub-row">
            <span class="sub-label">{{ t('subscription.free') }}</span>
            <el-progress
              :percentage="adminStore.systemStats.totalUsers > 0
                ? Math.round((adminStore.systemStats.subscriptionBreakdown.free / adminStore.systemStats.totalUsers) * 100)
                : 0"
              :stroke-width="20"
              color="var(--el-color-info)"
            />
            <span class="sub-count">{{ adminStore.systemStats.subscriptionBreakdown.free }}</span>
          </div>
          <div class="sub-row">
            <span class="sub-label">{{ t('subscription.pro') }}</span>
            <el-progress
              :percentage="adminStore.systemStats.totalUsers > 0
                ? Math.round((adminStore.systemStats.subscriptionBreakdown.pro / adminStore.systemStats.totalUsers) * 100)
                : 0"
              :stroke-width="20"
              color="var(--el-color-primary)"
            />
            <span class="sub-count">{{ adminStore.systemStats.subscriptionBreakdown.pro }}</span>
          </div>
          <div class="sub-row">
            <span class="sub-label">{{ t('subscription.team') }}</span>
            <el-progress
              :percentage="adminStore.systemStats.totalUsers > 0
                ? Math.round((adminStore.systemStats.subscriptionBreakdown.team / adminStore.systemStats.totalUsers) * 100)
                : 0"
              :stroke-width="20"
              color="var(--el-color-success)"
            />
            <span class="sub-count">{{ adminStore.systemStats.subscriptionBreakdown.team }}</span>
          </div>
        </div>
      </el-card>

      <el-card shadow="hover" class="detail-card">
        <template #header>
          <span class="detail-card-title">{{ t('admin.system.recentSignups') }}</span>
        </template>
        <div class="recent-signups">
          <span class="big-number">{{ adminStore.systemStats.recentSignups7d }}</span>
          <span class="big-label">{{ t('admin.system.last7days') }}</span>
        </div>
      </el-card>
    </div>

    <!-- Scheduled Jobs Section -->
    <el-card shadow="hover" class="jobs-card" v-loading="loadingJobs">
      <template #header>
        <div class="jobs-header">
          <span class="detail-card-title">
            <el-icon :size="18" style="vertical-align: middle; margin-right: 6px;"><Timer /></el-icon>
            {{ t('admin.system.scheduledJobs') }}
          </span>
        </div>
      </template>
      <el-table :data="jobs" stripe style="width: 100%">
        <el-table-column prop="name" :label="t('admin.system.jobName')" min-width="180" />
        <el-table-column :label="t('admin.system.jobInterval')" width="100">
          <template #default="{ row }">{{ formatInterval(row.intervalMs) }}</template>
        </el-table-column>
        <el-table-column :label="t('admin.system.jobLastRun')" width="180">
          <template #default="{ row }">
            {{ row.lastRunAt ? new Date(row.lastRunAt).toLocaleString() : t('admin.system.jobNeverRun') }}
          </template>
        </el-table-column>
        <el-table-column :label="t('admin.system.jobStatus')" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.lastStatus)" size="small">
              {{ t(`admin.system.job${row.lastStatus.charAt(0).toUpperCase() + row.lastStatus.slice(1)}`) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="runCount" :label="t('admin.system.jobRunCount')" width="100" />
        <el-table-column :label="t('admin.system.jobRunNow')" width="120" align="center">
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              :loading="runningJob === row.name"
              @click="runJob(row.name)"
            >
              {{ t('admin.system.jobRunNow') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.system-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  animation: fadeIn 0.3s var(--ease-out) both;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
  min-height: 120px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.stat-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}

.stat-blue { background: var(--el-color-primary); }
.stat-green { background: var(--el-color-success); }
.stat-purple { background: #8b5cf6; }
.stat-orange { background: var(--el-color-warning); }

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.detail-section {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}

.jobs-card {
  margin-top: 24px;
}

.jobs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-card-title {
  font-weight: 600;
  font-size: 15px;
}

.subscription-bars {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sub-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sub-label {
  width: 50px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.sub-row .el-progress {
  flex: 1;
}

.sub-count {
  width: 50px;
  text-align: right;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.recent-signups {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 0;
}

.big-number {
  font-size: 48px;
  font-weight: 700;
  color: var(--el-color-primary);
  line-height: 1.2;
}

.big-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 4px;
}

@media (max-width: 768px) {
  .detail-section {
    grid-template-columns: 1fr;
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
