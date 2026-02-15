<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { User, ChatDotRound, ShoppingBag } from '@element-plus/icons-vue';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const isAuthenticated = computed(() => localStorage.getItem('token') !== null);

const activeIndex = computed(() => {
  const path = route.path;
  if (path === '/') return '1';
  if (path.startsWith('/market')) return '2';
  if (path.startsWith('/chat')) return '3';
  return '1';
});

const handleLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('tenantId');
  router.push({ name: 'Home' });
};

const handleLogin = () => {
  router.push({ name: 'Login' });
};

const handleRegister = () => {
  router.push({ name: 'Register' });
};

const handleProfile = () => {
  router.push({ name: 'Profile' });
};

// Mobile menu
const isMobileMenuOpen = ref(false);
const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
};
</script>

<template>
  <el-header class="app-header">
    <div class="header-content">
      <!-- Logo and Brand -->
      <div class="brand" @click="router.push({ name: 'Home' })">
        <el-icon :size="28" color="#409eff">
          <ChatDotRound />
        </el-icon>
        <span class="brand-name">Small Squaretable</span>
      </div>

      <!-- Desktop Navigation -->
      <el-menu
        :default-active="activeIndex"
        mode="horizontal"
        class="desktop-menu"
        :ellipsis="false"
        background-color="transparent"
        text-color="#303133"
        active-text-color="#409eff"
      >
        <el-menu-item index="1" @click="router.push({ name: 'Home' })">
          {{ $t('nav.home') }}
        </el-menu-item>
        <el-menu-item index="2" @click="router.push({ name: 'Market' })">
          <el-icon><ShoppingBag /></el-icon>
          <span>{{ $t('nav.market') }}</span>
        </el-menu-item>
        <el-menu-item index="3" @click="router.push({ name: 'Chat' })">
          <el-icon><ChatDotRound /></el-icon>
          <span>{{ $t('nav.chat') }}</span>
        </el-menu-item>
      </el-menu>

      <!-- User Menu -->
      <div class="user-menu">
        <template v-if="isAuthenticated">
          <el-dropdown @command="(command: string) => command === 'profile' ? handleProfile() : command === 'subscription' ? router.push({ name: 'Subscription' }) : handleLogout()">
            <el-button circle :icon="User" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">{{ $t('nav.profile') }}</el-dropdown-item>
                <el-dropdown-item command="subscription">{{ $t('nav.subscription') }}</el-dropdown-item>
                <el-dropdown-item command="logout" divided>{{ $t('nav.logout') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
        <template v-else>
          <el-button @click="handleLogin" text>{{ $t('nav.login') }}</el-button>
          <el-button @click="handleRegister" type="primary">{{ $t('nav.register') }}</el-button>
        </template>
      </div>

      <!-- Mobile Menu Button -->
      <el-button
        class="mobile-menu-button"
        :icon="isMobileMenuOpen ? 'Close' : 'Menu'"
        circle
        @click="toggleMobileMenu"
      />
    </div>

    <!-- Mobile Menu Drawer -->
    <el-drawer
      v-model="isMobileMenuOpen"
      direction="rtl"
      size="70%"
      :show-close="false"
    >
      <el-menu
        :default-active="activeIndex"
        class="mobile-menu"
      >
        <el-menu-item index="1" @click="router.push({ name: 'Home' }); isMobileMenuOpen = false">
          {{ $t('nav.home') }}
        </el-menu-item>
        <el-menu-item index="2" @click="router.push({ name: 'Market' }); isMobileMenuOpen = false">
          <el-icon><ShoppingBag /></el-icon>
          <span>{{ $t('nav.market') }}</span>
        </el-menu-item>
        <el-menu-item index="3" @click="router.push({ name: 'Chat' }); isMobileMenuOpen = false">
          <el-icon><ChatDotRound /></el-icon>
          <span>{{ $t('nav.chat') }}</span>
        </el-menu-item>
        <el-divider v-if="isAuthenticated" />
        <el-menu-item v-if="isAuthenticated" @click="handleProfile(); isMobileMenuOpen = false">
          <el-icon><User /></el-icon>
          <span>{{ $t('nav.profile') }}</span>
        </el-menu-item>
        <el-menu-item v-if="isAuthenticated" @click="router.push({ name: 'Subscription' }); isMobileMenuOpen = false">
          {{ $t('nav.subscription') }}
        </el-menu-item>
        <el-menu-item v-if="isAuthenticated" @click="handleLogout(); isMobileMenuOpen = false">
          {{ $t('nav.logout') }}
        </el-menu-item>
        <template v-else>
          <el-menu-item @click="handleLogin(); isMobileMenuOpen = false">
            {{ $t('nav.login') }}
          </el-menu-item>
          <el-menu-item @click="handleRegister(); isMobileMenuOpen = false">
            {{ $t('nav.register') }}
          </el-menu-item>
        </template>
      </el-menu>
    </el-drawer>
  </el-header>
</template>

<style scoped>
.app-header {
  background-color: #ffffff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 20px;
  height: 60px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header-content {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
}

.brand-name {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.desktop-menu {
  flex: 1;
  margin: 0 40px;
  border-bottom: none;
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mobile-menu-button {
  display: none;
}

.mobile-menu {
  border-right: none;
}

/* Responsive Design */
@media (max-width: 768px) {
  .app-header {
    padding: 0 16px;
  }

  .brand-name {
    font-size: 16px;
  }

  .desktop-menu {
    display: none;
  }

  .user-menu {
    display: none;
  }

  .mobile-menu-button {
    display: block;
  }
}

/* Dark theme support preparation */
@media (prefers-color-scheme: dark) {
  .app-header {
    background-color: var(--el-bg-color);
    border-bottom-color: var(--el-border-color);
  }

  .brand-name {
    color: var(--el-text-color-primary);
  }
}
</style>
