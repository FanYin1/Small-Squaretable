<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { User, Lock, Bell, Medal } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores';
import { useSubscriptionStore } from '@client/stores/subscription';
import { userApi } from '@client/services';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import ProfileForm from '@client/components/profile/ProfileForm.vue';
import AvatarUpload from '@client/components/profile/AvatarUpload.vue';

const userStore = useUserStore();
const subscriptionStore = useSubscriptionStore();
const editMode = ref(false);
const activeSection = ref('basic');

const menuItems = [
  { key: 'basic', label: '基本信息', icon: User },
  { key: 'security', label: '安全设置', icon: Lock },
  { key: 'notifications', label: '通知偏好', icon: Bell },
];

onMounted(async () => {
  if (!userStore.user) {
    await userStore.fetchProfile();
  }
  if (!subscriptionStore.subscription) {
    await subscriptionStore.fetchStatus();
  }
});

const avatarUrl = computed(() =>
  userStore.user?.avatar ||
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${userStore.user?.id}`
);

const membershipLevel = computed(() => {
  const plan = subscriptionStore.currentPlan;
  const labels: Record<string, string> = {
    free: '免费版',
    pro: '专业版',
    team: '团队版',
  };
  return labels[plan] || '免费版';
});

const membershipColor = computed(() => {
  const plan = subscriptionStore.currentPlan;
  const colors: Record<string, string> = {
    free: '#909399',
    pro: '#3B82F6',
    team: '#F56C6C',
  };
  return colors[plan] || '#909399';
});

function handleEdit() {
  editMode.value = true;
}

function handleCancel() {
  editMode.value = false;
}

async function handleSave(data: { name: string }) {
  try {
    if (!userStore.user) return;
    await userApi.updateUser(userStore.user.id, { name: data.name });
    userStore.user.name = data.name;
    ElMessage.success('保存成功');
    editMode.value = false;
  } catch (error) {
    ElMessage.error('保存失败');
  }
}
</script>

<template>
  <DashboardLayout>
    <template #title>个人中心</template>
    <template #subtitle>管理您的账户信息和偏好设置</template>

    <div v-if="userStore.user" class="profile-body">
      <aside class="profile-sidebar">
        <div class="user-info-card">
          <div class="avatar-wrapper">
            <AvatarUpload :avatar-url="avatarUrl" :disabled="!editMode" />
          </div>

          <div class="user-details">
            <h3 class="user-name">{{ userStore.user.name }}</h3>
            <p class="user-email">{{ userStore.user.email }}</p>
            <div class="membership-badge" :style="{ borderColor: membershipColor }">
              <Medal :style="{ color: membershipColor }" />
              <span :style="{ color: membershipColor }">{{ membershipLevel }}</span>
            </div>
          </div>

          <div class="user-stats">
            <div class="stat-item">
              <span class="stat-label">注册时间</span>
              <span class="stat-value">{{ new Date(userStore.user.createdAt).toLocaleDateString('zh-CN') }}</span>
            </div>
          </div>
        </div>

        <nav class="profile-nav">
          <button
            v-for="item in menuItems"
            :key="item.key"
            :class="['nav-item', { active: activeSection === item.key }]"
            @click="activeSection = item.key"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <main class="profile-main">
        <div v-if="activeSection === 'basic'" class="content-section">
          <div class="section-header">
            <h2>基本信息</h2>
            <el-button v-if="!editMode" type="primary" @click="handleEdit">
              编辑资料
            </el-button>
          </div>

          <div class="form-container">
            <ProfileForm
              :user="userStore.user"
              :edit-mode="editMode"
              @save="handleSave"
              @cancel="handleCancel"
            />
          </div>
        </div>

        <div v-else-if="activeSection === 'security'" class="content-section">
          <div class="section-header">
            <h2>安全设置</h2>
          </div>
          <div class="placeholder-content">
            <el-icon :size="48" color="var(--text-color-secondary)"><Lock /></el-icon>
            <p>密码修改和安全设置功能即将推出</p>
          </div>
        </div>

        <div v-else-if="activeSection === 'notifications'" class="content-section">
          <div class="section-header">
            <h2>通知偏好</h2>
          </div>
          <div class="placeholder-content">
            <el-icon :size="48" color="var(--text-color-secondary)"><Bell /></el-icon>
            <p>通知设置功能即将推出</p>
          </div>
        </div>
      </main>
    </div>

    <div v-else v-loading="userStore.loading" class="loading-container" />
  </DashboardLayout>
</template>

<style scoped>
/* 主体内容 */
.profile-body {
  flex: 1;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* 左侧卡片区 */
.profile-sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: sticky;
  top: 120px;
  height: fit-content;
}

/* 用户信息卡片 */
.user-info-card {
  background: var(--bg-color);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: all 0.3s ease;
  border: 1px solid var(--border-color);
}

.user-info-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--border-color-light);
}

.avatar-wrapper {
  margin-bottom: 16px;
}

.user-details {
  width: 100%;
  margin-bottom: 20px;
}

.user-name {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--text-color-primary);
}

.user-email {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin: 0 0 12px 0;
  word-break: break-all;
}

.membership-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border: 2px solid;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.user-stats {
  width: 100%;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.stat-label {
  font-size: 13px;
  color: var(--text-color-secondary);
}

.stat-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color-primary);
}

/* 导航菜单 */
.profile-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--border-color);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-color-regular);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.nav-item:hover {
  background: var(--bg-color-page);
  color: var(--color-primary);
}

.nav-item.active {
  background: var(--color-primary);
  color: white;
  font-weight: 500;
}

.nav-item .el-icon {
  font-size: 18px;
  flex-shrink: 0;
}

/* 主内容区 */
.profile-main {
  background: var(--bg-color);
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--border-color);
  min-height: 600px;
}

.content-section {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--border-color);
}

.section-header h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: var(--text-color-primary);
}

.form-container {
  max-width: 600px;
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.placeholder-content p {
  margin-top: 16px;
  font-size: 15px;
  color: #6B7280;
}

.loading-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 600px;
}

/* 平板端适配 (768-1023px) */
@media (max-width: 1023px) {
  .profile-body {
    grid-template-columns: 280px 1fr;
    gap: 20px;
    padding: 24px;
  }

  .profile-sidebar {
    top: 100px;
  }

  .user-info-card {
    padding: 20px;
  }

  .profile-main {
    padding: 24px;
  }

  .section-header h2 {
    font-size: 18px;
  }
}

/* 移动端适配 (≤767px) */
@media (max-width: 767px) {
  .main-content {
    margin-left: 0;
  }

  .top-bar {
    padding: 16px;
  }

  .page-title {
    font-size: 20px;
    margin-bottom: 4px;
  }

  .page-subtitle {
    font-size: 12px;
  }

  .profile-body {
    grid-template-columns: 1fr;
    gap: 16px;
    padding: 16px;
  }

  .profile-sidebar {
    position: static;
    top: auto;
  }

  .user-info-card {
    padding: 16px;
  }

  .profile-nav {
    flex-direction: row;
    overflow-x: auto;
    padding: 8px;
    gap: 0;
  }

  .nav-item {
    flex-shrink: 0;
    padding: 10px 12px;
    font-size: 12px;
    flex-direction: column;
    gap: 4px;
  }

  .nav-item span {
    font-size: 10px;
  }

  .profile-main {
    padding: 16px;
    min-height: auto;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 24px;
  }

  .section-header h2 {
    font-size: 16px;
  }

  .form-container {
    max-width: 100%;
  }

  .placeholder-content {
    padding: 60px 16px;
  }

  .placeholder-content p {
    font-size: 14px;
  }
}
</style>
