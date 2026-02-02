<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChatDotRound, Star, TrendCharts, Check, Clock, User, MessageBox } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores';
import { api } from '@client/services/api';
import LeftSidebar from '@client/components/layout/LeftSidebar.vue';

const router = useRouter();
const userStore = useUserStore();

// Authentication state
const isLoggedIn = computed(() => !!userStore.user);

// Marketing page features
const features = [
  {
    icon: ChatDotRound,
    title: '智能对话',
    description: '与 AI 角色进行自然流畅的对话体验',
  },
  {
    icon: Star,
    title: '丰富角色',
    description: '海量精选 AI 角色，满足不同场景需求',
  },
  {
    icon: TrendCharts,
    title: '持续学习',
    description: 'AI 角色会记住对话历史，提供个性化体验',
  },
];

const stats = [
  { label: '活跃用户', value: '10K+' },
  { label: 'AI 角色', value: '500+' },
  { label: '对话次数', value: '1M+' },
];

// Dashboard data for logged-in users
const dashboardData = ref({
  recentChats: [] as any[],
  characterStats: { total: 0, favorites: 0 },
  usageStats: { messagesThisMonth: 0, charactersUsed: 0 },
});

const loading = ref(false);

onMounted(async () => {
  if (isLoggedIn.value) {
    await fetchDashboardData();
  }
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
  } finally {
    loading.value = false;
  }
}

const handleStartChat = () => {
  router.push('/market');
};

const handleLogin = () => {
  router.push('/login');
};

const handleRegister = () => {
  router.push('/register');
};

const handleChatClick = (chatId: string) => {
  router.push(`/chat/${chatId}`);
};

const handleViewAllChats = () => {
  router.push('/chat');
};

const handleViewCharacters = () => {
  router.push('/my-characters');
};

