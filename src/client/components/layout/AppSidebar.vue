<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ChatDotRound, Plus } from '@element-plus/icons-vue';

const router = useRouter();
const isCollapsed = ref(false);

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};
</script>

<template>
  <el-aside :width="isCollapsed ? '64px' : '200px'" class="app-sidebar">
    <div class="sidebar-header">
      <h3 v-if="!isCollapsed">聊天列表</h3>
      <el-button
        :icon="isCollapsed ? 'Expand' : 'Fold'"
        circle
        size="small"
        @click="toggleCollapse"
      />
    </div>

    <div class="sidebar-content">
      <el-button
        v-if="!isCollapsed"
        type="primary"
        :icon="Plus"
        class="new-chat-button"
        @click="router.push('/market')"
      >
        新建聊天
      </el-button>
      <el-button
        v-else
        type="primary"
        :icon="Plus"
        circle
        class="new-chat-button-collapsed"
        @click="router.push('/market')"
      />

      <div class="placeholder-content">
        <el-icon :size="48" color="#909399">
          <ChatDotRound />
        </el-icon>
        <p v-if="!isCollapsed" class="placeholder-text">
          聊天列表将在 Task 7 实现
        </p>
      </div>
    </div>
  </el-aside>
</template>

<style scoped>
.app-sidebar {
  background-color: #f5f7fa;
  border-right: 1px solid #e4e7ed;
  transition: width 0.3s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4e7ed;
  min-height: 60px;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-content {
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.new-chat-button {
  width: 100%;
}

.new-chat-button-collapsed {
  width: 100%;
}

.placeholder-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  opacity: 0.6;
}

.placeholder-text {
  font-size: 14px;
  color: #909399;
  text-align: center;
  margin: 0;
}

/* Responsive Design */
@media (max-width: 768px) {
  .app-sidebar {
    position: fixed;
    left: 0;
    top: 60px;
    bottom: 0;
    z-index: 1000;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  }
}

/* Dark theme support preparation */
@media (prefers-color-scheme: dark) {
  .app-sidebar {
    background-color: var(--el-bg-color-overlay);
    border-right-color: var(--el-border-color);
  }

  .sidebar-header {
    border-bottom-color: var(--el-border-color);
  }

  .sidebar-header h3 {
    color: var(--el-text-color-primary);
  }

  .placeholder-text {
    color: var(--el-text-color-secondary);
  }
}
</style>
