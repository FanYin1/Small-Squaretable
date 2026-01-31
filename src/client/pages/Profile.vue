<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Edit } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores';
import { userApi } from '@client/services';
import ProfileForm from '@client/components/profile/ProfileForm.vue';
import AvatarUpload from '@client/components/profile/AvatarUpload.vue';

const userStore = useUserStore();
const editMode = ref(false);

onMounted(async () => {
  if (!userStore.user) {
    await userStore.fetchProfile();
  }
});

const avatarUrl = computed(() =>
  userStore.user?.avatar ||
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${userStore.user?.id}`
);

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
    <el-card class="profile-card">
      <template #header>
        <div class="card-header">
          <h2>个人中心</h2>
          <el-button v-if="!editMode" :icon="Edit" @click="handleEdit">
            编辑
          </el-button>
        </div>
      </template>

      <div v-if="userStore.user" class="profile-content">
        <div class="avatar-section">
          <AvatarUpload :avatar-url="avatarUrl" :disabled="!editMode" />
        </div>

        <el-divider />

        <ProfileForm
          :user="userStore.user"
          :edit-mode="editMode"
          @save="handleSave"
          @cancel="handleCancel"
        />
      </div>

      <div v-else v-loading="userStore.loading" class="loading-container" />
    </el-card>
  </div>
</template>

<style scoped>
.profile-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

.profile-card {
  box-shadow: var(--el-box-shadow-light);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.profile-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.avatar-section {
  display: flex;
  justify-content: center;
}

.loading-container {
  min-height: 400px;
}
</style>
