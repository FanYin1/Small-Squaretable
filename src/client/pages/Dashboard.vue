<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChatDotRound, Star, TrendCharts, Clock, User, MessageBox } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores';
import { useToast } from '@client/composables/useToast';
import { api } from '@client/services/api';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';

const router = useRouter();
const userStore = useUserStore();
const toast = useToast();

// Dashboard data
const dashboardData = ref({
  recentChats: [] as any[],
  characterStats: { total: 0, favorites: 0 },
  usageStats: { messagesThisMonth: 0, charactersUsed: 0 },
});

const loading = ref(false);

onMounted(async () => {
  await fetchDashboardData();
});

async function fetchDashboardData() {
  loading.value = true;
  try {
    // Fetch recent chats
    const chatsResponse = await api.get('/chats?limit=5&sort=-updatedAt');
    dashboardData.value.recentChats = chatsResponse.items || [];

    // Fetch character stats
    const statsResponse = await api.get('/characters/stats');
    dashboardData.value.characterStats = statsResponse;

    // Fetch usage stats
    const usageResponse = await api.get('/usage/stats');
    dashboardData.value.usageStats = usageResponse;
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
    toast.error('加载失败', { message: '无法获取仪表盘数据' });
  } finally {
    loading.value = false;
  }
}

const handleStartChat = () => {
  router.push({ name: 'Market' });
};

const handleChatClick = (chatId: string) => {
  router.push({ name: 'ChatSession', params: { chatId } });
};

const handleViewAllChats = () => {
  router.push({ name: 'Chat' });
};

const handleViewCharacters = () => {
  router.push({ name: 'MyCharacters' });
};

const handleViewMarket = () => {
  router.push({ name: 'Market' });
};

const handleViewSubscription = () => {
  router.push({ name: 'Subscription' });
};

// Helper function to format time
function formatTime(date: string | Date): string {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString('zh-CN');
}
</script>

<template>
  <DashboardLayout>
    <template #title>仪表盘</template>
    <template #actions>
      <button class="btn-action" @click="handleViewMarket">
        <el-icon><Star /></el-icon>
        浏览角色
      </button>
      <button class="btn-action btn-action-primary" @click="handleStartChat">
        <el-icon><ChatDotRound /></el-icon>
        新建聊天
      </button>
    </template>

    <div v-loading="loading" class="dashboard-content">
      <div class="welcome-section">
        <h2 class="welcome-title">欢迎回来，{{ userStore.user?.name }}！</h2>
        <p class="welcome-subtitle">继续您的 AI 对话之旅</p>
      </div>

      <div class="dashboard-grid">
        <div class="dashboard-card">
          <div class="card-header">
            <h3 class="card-title">
              <el-icon><Clock /></el-icon>
              最近聊天
            </h3>
            <button class="card-link" @click="handleViewAllChats">查看全部</button>
          </div>
          <div class="card-content">
            <div v-if="dashboardData.recentChats.length === 0" class="empty-state">
              <el-icon class="empty-icon"><MessageBox /></el-icon>
              <p>暂无聊天记录</p>
              <button class="btn-small" @click="handleStartChat">开始聊天</button>
            </div>
            <div v-else class="chat-list">
              <div
                v-for="chat in dashboardData.recentChats"
                :key="chat.id"
                class="chat-item"
                @click="handleChatClick(chat.id)"
              >
                <div class="chat-avatar">
                  <el-avatar :src="chat.character?.avatar" :size="40">
                    {{ chat.character?.name?.[0] }}
                  </el-avatar>
                </div>
                <div class="chat-info">
                  <div class="chat-name">{{ chat.character?.name || '未知角色' }}</div>
                  <div class="chat-preview">{{ chat.lastMessage || '暂无消息' }}</div>
                </div>
                <div class="chat-time">{{ formatTime(chat.updatedAt) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="dashboard-card">
          <div class="card-header">
            <h3 class="card-title">
              <el-icon><User /></el-icon>
              角色统计
            </h3>
            <button class="card-link" @click="handleViewCharacters">管理</button>
          </div>
          <div class="card-content">
            <div class="stats-container">
              <div class="stat-box">
                <div class="stat-label">总角色数</div>
                <div class="stat-value">{{ dashboardData.characterStats.total }}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">收藏角色</div>
                <div class="stat-value">{{ dashboardData.characterStats.favorites }}</div>
              </div>
            </div>
            <button class="btn-small" @click="handleViewMarket">发现更多角色</button>
          </div>
        </div>

        <div class="dashboard-card">
          <div class="card-header">
            <h3 class="card-title">
              <el-icon><TrendCharts /></el-icon>
              使用统计
            </h3>
          </div>
          <div class="card-content">
            <div class="stats-container">
              <div class="stat-box">
                <div class="stat-label">本月消息</div>
                <div class="stat-value">{{ dashboardData.usageStats.messagesThisMonth }}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">使用角色</div>
                <div class="stat-value">{{ dashboardData.usageStats.charactersUsed }}</div>
              </div>
            </div>
            <button class="btn-small" @click="handleViewSubscription">查看详情</button>
          </div>
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');

.btn-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--bg-color);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.btn-action:hover {
  background: var(--color-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-action-primary {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.btn-action-primary:hover {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
}

.dashboard-content {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}

.welcome-section {
  margin-bottom: 32px;
}

.welcome-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.welcome-subtitle {
  font-size: 16px;
  color: var(--color-text-secondary);
  margin: 0;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.dashboard-card {
  background: var(--bg-color);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.dashboard-card:hover {
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 10%, transparent);
  border-color: var(--color-primary-light);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-primary) 2%, transparent);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.card-title :deep(.el-icon) {
  color: var(--color-primary);
}

.card-link {
  padding: 0;
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.card-link:hover {
  color: var(--color-primary-dark);
}

.card-content {
  padding: 20px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  color: var(--color-primary-light);
  margin-bottom: 16px;
}

.empty-state p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 16px 0;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 2%, transparent);
  cursor: pointer;
  transition: all 0.2s ease;
}

.chat-item:hover {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  transform: translateX(4px);
}

.chat-avatar {
  flex-shrink: 0;
}

.chat-info {
  flex: 1;
  min-width: 0;
}

.chat-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.chat-preview {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-time {
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.stats-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-box {
  padding: 16px;
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  border-radius: 8px;
  text-align: center;
}

.stat-box .stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.stat-box .stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-primary);
}

.btn-small {
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.btn-small:hover {
  background: var(--color-primary);
  color: white;
}

@media (max-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .btn-action {
    flex: 1;
  }

  .dashboard-content {
    padding: 16px;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .welcome-title {
    font-size: 20px;
  }
}

@media (max-width: 480px) {
  .stats-container {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .dashboard-card {
    background: var(--color-surface-dark);
    border-color: var(--color-border);
  }

  .card-header {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    border-bottom-color: var(--color-border);
  }

  .btn-action {
    background: var(--color-surface-dark);
    color: var(--color-text-primary);
    border-color: var(--color-border);
  }

  .btn-action:hover {
    background: var(--color-surface-darker);
    border-color: var(--color-primary);
  }

  .chat-item {
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  }

  .chat-item:hover {
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  }

  .stat-box {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }
}
</style>
