<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { User, Lock, Bell, Shield } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores';
import { useSubscriptionStore } from '@client/stores/subscription';
import { userApi } from '@client/services';
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
    pro: '#409EFF',
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
  <div class="profile-container">
    <div class="profile-header">
      <h1>个人中心</h1>
      <p>管理您的账户信息和偏好设置</p>
    </div>

    <div v-if="userStore.user" class="profile-layout">
      <!-- Left Sidebar -->
      <aside class="profile-sidebar">
        <!-- User Info Card -->
        <div class="user-info-card glass-card">
          <div class="avatar-wrapper">
            <AvatarUpload :avatar-url="avatarUrl" :disabled="!editMode" />
          </div>

          <div class="user-details">
            <h3 class="user-name">{{ userStore.user.name }}</h3>
            <p class="user-email">{{ userStore.user.email }}</p>
            <div class="membership-badge" :style="{ borderColor: membershipColor }">
              <Shield :style="{ color: membershipColor }" />
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

        <!-- Navigation Menu -->
        <nav class="profile-nav glass-card">
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

      <!-- Main Content -->
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
            <el-icon :size="48" color="#909399"><Lock /></el-icon>
            <p>密码修改和安全设置功能即将推出</p>
          </div>
        </div>

        <div v-else-if="activeSection === 'notifications'" class="content-section">
          <div class="section-header">
            <h2>通知偏好</h2>
          </div>
          <div class="placeholder-content">
            <el-icon :size="48" color="#909399"><Bell /></el-icon>
            <p>通知设置功能即将推出</p>
          </div>
        </div>
      </main>
    </div>

    <div v-else v-loading="userStore.loading" class="loading-container" />
  </div>
</template>

<style scoped>
.profile-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 24px;
}

.profile-header {
  margin-bottom: 32px;
}

.profile-header h1 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
}

.profile-header p {
  font-size: 16px;
  color: var(--el-text-color-secondary);
  margin: 0;
}

.profile-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  align-items: start;
}

/* Left Sidebar */
.profile-sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: sticky;
  top: 24px;
}

.glass-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.glass-card:hover {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.user-info-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.avatar-wrapper {
  margin-bottom: 16px;
}

.user-details {
  width: 100%;
  margin-bottom: 20px;
}

.user-name {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--el-text-color-primary);
}

.user-email {
  font-size: 14px;
  color: var(--el-text-color-secondary);
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
  font-size: 14px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.5);
}

.user-stats {
  width: 100%;
  padding-top: 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.stat-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.stat-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

/* Navigation Menu */
.profile-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 15px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.nav-item:hover {
  background: rgba(64, 158, 255, 0.1);
  color: var(--el-color-primary);
}

.nav-item.active {
  background: var(--el-color-primary);
  color: white;
  font-weight: 500;
}

.nav-item .el-icon {
  font-size: 18px;
}

/* Main Content */
.profile-main {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
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
  border-bottom: 2px solid var(--el-border-color-lighter);
}

.section-header h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: var(--el-text-color-primary);
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
  font-size: 16px;
  color: var(--el-text-color-secondary);
}

.loading-container {
  min-height: 600px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .profile-container {
    padding: 20px 16px;
  }

  .profile-header h1 {
    font-size: 24px;
  }

  .profile-header p {
    font-size: 14px;
  }

  .profile-layout {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .profile-sidebar {
    position: static;
  }

  .user-info-card {
    padding: 20px;
  }

  .profile-nav {
    flex-direction: row;
    overflow-x: auto;
    padding: 8px;
  }

  .nav-item {
    flex-shrink: 0;
    padding: 10px 14px;
    font-size: 14px;
  }

  .nav-item span {
    display: none;
  }

  .profile-main {
    padding: 20px;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .section-header h2 {
    font-size: 20px;
  }
}

/* Tablet */
@media (max-width: 1024px) and (min-width: 769px) {
  .profile-layout {
    grid-template-columns: 280px 1fr;
  }
}
</style>
