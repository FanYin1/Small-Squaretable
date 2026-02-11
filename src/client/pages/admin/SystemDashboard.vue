<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh, User, UserFilled, Files, Warning } from '@element-plus/icons-vue';
import { useAdminStore } from '@client/stores/admin';

const { t } = useI18n();
const adminStore = useAdminStore();

function refresh() {
  adminStore.fetchSystemStats();
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
            <span class="sub-label">Free</span>
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
            <span class="sub-label">Pro</span>
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
            <span class="sub-label">Team</span>
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
