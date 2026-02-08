<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { User, Lock, Bell, Medal, Setting } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores';
import { useSubscriptionStore } from '@client/stores/subscription';
import { userApi } from '@client/services';
import { useDateTime } from '@client/composables/useDateTime';
import { useTheme } from '@client/composables/useTheme';
import { useLocale } from '@client/composables/useLocale';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import ProfileForm from '@client/components/profile/ProfileForm.vue';
import AvatarUpload from '@client/components/profile/AvatarUpload.vue';

const { t } = useI18n();
const { formatRelativeTime } = useDateTime();
const { setTheme } = useTheme();
const { currentLocale, setLocale } = useLocale();

const userStore = useUserStore();
const subscriptionStore = useSubscriptionStore();
const editMode = ref(false);
const activeSection = ref('basic');

const menuItems = [
  { key: 'basic', label: computed(() => t('profile.basicInfo')), icon: User },
  { key: 'security', label: computed(() => t('profile.security')), icon: Lock },
  { key: 'notifications', label: computed(() => t('profile.notifications')), icon: Bell },
  { key: 'preferences', label: computed(() => t('profile.preferences')), icon: Setting },
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
    free: t('subscription.free'),
    pro: t('subscription.pro'),
    team: t('subscription.team'),
  };
  return labels[plan] || t('subscription.free');
});

const membershipColor = computed(() => {
  const plan = subscriptionStore.currentPlan;
  const colors: Record<string, string> = {
    free: 'var(--text-tertiary)',
    pro: 'var(--accent-purple)',
    team: 'var(--color-danger)',
  };
  return colors[plan] || 'var(--text-tertiary)';
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
    ElMessage.success(t('profile.saveSuccess'));
    editMode.value = false;
  } catch (error: unknown) {
    ElMessage.error(t('profile.saveFailed'));
  }
}

// Password change
const passwordForm = reactive({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
const changingPassword = ref(false);

async function handleChangePassword() {
  if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
    ElMessage.error(t('profile.passwordMismatch'));
    return;
  }
  if (passwordForm.newPassword.length < 8) {
    ElMessage.error(t('profile.passwordTooShort'));
    return;
  }
  changingPassword.value = true;
  try {
    await userApi.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
    ElMessage.success(t('profile.passwordChanged'));
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmNewPassword = '';
  } catch (error: unknown) {
    ElMessage.error(t('profile.passwordChangeFailed'));
  } finally {
    changingPassword.value = false;
  }
}

// Preferences
const themeChoice = ref(localStorage.getItem('theme') || 'dark');
const langChoice = ref(currentLocale.value);

function handleThemeChange(val: string | number | boolean | undefined) {
  const value = String(val);
  if (value === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
    localStorage.setItem('theme', 'system');
  } else {
    setTheme(value as 'light' | 'dark');
  }
}

function handleLangChange(val: string | number | boolean | undefined) {
  setLocale(String(val) as 'zh-CN' | 'en-US');
}

// Data export
function handleExportData() {
  if (!userStore.user) return;
  const data = {
    name: userStore.user.name,
    email: userStore.user.email,
    createdAt: userStore.user.createdAt,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `profile-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success(t('profile.exportSuccess'));
}
</script>

<template>
  <DashboardLayout>
    <template #title>{{ t('profile.title') }}</template>
    <template #subtitle>{{ t('profile.subtitle') }}</template>

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
              <span class="stat-label">{{ t('profile.registeredAt') }}</span>
              <span class="stat-value">{{ formatRelativeTime(userStore.user.createdAt) }}</span>
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
            <h2>{{ t('profile.basicInfo') }}</h2>
            <div class="section-header-actions">
              <el-button @click="handleExportData">
                {{ t('profile.exportData') }}
              </el-button>
              <el-button v-if="!editMode" type="primary" @click="handleEdit">
                {{ t('profile.editProfile') }}
              </el-button>
            </div>
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
            <h2>{{ t('profile.security') }}</h2>
          </div>
          <div class="form-container">
            <el-form :model="passwordForm" label-position="top" @submit.prevent="handleChangePassword">
              <el-form-item :label="t('profile.currentPassword')">
                <el-input v-model="passwordForm.currentPassword" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('profile.newPassword')">
                <el-input v-model="passwordForm.newPassword" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('profile.confirmNewPassword')">
                <el-input v-model="passwordForm.confirmNewPassword" type="password" show-password />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" native-type="submit" :loading="changingPassword">
                  {{ t('profile.changePassword') }}
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </div>

        <div v-else-if="activeSection === 'notifications'" class="content-section">
          <div class="section-header">
            <h2>{{ t('profile.notifications') }}</h2>
          </div>
          <div class="placeholder-content">
            <el-icon :size="48" color="var(--text-secondary)"><Bell /></el-icon>
            <p>{{ t('profile.notificationsComingSoon') }}</p>
          </div>
        </div>

        <div v-else-if="activeSection === 'preferences'" class="content-section">
          <div class="section-header">
            <h2>{{ t('profile.preferences') }}</h2>
          </div>
          <div class="form-container">
            <el-form label-position="top">
              <el-form-item :label="t('profile.theme')">
                <el-radio-group v-model="themeChoice" @change="handleThemeChange">
                  <el-radio-button value="dark">{{ t('theme.dark') }}</el-radio-button>
                  <el-radio-button value="light">{{ t('theme.light') }}</el-radio-button>
                  <el-radio-button value="system">{{ t('theme.system') }}</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item :label="t('profile.language')">
                <el-radio-group v-model="langChoice" @change="handleLangChange">
                  <el-radio-button value="zh-CN">中文</el-radio-button>
                  <el-radio-button value="en-US">English</el-radio-button>
                </el-radio-group>
              </el-form-item>
            </el-form>
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
  animation: fadeIn var(--duration-slow) var(--ease-out) both;
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
  background: var(--surface-card);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--text-primary) 8%, transparent);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: all 0.3s ease;
  border: 1px solid var(--border-default);
}

.user-info-card:hover {
  box-shadow: 0 4px 12px color-mix(in srgb, var(--text-primary) 10%, transparent);
  border-color: var(--border-subtle);
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
  color: var(--text-primary);
}

.user-email {
  font-size: 13px;
  color: var(--text-secondary);
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
  background: color-mix(in srgb, var(--accent-purple) 10%, transparent);
}

.user-stats {
  width: 100%;
  padding-top: 20px;
  border-top: 1px solid var(--border-default);
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

/* 导航菜单 */
.profile-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--surface-card);
  border-radius: 12px;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--text-primary) 8%, transparent);
  border: 1px solid var(--border-default);
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
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.nav-item:hover {
  background: var(--bg-base);
  color: var(--accent-purple);
}

.nav-item.active {
  background: var(--accent-purple);
  color: white;
  font-weight: 500;
}

.nav-item .el-icon {
  font-size: 18px;
  flex-shrink: 0;
}

/* 主内容区 */
.profile-main {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--text-primary) 8%, transparent);
  border: 1px solid var(--border-default);
  min-height: 600px;
}

.content-section {
  animation: fadeIn 0.3s ease;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--border-default);
}

.section-header h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.section-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
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
  color: var(--text-secondary);
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
