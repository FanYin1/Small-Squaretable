<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@client/stores';

const router = useRouter();
const userStore = useUserStore();

const isLoggedIn = computed(() => !!userStore.user);

const handleCommand = async (command: string) => {
  switch (command) {
    case 'profile':
      router.push({ name: 'Profile' });
      break;
    case 'my-characters':
      router.push({ name: 'MyCharacters' });
      break;
    case 'subscription':
      router.push({ name: 'Subscription' });
      break;
    case 'settings':
      router.push({ name: 'Profile' });
      break;
    case 'logout':
      await userStore.logout();
      router.push({ name: 'Home' });
      break;
    default:
      break;
  }
};

const handleLogin = () => {
  router.push({ name: 'Login' });
};

const handleRegister = () => {
  router.push({ name: 'Register' });
};
</script>

<template>
  <div class="user-menu">
    <el-dropdown v-if="isLoggedIn" trigger="click" @command="handleCommand">
      <div class="user-avatar-btn">
        <el-avatar :size="40" :src="userStore.user?.avatar">
          {{ userStore.user?.name?.[0] }}
        </el-avatar>
      </div>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item disabled>
            <div class="user-info">
              <div class="user-name">{{ userStore.user?.name }}</div>
              <div class="user-email">{{ userStore.user?.email }}</div>
            </div>
          </el-dropdown-item>
          <el-dropdown-item divided command="profile">
            📊 个人中心
          </el-dropdown-item>
          <el-dropdown-item command="my-characters">
            🎭 我的角色
          </el-dropdown-item>
          <el-dropdown-item command="subscription">
            💳 订阅管理
          </el-dropdown-item>
          <el-dropdown-item command="settings">
            ⚙️ 设置
          </el-dropdown-item>
          <el-dropdown-item divided command="logout">
            🚪 退出登录
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <div v-else class="auth-buttons">
      <el-button @click="handleLogin">登录</el-button>
      <el-button type="primary" @click="handleRegister">注册</el-button>
    </div>
  </div>
</template>

<style scoped>
.user-menu {
  display: flex;
  align-items: center;
}

.user-avatar-btn {
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.user-avatar-btn:hover {
  opacity: 0.8;
}

.user-info {
  padding: 8px 0;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-primary);
  margin-bottom: 4px;
}

.user-email {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.auth-buttons {
  display: flex;
  gap: 12px;
}
</style>
