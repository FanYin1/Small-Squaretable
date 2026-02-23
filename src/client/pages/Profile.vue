<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import { useUserStore } from '@client/stores/user';
import { userApi } from '@client/services/user.api';

const { t } = useI18n();
const userStore = useUserStore();

const form = reactive({
  displayName: '',
  bio: '',
  avatarUrl: '',
});
const saving = ref(false);

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

onMounted(() => {
  if (userStore.user) {
    form.displayName = userStore.user.name || '';
    form.bio = userStore.user.bio || '';
    form.avatarUrl = userStore.user.avatar || '';
  }
});

function handleAvatarUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPTED_TYPES.join(',');
  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      ElMessage.error(t('profile.invalidImageType', 'Invalid image type'));
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      ElMessage.error(t('profile.avatarTooLarge', 'Image must be under 5MB'));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      form.avatarUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function handleSave() {
  saving.value = true;
  try {
    await userApi.updateProfile({
      displayName: form.displayName || undefined,
      bio: form.bio || undefined,
      avatarUrl: form.avatarUrl || undefined,
    });
    await userStore.fetchProfile();
    ElMessage.success(t('profile.updateSuccess'));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : t('common.retry');
    ElMessage.error(msg);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <DashboardLayout>
    <template #title>{{ t('profile.title') }}</template>

    <div class="profile-edit-page">
      <el-form label-position="top" class="profile-form">
        <!-- Avatar -->
        <el-form-item :label="t('profile.avatar')">
          <div class="avatar-upload-area">
            <div class="avatar-preview">
              <img
                :src="form.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${form.displayName || 'default'}`"
                :alt="form.displayName"
                class="avatar-image"
              />
            </div>
            <el-button @click="handleAvatarUpload">{{ t('profile.uploadAvatar') }}</el-button>
          </div>
        </el-form-item>

        <!-- Display Name -->
        <el-form-item :label="t('profile.displayName')">
          <el-input v-model="form.displayName" :maxlength="100" show-word-limit />
        </el-form-item>

        <!-- Bio -->
        <el-form-item :label="t('profile.bio')">
          <el-input
            v-model="form.bio"
            type="textarea"
            :rows="4"
            :maxlength="500"
            show-word-limit
            :placeholder="t('profile.bioPlaceholder')"
          />
        </el-form-item>

        <!-- Actions -->
        <div class="form-actions">
          <router-link v-if="userStore.user" :to="{ name: 'UserProfile', params: { userId: userStore.user.id } }">
            <el-button>{{ t('profile.viewPublicProfile') }}</el-button>
          </router-link>
          <el-button type="primary" :loading="saving" @click="handleSave">
            {{ t('common.save', 'Save') }}
          </el-button>
        </div>
      </el-form>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.profile-edit-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 24px;
}

.profile-form {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 32px;
  border: 1px solid var(--border-default);
}

.avatar-upload-area {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--border-default);
  flex-shrink: 0;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-default);
}

@media (max-width: 767px) {
  .profile-edit-page {
    padding: 16px;
  }
  .profile-form {
    padding: 16px;
  }
  .avatar-upload-area {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
