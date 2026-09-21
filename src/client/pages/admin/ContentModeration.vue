<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAdminStore } from '@client/stores/admin';
import { adminApi } from '@client/services/admin.api';
import type { ContentReport, ModerationQueueItem } from '@client/services/admin.api';
import { VIOLATION_CATEGORIES } from '@/types/moderation';
import type { ViolationCategory } from '@/types/moderation';

const { t } = useI18n();
const adminStore = useAdminStore();

const currentPage = ref(1);
const pageSize = ref(20);
const statusFilter = ref('pending');

// ── 待审队列 ──
// 举报队列是被动的，只装被投诉过的内容。作者发布后角色是 pending，
// 公开发现入口只认 approved，没有这条主动队列这批内容永久隐形。

const activeTab = ref('queue');
const queueItems = ref<ModerationQueueItem[]>([]);
const queueTotal = ref(0);
const queuePage = ref(1);
const queueLoading = ref(false);

const rejectVisible = ref(false);
const rejectTarget = ref<ModerationQueueItem | null>(null);
const rejectForm = reactive<{ category?: ViolationCategory; reason: string }>({
  category: undefined,
  reason: '',
});

async function loadQueue() {
  queueLoading.value = true;
  try {
    const res = await adminApi.getModerationQueue({
      status: 'pending',
      page: queuePage.value,
      limit: pageSize.value,
    });
    queueItems.value = res.items ?? [];
    queueTotal.value = res.pagination?.total ?? 0;
  } catch {
    ElMessage.error(t('moderation.queue.actionFailed'));
  } finally {
    queueLoading.value = false;
  }
}

function handleQueuePageChange(page: number) {
  queuePage.value = page;
  loadQueue();
}

async function handleApprove(item: ModerationQueueItem) {
  try {
    await ElMessageBox.confirm(
      t('moderation.queue.approveConfirm'),
      t('moderation.queue.approve'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' },
    );
  } catch {
    // 取消：误点不该直接把内容放上线
    return;
  }

  try {
    await adminApi.approveCharacter(item.id);
    ElMessage.success(t('moderation.queue.approved'));
    await loadQueue();
  } catch {
    ElMessage.error(t('moderation.queue.actionFailed'));
  }
}

function openReject(item: ModerationQueueItem) {
  rejectTarget.value = item;
  rejectForm.category = undefined;
  rejectForm.reason = '';
  rejectVisible.value = true;
}

async function submitReject() {
  const target = rejectTarget.value;
  // 理由会原样展示给作者，空理由等于没有解释
  if (!target || !rejectForm.reason.trim()) {
    ElMessage.error(t('report.reasonRequired'));
    return;
  }

  try {
    await adminApi.rejectCharacter(target.id, {
      ...(rejectForm.category ? { category: rejectForm.category } : {}),
      reason: rejectForm.reason.trim(),
    });
    ElMessage.success(t('moderation.queue.rejected'));
    rejectVisible.value = false;
    await loadQueue();
  } catch {
    ElMessage.error(t('moderation.queue.actionFailed'));
  }
}

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

onMounted(() => {
  loadQueue();
  loadReports();
});

// 测试要驱动这些动作；<script setup> 默认不暴露任何东西
defineExpose({ handleApprove, openReject, submitReject, rejectForm, loadQueue });
</script>

<template>
  <div class="content-moderation">
    <div class="page-header">
      <h2 class="page-title">{{ t('admin.content.title') }}</h2>
    </div>

    <el-tabs v-model="activeTab">
      <!-- 待审队列放在第一个：这是唯一能让新角色上线的入口 -->
      <el-tab-pane name="queue" :label="t('moderation.queue.title')">
        <div class="pane-actions">
          <el-button :icon="Refresh" @click="loadQueue">{{ t('common.refresh') }}</el-button>
        </div>

        <el-empty v-if="!queueLoading && queueItems.length === 0" :description="t('moderation.queue.empty')" />

        <template v-else>
          <el-table v-loading="queueLoading" :data="queueItems" stripe row-key="id" class="reports-table">
            <el-table-column prop="name" :label="t('characterEditor.name')" min-width="200" />
            <el-table-column prop="creatorId" :label="t('moderation.queue.author')" min-width="180" />
            <el-table-column prop="updatedAt" :label="t('moderation.queue.submittedAt')" width="180">
              <template #default="{ row }">
                {{ new Date(row.updatedAt).toLocaleDateString() }}
              </template>
            </el-table-column>
            <el-table-column :label="t('admin.users.actions')" width="200" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text type="success" @click="handleApprove(row)">
                  {{ t('moderation.queue.approve') }}
                </el-button>
                <el-button size="small" text type="danger" @click="openReject(row)">
                  {{ t('moderation.queue.reject') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="queuePage"
              :page-size="pageSize"
              :total="queueTotal"
              layout="total, prev, pager, next"
              @current-change="handleQueuePageChange"
            />
          </div>
        </template>
      </el-tab-pane>

      <el-tab-pane name="reports" :label="t('moderation.queue.reportsTab')">
        <div class="pane-actions">
          <el-radio-group v-model="statusFilter" size="small" @change="handleStatusFilter">
            <el-radio-button value="pending">{{ t('admin.content.pending') }}</el-radio-button>
            <el-radio-button value="resolved">{{ t('admin.content.resolved') }}</el-radio-button>
            <el-radio-button value="dismissed">{{ t('admin.content.dismissed') }}</el-radio-button>
            <el-radio-button value="">{{ t('admin.content.all') }}</el-radio-button>
          </el-radio-group>
          <el-button :icon="Refresh" @click="loadReports">{{ t('common.refresh') }}</el-button>
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
      </el-tab-pane>
    </el-tabs>

    <!-- 驳回理由会原样展示给作者，所以分类和说明分开填 -->
    <el-dialog v-model="rejectVisible" :title="t('moderation.queue.rejectTitle')" width="480px">
      <el-select v-model="rejectForm.category" :placeholder="t('report.category')" clearable class="reject-field">
        <el-option
          v-for="cat in VIOLATION_CATEGORIES"
          :key="cat"
          :value="cat"
          :label="t(`report.categories.${cat}`)"
        />
      </el-select>
      <el-input
        v-model="rejectForm.reason"
        type="textarea"
        :rows="4"
        :maxlength="2000"
        :placeholder="t('moderation.queue.rejectReason')"
        class="reject-field"
      />
      <template #footer>
        <el-button @click="rejectVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="danger" @click="submitReject">{{ t('moderation.queue.reject') }}</el-button>
      </template>
    </el-dialog>
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

.pane-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.reject-field {
  width: 100%;
  margin-bottom: 12px;
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
