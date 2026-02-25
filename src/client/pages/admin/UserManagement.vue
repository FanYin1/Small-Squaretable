<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAdminStore } from '@client/stores/admin';
import { adminApi } from '@client/services/admin.api';
import type { AdminUser, AdminUserDetail } from '@client/services/admin.api';

const { t } = useI18n();
const adminStore = useAdminStore();

const searchQuery = ref('');
const currentPage = ref(1);
const pageSize = ref(20);

// Drawer state
const drawerVisible = ref(false);
const selectedUser = ref<AdminUserDetail | null>(null);
const loadingDetail = ref(false);

async function fetchUserDetail(id: string) {
  loadingDetail.value = true;
  try {
    selectedUser.value = await adminApi.getUser(id);
  } catch {
    ElMessage.error(t('common.loadFailed'));
  } finally {
    loadingDetail.value = false;
  }
}

function handleRowClick(row: AdminUser) {
  drawerVisible.value = true;
  fetchUserDetail(row.id);
}

function loadUsers() {
  adminStore.fetchUsers({
    page: currentPage.value,
    limit: pageSize.value,
    search: searchQuery.value || undefined,
  });
}

function handleSearch() {
  currentPage.value = 1;
  loadUsers();
}

function handlePageChange(page: number) {
  currentPage.value = page;
  loadUsers();
}