const handleViewMarket = () => {
  router.push('/market');
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
  <!-- Unauthenticated: Marketing Page -->
  <div v-if="!isLoggedIn" class="home-page-marketing">
    <!-- Two-column layout container -->
    <div class="main-layout">
      <!-- Left Column: Hero Content (40%) -->
      <div class="left-column">
        <div class="hero-content glass-card">
          <div class="hero-badge">✨ AI 驱动的智能对话</div>
          <h1 class="hero-title">Small Squaretable</h1>
          <p class="hero-subtitle">下一代 AI 角色聊天平台</p>
          <p class="hero-description">
            与智能 AI 角色进行深度对话，体验前所未有的交互体验。
            支持多种场景，满足您的各种需求。
          </p>

          <div class="cta-buttons">
            <button class="btn-primary" @click="handleStartChat">
              <el-icon><ChatDotRound /></el-icon>
              开始聊天
            </button>
            <button class="btn-secondary" @click="handleLogin">
              登录账户
            </button>
          </div>

          <!-- Features List -->
          <div class="features-list">
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>支持多种 AI 模型</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>实时流式对话</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>角色记忆系统</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>社区角色市场</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>多平台同步</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-check"><Check /></el-icon>
              <span>企业级安全保障</span>
            </div>
          </div>

          <!-- Quick Stats -->
          <div class="quick-stats">
            <div class="quick-stat-item">
              <span class="stat-number">10K+</span>
              <span class="stat-label">活跃用户</span>
            </div>
            <div class="quick-stat-item">
              <span class="stat-number">500+</span>
              <span class="stat-label">AI 角色</span>
            </div>
            <div class="quick-stat-item">
              <span class="stat-number">1M+</span>
              <span class="stat-label">对话次数</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Features & Stats (60%) -->
      <div class="right-column">
        <!-- Stats Section -->
        <div class="stats-section glass-card">
          <div class="stats-grid">
            <div v-for="(stat, index) in stats" :key="index" class="stat-item">
              <div class="stat-value">{{ stat.value }}</div>
              <div class="stat-label">{{ stat.label }}</div>
            </div>
          </div>
        </div>

        <!-- Features Grid -->
        <div class="features-grid">
          <div
            v-for="(feature, index) in features"
            :key="index"
            class="feature-card glass-card"
          >
            <div class="feature-content">
              <el-icon :size="40" class="feature-icon">
                <component :is="feature.icon" />
              </el-icon>
              <h3 class="feature-title">{{ feature.title }}</h3>
              <p class="feature-description">{{ feature.description }}</p>
            </div>
          </div>
        </div>

        <!-- CTA Section -->
        <div class="cta-section glass-card">
          <h2 class="cta-title">准备好开始了吗？</h2>
          <p class="cta-description">加入数千名用户，体验 AI 对话的未来</p>
          <div class="cta-buttons-bottom">
            <button class="btn-primary-large" @click="handleRegister">
              免费注册
            </button>
            <button class="btn-secondary-large" @click="handleLogin">
              已有账户？登录
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Authenticated: Dashboard with Three-Segment Layout -->
  <div v-else class="home-page-dashboard">
    <!-- Left Sidebar -->
    <LeftSidebar />

    <!-- Main Content Area -->
    <div class="main-content">
      <!-- Top Bar -->
      <header class="top-bar">
        <h1 class="page-title">仪表盘</h1>
        <div class="top-bar-actions">
          <button class="btn-action" @click="handleViewMarket">
            <el-icon><Star /></el-icon>
            浏览角色
          </button>
          <button class="btn-action btn-action-primary" @click="handleStartChat">
            <el-icon><ChatDotRound /></el-icon>
            新建聊天
          </button>
        </div>
      </header>

      <!-- Dashboard Content -->
      <div v-loading="loading" class="dashboard-content">
        <!-- Welcome Section -->
        <div class="welcome-section">
          <h2 class="welcome-title">欢迎回来，{{ userStore.user?.name }}！</h2>
          <p class="welcome-subtitle">继续您的 AI 对话之旅</p>
        </div>

        <!-- Three-Column Grid -->
        <div class="dashboard-grid">
          <!-- Recent Chats Card -->
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

          <!-- Character Stats Card -->
          <div class="dashboard-card">
            <div class="card-header">
              <h3 class="card-title">
                <el-icon><Users /></el-icon>
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

          <!-- Usage Stats Card -->
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
              <button class="btn-small" @click="$router.push('/subscription')">查看详情</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Import Plus Jakarta Sans font */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');

/* Root variables - Blue color scheme */
:root {
  --color-primary: #3B82F6;
  --color-primary-dark: #2563EB;
  --color-primary-light: #DBEAFE;
  --color-success: #10B981;
  --color-success-dark: #059669;
  --color-bg: #EFF6FF;
  --color-text-primary: #111827;
  --color-text-secondary: #6B7280;
  --color-border: #E5E7EB;
  --color-border-light: rgba(59, 130, 246, 0.1);
}

.home-page-marketing {
  min-height: 100vh;
  background: linear-gradient(135deg, var(--color-bg) 0%, #F0F9FF 100%);
  padding: 40px 20px;
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.home-page-dashboard {
  display: flex;
  min-height: 100vh;
  background: #F9FAFB;
}

/* Main two-column layout */
.main-layout {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 40% 60%;
  gap: 32px;
  align-items: start;
}

/* Glassmorphism card style */
.glass-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: 24px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(124, 58, 237, 0.1);
  transition: all 0.3s ease;
}

/* Left Column */
.left-column {
  position: sticky;
  top: 40px;
}

.hero-content {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 600px;
  justify-content: center;
}

.hero-badge {
  display: inline-block;
  padding: 8px 16px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  color: white;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  width: fit-content;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
}

.hero-title {
  font-size: 56px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.1;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.4;
}

.hero-description {
  font-size: 16px;
  font-weight: 400;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.8;
}

/* CTA Buttons - Marketing Page */
.cta-buttons {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary {
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  font-family: 'Plus Jakarta Sans', sans-serif;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.btn-primary {
  background: var(--color-success);
  color: white;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.btn-primary:hover {
  background: var(--color-success-dark);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
  transform: translateY(-2px);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn-secondary:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: var(--color-primary-dark);
  color: var(--color-primary-dark);
  transform: translateY(-2px);
}

.btn-secondary:active {
  transform: translateY(0);
}

/* Features List */
.features-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
  padding: 20px;
  background: rgba(59, 130, 246, 0.05);
  border-radius: 12px;
  border: 1px solid var(--color-border-light);
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: var(--color-text-primary);
  font-weight: 500;
}

.feature-check {
  color: var(--color-success);
  font-size: 20px;
  flex-shrink: 0;
}

/* Quick Stats */
.quick-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 8px;
}

.quick-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background: rgba(59, 130, 246, 0.05);
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
  transition: all 0.2s ease;
}

.quick-stat-item:hover {
  background: rgba(59, 130, 246, 0.1);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}

.stat-number {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

/* Right Column */
.right-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Stats Section */
.stats-section {
  padding: 32px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  text-align: center;
}

.stat-item {
  padding: 16px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.05);
  transition: all 0.2s ease;
}

.stat-item:hover {
  background: rgba(59, 130, 246, 0.1);
  transform: translateY(-2px);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 8px;
}

/* Features Grid */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.feature-card {
  padding: 28px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.feature-card:hover {
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 12px 40px rgba(59, 130, 246, 0.15);
  border-color: var(--color-primary);
  transform: translateY(-4px);
}

.feature-content {
  text-align: center;
}

.feature-icon {
  margin-bottom: 16px;
  color: var(--color-primary);
  transition: color 0.2s ease;
}

.feature-card:hover .feature-icon {
  color: var(--color-primary-dark);
}

.feature-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.feature-description {
  font-size: 14px;
  font-weight: 400;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* CTA Section */
.cta-section {
  text-align: center;
  padding: 48px 40px;
}

.cta-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.cta-description {
  font-size: 16px;
  color: var(--color-text-secondary);
  margin: 0 0 24px 0;
}

.cta-buttons-bottom {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-primary-large,
.btn-secondary-large {
  padding: 14px 40px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.btn-primary-large {
  background: var(--color-primary);
  color: white;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
}

.btn-primary-large:hover {
  background: var(--color-primary-dark);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
  transform: translateY(-2px);
}

.btn-secondary-large {
  background: transparent;
  color: var(--color-primary);
  border: 2px solid var(--color-primary);
}

.btn-secondary-large:hover {
  background: rgba(59, 130, 246, 0.1);
  transform: translateY(-2px);
}

/* Main two-column layout */
.main-layout {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 40% 60%;
  gap: 32px;
  align-items: start;
}

/* Glassmorphism card style */
.glass-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border-light);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.08);
  transition: all 0.3s ease;
}

/* Left Column */
.left-column {
  position: sticky;
  top: 40px;
}

.hero-content {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 600px;
  justify-content: center;
}

.hero-badge {
  display: inline-block;
  padding: 8px 16px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: white;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  width: fit-content;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.hero-title {
  font-size: 56px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.1;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  line-height: 1.4;
}

.hero-description {
  font-size: 16px;
  font-weight: 400;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.8;
}

/* CTA Buttons */
.cta-buttons {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-seconda
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  font-family: 'Plus Jakarta Sans', sans-serif;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.btn-primary {
  background: var(--color-success);
  color: white;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.btn-primary:hover {
  background: var(--color-success-dark);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
  transform: translateY(-2px);
}

.btn-primary:active {
  transform: translateY(0)n
.btn-secondary {
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn-secondary:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: var(--color-primary-dark);
  color: var(--color-primary-dark);
  transform: translateY(-2px);
}

.btn-secondary:active {
  transform: translateY(0);
}

/* Features List */
.features-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
  padding: 20px;
  background: rgba(59, 130, 246, 0.05);
  border-radius: 12px;
  border: 1px solid var(--color-border-light);
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: var(--color-text-primary);
  font-weight: 500;
}

.feature-check {
  color: var(--color-success);
  font-size: 20px;
  flex-shrink: 0;
}

/* Quick Stats */
.quick-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 8px;
}

.quick-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background: rgba(59, 130, 246, 0.05);
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
  transition: all 0.2s ease;
}

.quick-stat-item:hover {
  background: rgba(59, 130, 246, 0.1);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}

.stat-number {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

/* Right Column */
.right-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Stats Section */
.stats-section {
  padding: 32px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  text-align: center;
}

.stat-item {
  padding: 16px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.05);
  transition: all 0.2s ease;
}

.stat-item:hover {
  background: rgba(59, 130, 246, 0.1);
  transform: translateY(-2px);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 8px;
}

/* Features Grid */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.feature-card {
  padding: 28px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.feature-card:hover {
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 12px 40px rgba(59, 130, 246, 0.15);
  border-color: var(--color-primary);
  transform: translateY(-4px);
}

.feature-content {
  text-align: center;
}

.feature-icon {
  margin-bottom: 16px;
  color: var(--color-primary);
  transition: color 0.2s ease;
}

.feature-card:hover .feature-icon {
  color: var(--color-primary-dark);
}

.feature-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.feature-description {
  font-size: 14px;
  font-weight: 400;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* CTA Section */
.cta-section {
  text-align: center;
  padding: 48px 40px;
}

.cta-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.cta-description {
  font-size: 16px;
  color: var(--color-text-secondary);
  margin: 0 0 24px 0;
}

.cta-buttons-bottom {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-primary-large,
.btn-secondary-large {
  padding: 14px 40px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.btn-primary-large {
  background: var(--color-primary);
  color: white;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
}

.btn-primary-large:hover {
  background: var(--color-primary-dark);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
  transform: translateY(-2px);
}

.btn-secondary-large {
  background: transparent;
  color: var(--color-primary);
  border: 2px solid var(--color-primary);
}

.btn-secondary-large:hover {
  background: rgba(59, 130, 246, 0.1);
  transform: translateY(-2px);
}

/* ===== DASHBOARD STYLES ===== */

/* Main content area */
.main-content {
  flex: 1;
  margin-left: 64px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* Top bar */
.top-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 32px;
  background: white;
  border-bottom: 1px solid var(--color-border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  white-space: nowrap;
}

.top-bar-actions {
  display: flex;
  gap: 12px;
  margin-left: auto;
}

.btn-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: white;
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

/* Dashboard content */
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

/* Dashboard grid */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.dashboard-card {
  background: white;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.dashboard-card:hover {
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
  border-color: var(--color-primary-light);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: rgba(59, 130, 246, 0.02);
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

/* Empty state */
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

/* Chat list */
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
  background: rgba(59, 130, 246, 0.02);
  cursor: pointer;
  transition: all 0.2s ease;
}

.chat-item:hover {
  background: rgba(59, 130, 246, 0.08);
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

/* Stats container */
.stats-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-box {
  padding: 16px;
  background: rgba(59, 130, 246, 0.05);
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

/* Small button */
.btn-small {
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.btn-small:hover {
  background: var(--color-primary);
  color: white;
}

/* Accessibility: Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Responsive Design: Tablet */
@media (max-width: 1024px) {
  .main-layout {
    grid-template-columns: 45% 55%;
    gap: 24px;
  }

  .hero-title {
    font-size: 40px;
  }

  .glass-card {
    padding: 32px;
  }

  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Responsive Design: Mobile (<768px) - Single column stack */
@media (max-width: 768px) {
  .home-page-marketing {
    padding: 20px 16px;
  }

  .main-layout {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .left-column {
    position: static;
  }

  .hero-content {
    text-align: center;
  }

  .hero-title {
    font-size: 32px;
    margin-bottom: 16px;
  }

  .hero-subtitle {
    font-size: 18px;
  }

  .hero-description {
    font-size: 14px;
    margin-bottom: 24px;
  }

  .cta-buttons {
    justify-content: center;
  }

  .btn-primary,
  .btn-secondary {
    padding: 12px 24px;
    font-size: 14px;
  }

  .glass-card {
    padding: 24px;
    border-radius: 12px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .stat-value {
    font-size: 28px;
  }

  .features-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .main-content {
    margin-left: 0;
  }

  .top-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    padding: 16px;
  }

  .page-title {
    font-size: 20px;
  }

  .top-bar-actions {
    margin-left: 0;
    width: 100%;
  }

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

  .cta-buttons-bottom {
    flex-direction: column;
  }

  .btn-primary-large,
  .btn-secondary-large {
    width: 100%;
  }
}

/* Small mobile devices */
@media (max-width: 480px) {
  .hero-title {
    font-size: 28px;
  }

  .hero-subtitle {
    font-size: 16px;
  }

  .cta-buttons {
    flex-direction: column;
    width: 100%;
  }

  .btn-primary,
  .btn-secondary {
    width: 100%;
  }

  .stats-container {
    grid-template-columns: 1fr;
  }
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1F2937;
    --color-text-primary: #F9FAFB;
    --color-text-secondary: #D1D5DB;
    --color-border: #374151;
    --color-border-light: rgba(59, 130, 246, 0.2);
  }

  .home-page-marketing {
    background: linear-gradient(135deg, #1F2937 0%, #111827 100%);
  }

  .home-page-dashboard {
    background: #111827;
  }

  .glass-card {
    background: rgba(30, 30, 40, 0.8);
    border-color: var(--color-border-light);
  }

  .stat-item {
    background: rgba(59, 130, 246, 0.15);
  }

  .stat-item:hover {
    background: rgba(59, 130, 246, 0.25);
  }

  .btn-secondary {
    background: rgba(59, 130, 246, 0.2);
    color: var(--color-primary-light);
  }

  .btn-secondary:hover {
    background: rgba(59, 130, 246, 0.3);
  }

  .main-content {
    background: #111827;
  }

  .top-bar {
    background: #1F2937;
    border-bottom-color: var(--color-border);
  }

  .dashboard-card {
    background: #1F2937;
    border-color: var(--color-border);
  }

  .card-header {
    background: rgba(59, 130, 246, 0.1);
    border-bottom-color: var(--color-border);
  }

  .btn-action {
    background: #1F2937;
    color: var(--color-text-primary);
    border-color: var(--color-border);
  }

  .btn-action:hover {
    background: #374151;
    border-color: var(--color-primary);
  }

  .chat-item {
    background: rgba(59, 130, 246, 0.08);
  }

  .chat-item:hover {
    background: rgba(59, 130, 246, 0.15);
  }

  .stat-box {
    background: rgba(59, 130, 246, 0.1);
  }
}
</style>