async function handleChangeRole(user: AdminUser, newRole: 'user' | 'moderator' | 'admin') {
  try {
    await ElMessageBox.confirm(
      t('admin.users.changeRoleConfirm', { name: user.displayName || user.email, role: newRole }),
      t('admin.users.changeRole'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    );
    const ok = await adminStore.changeUserRole(user.id, newRole);
    if (ok) ElMessage.success(t('admin.users.roleChanged'));
  } catch { /* cancelled */ }
}

async function handleSuspend(user: AdminUser) {
  try {
    await ElMessageBox.confirm(
      t('admin.users.suspendConfirm', { name: user.displayName || user.email }),
      t('admin.users.suspend'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    );
    const ok = await adminStore.suspendUser(user.id);
    if (ok) ElMessage.success(t('admin.users.suspended'));
  } catch { /* cancelled */ }
}

async function handleUnsuspend(user: AdminUser) {
  const ok = await adminStore.unsuspendUser(user.id);
  if (ok) ElMessage.success(t('admin.users.unsuspended'));
}

async function handleForcePasswordReset(user: AdminUser) {
  try {
    await ElMessageBox.confirm(
      t('admin.users.forceResetConfirm', { name: user.displayName || user.email }),
      t('admin.users.forceReset'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    );
    const ok = await adminStore.forcePasswordReset(user.id);
    if (ok) ElMessage.success(t('admin.users.resetSent'));
  } catch { /* cancelled */ }
}

function getRoleTagType(role: string) {
  switch (role) {
    case 'admin': return 'danger';
    case 'moderator': return 'warning';
    default: return 'info';
  }
}

onMounted(() => loadUsers());

watch(searchQuery, () => {
  if (searchQuery.value === '') handleSearch();
});
</script>

<template>
  <div class="user-management">
    <div class="page-header">
      <h2 class="page-title">{{ t('admin.users.title') }}</h2>
      <div class="header-actions">
        <el-input
          v-model="searchQuery"
          :placeholder="t('admin.users.searchPlaceholder')"
          :prefix-icon="Search"
          clearable
          class="search-input"
          @keyup.enter="handleSearch"
        />
        <el-button :icon="Refresh" @click="loadUsers">{{ t('common.refresh') }}</el-button>
      </div>
    </div>

    <el-table
      v-loading="adminStore.loadingUsers"
      :data="adminStore.users"
      stripe
      class="users-table"
      @row-click="handleRowClick"
    >
      <el-table-column prop="email" :label="t('admin.users.email')" min-width="200" />
      <el-table-column prop="displayName" :label="t('admin.users.displayName')" min-width="150" />
      <el-table-column prop="role" :label="t('admin.users.role')" width="120">
        <template #default="{ row }">
          <el-tag :type="getRoleTagType(row.role)" size="small">{{ row.role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="isActive" :label="t('admin.users.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'danger'" size="small">
            {{ row.isActive ? t('admin.users.active') : t('admin.users.suspended') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" :label="t('admin.users.createdAt')" width="180">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleDateString() }}
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.users.actions')" width="280" fixed="right">
        <template #default="{ row }">
          <el-dropdown trigger="click" @command="(cmd: string) => handleChangeRole(row, cmd as any)">
            <el-button size="small" text>{{ t('admin.users.changeRole') }}</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="user" :disabled="row.role === 'user'">{{ t('admin.users.roleUser') }}</el-dropdown-item>
                <el-dropdown-item command="moderator" :disabled="row.role === 'moderator'">{{ t('admin.users.roleModerator') }}</el-dropdown-item>
                <el-dropdown-item command="admin" :disabled="row.role === 'admin'">{{ t('admin.users.roleAdmin') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button
            v-if="row.isActive"
            size="small"
            text
            type="warning"
            @click="handleSuspend(row)"
          >{{ t('admin.users.suspend') }}</el-button>
          <el-button
            v-else
            size="small"
            text
            type="success"
            @click="handleUnsuspend(row)"
          >{{ t('admin.users.unsuspend') }}</el-button>
          <el-button
            size="small"
            text
            type="danger"
            @click="handleForcePasswordReset(row)"
          >{{ t('admin.users.forceReset') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="adminStore.usersTotal"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>

    <!-- User Detail Drawer -->
    <el-drawer
      v-model="drawerVisible"
      :title="t('admin.users.userDetail')"
      size="420px"
      direction="rtl"
    >
      <div v-loading="loadingDetail" class="user-detail">
        <template v-if="selectedUser">
          <div class="detail-header">
            <el-avatar :size="64" :src="selectedUser.avatarUrl">
              {{ (selectedUser.displayName || selectedUser.email).charAt(0).toUpperCase() }}
            </el-avatar>
            <div class="detail-header-info">
              <h3 class="detail-name">{{ selectedUser.displayName || '—' }}</h3>
              <span class="detail-email">{{ selectedUser.email }}</span>
            </div>
          </div>

          <el-descriptions :column="1" border class="detail-descriptions">
            <el-descriptions-item :label="t('admin.users.accountStatus')">
              <el-tag :type="selectedUser.isActive ? 'success' : 'danger'" size="small">
                {{ selectedUser.isActive ? t('admin.users.active') : t('admin.users.suspended') }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.users.role')">
              <el-tag :type="getRoleTagType(selectedUser.role)" size="small">
                {{ selectedUser.role }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.users.subscriptionPlan')">
              {{ selectedUser.subscriptionPlan || t('admin.users.noSubscription') }}
              <el-tag v-if="selectedUser.subscriptionStatus" size="small" style="margin-left: 8px">
                {{ selectedUser.subscriptionStatus }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.users.oauthAccounts')">
              <template v-if="selectedUser.oauthAccounts && selectedUser.oauthAccounts.length">
                <el-tag
                  v-for="oa in selectedUser.oauthAccounts"
                  :key="oa.provider"
                  size="small"
                  style="margin-right: 4px"
                >
                  {{ oa.provider }}
                </el-tag>
              </template>
              <span v-else>{{ t('admin.users.noOauthAccounts') }}</span>
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.users.createdAt')">
              {{ new Date(selectedUser.createdAt).toLocaleString() }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.users.lastLogin')">
              {{ selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : t('admin.users.neverLoggedIn') }}
            </el-descriptions-item>
          </el-descriptions>

          <div class="detail-actions">
            <el-dropdown trigger="click" @command="(cmd: string) => handleChangeRole(selectedUser!, cmd as any)">
              <el-button size="small">{{ t('admin.users.changeRole') }}</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="user" :disabled="selectedUser.role === 'user'">{{ t('admin.users.roleUser') }}</el-dropdown-item>
                  <el-dropdown-item command="moderator" :disabled="selectedUser.role === 'moderator'">{{ t('admin.users.roleModerator') }}</el-dropdown-item>
                  <el-dropdown-item command="admin" :disabled="selectedUser.role === 'admin'">{{ t('admin.users.roleAdmin') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button
              v-if="selectedUser.isActive"
              size="small"
              type="warning"
              @click="handleSuspend(selectedUser!)"
            >{{ t('admin.users.suspend') }}</el-button>
            <el-button
              v-else
              size="small"
              type="success"
              @click="handleUnsuspend(selectedUser!)"
            >{{ t('admin.users.unsuspend') }}</el-button>
            <el-button
              size="small"
              type="danger"
              @click="handleForcePasswordReset(selectedUser!)"
            >{{ t('admin.users.forceReset') }}</el-button>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.user-management {
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

.search-input {
  width: 280px;
}

.users-table {
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
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

.user-detail {
  padding: 0 4px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.detail-header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.detail-email {
  font-size: 13px;
  color: var(--text-secondary);
}

.detail-descriptions {
  margin-bottom: 24px;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
