<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChatDotRound, Star, TrendCharts, Clock, User, MessageBox, Promotion } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores';
import { useToast, useDateTime } from '@client/composables';
import { api } from '@client/services/api';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';

const router = useRouter();
const userStore = useUserStore();
const toast = useToast();
const { t } = useI18n();
const { formatRelativeTime } = useDateTime();

// Dashboard data
const dashboardData = ref({
  recentChats: [] as any[],
  characterStats: { total: 0, favorites: 0 },
  usageStats: { messagesThisMonth: 0, charactersUsed: 0 },
});

const loading = ref(false);

const activityData = ref([
  { day: 'Mon', count: 12 },
  { day: 'Tue', count: 28 },
  { day: 'Wed', count: 15 },
  { day: 'Thu', count: 35 },
  { day: 'Fri', count: 22 },
  { day: 'Sat', count: 40 },
  { day: 'Sun', count: 18 },
]);

const activityDayKeys: Record<string, string> = {
  Mon: 'dashboard.mon',
  Tue: 'dashboard.tue',
  Wed: 'dashboard.wed',
  Thu: 'dashboard.thu',
  Fri: 'dashboard.fri',
  Sat: 'dashboard.sat',
  Sun: 'dashboard.sun',
};

const chartPadding = { top: 10, right: 20, bottom: 24, left: 20 };
const chartWidth = 300;
const chartHeight = 120;

const activityPoints = computed(() => {
  const data = activityData.value;
  const maxCount = Math.max(...data.map((d) => d.count));
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const stepX = plotWidth / (data.length - 1);

  return data.map((d, i) => ({
    x: chartPadding.left + i * stepX,
    y: chartPadding.top + plotHeight - (d.count / maxCount) * plotHeight,
    day: d.day,
    count: d.count,
  }));
});

const polylinePoints = computed(() =>
  activityPoints.value.map((p) => `${p.x},${p.y}`).join(' ')
);

const areaPath = computed(() => {
  const pts = activityPoints.value;
  if (pts.length === 0) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  const bottomY = chartHeight - chartPadding.bottom;
  let d = `M ${first.x},${bottomY}`;
  for (const p of pts) {
    d += ` L ${p.x},${p.y}`;
  }
  d += ` L ${last.x},${bottomY} Z`;
  return d;
});

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
    toast.error(t('common.retry'));
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

</script>

<template>
  <DashboardLayout>
    <template #title>{{ $t('nav.home') }}</template>
    <template #actions>
      <button class="btn-action" @click="handleViewMarket">
        <el-icon><Star /></el-icon>
        {{ $t('dashboard.browseMarket') }}
      </button>
      <button class="btn-action btn-action-primary" @click="handleStartChat">
        <el-icon><ChatDotRound /></el-icon>
        {{ $t('chat.newChat') }}
      </button>
    </template>

    <div class="dashboard-content">
      <div class="welcome-section">
        <h2 class="welcome-title">{{ $t('dashboard.welcome', { name: userStore.user?.name }) }}</h2>
        <p class="welcome-subtitle">{{ $t('dashboard.continueChat') }}</p>
      </div>

      <div class="quick-actions" role="navigation" aria-label="Quick actions">
        <div class="quick-action-card" role="button" tabindex="0" @click="handleChatClick(dashboardData.recentChats[0]?.id)" @keydown.enter="handleChatClick(dashboardData.recentChats[0]?.id)" v-if="dashboardData.recentChats.length > 0">
          <el-icon :size="24"><ChatDotRound /></el-icon>
          <div class="quick-action-info">
            <span class="quick-action-title">{{ $t('dashboard.continueChat') }}</span>
            <span class="quick-action-desc">{{ dashboardData.recentChats[0]?.character?.name }}</span>
          </div>
        </div>
        <div class="quick-action-card" role="button" tabindex="0" @click="handleViewMarket" @keydown.enter="handleViewMarket">
          <el-icon :size="24"><Star /></el-icon>
          <div class="quick-action-info">
            <span class="quick-action-title">{{ $t('dashboard.browseMarket') }}</span>
            <span class="quick-action-desc">{{ $t('dashboard.characterStats') }}</span>
          </div>
        </div>
        <div class="quick-action-card" role="button" tabindex="0" @click="handleStartChat" @keydown.enter="handleStartChat">
          <el-icon :size="24"><Promotion /></el-icon>
          <div class="quick-action-info">
            <span class="quick-action-title">{{ $t('dashboard.startChat') }}</span>
            <span class="quick-action-desc">{{ $t('dashboard.createCharacter') }}</span>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="dashboard-card">
          <div class="card-header">
            <h3 class="card-title">
              <el-icon><Clock /></el-icon>
              {{ $t('dashboard.recentChats') }}
            </h3>
            <button class="card-link" @click="handleViewAllChats">{{ $t('dashboard.viewAll') }}</button>
          </div>
          <div class="card-content">
            <el-skeleton v-if="loading" :rows="4" animated />
            <template v-else>
              <div v-if="dashboardData.recentChats.length === 0" class="empty-state">
                <el-icon class="empty-icon"><MessageBox /></el-icon>
                <p>{{ $t('dashboard.noRecentChats') }}</p>
                <button class="btn-small" @click="handleStartChat">{{ $t('dashboard.startChat') }}</button>
              </div>
              <div v-else class="chat-list">
                <div
                  v-for="chat in dashboardData.recentChats"
                  :key="chat.id"
                  class="chat-item"
                  role="button"
                  tabindex="0"
                  @click="handleChatClick(chat.id)"
                  @keydown.enter="handleChatClick(chat.id)"
                >
                  <div class="chat-avatar">
                    <el-avatar :src="chat.character?.avatar" :size="40">
                      {{ chat.character?.name?.[0] }}
                    </el-avatar>
                  </div>
                  <div class="chat-info">
                    <div class="chat-name">{{ chat.character?.name || $t('chat.noMessages') }}</div>
                    <div class="chat-preview">{{ chat.lastMessage || $t('chat.noMessages') }}</div>
                  </div>
                  <div class="chat-time">{{ formatRelativeTime(chat.updatedAt) }}</div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="dashboard-card">
          <div class="card-header">
            <h3 class="card-title">
              <el-icon><User /></el-icon>
              {{ $t('dashboard.characterStats') }}
            </h3>
            <button class="card-link" @click="handleViewCharacters">{{ $t('common.edit') }}</button>
          </div>
          <div class="card-content">
            <el-skeleton v-if="loading" :rows="2" animated />
            <template v-else>
              <div class="stats-container">
                <div class="stat-box">
                  <div class="stat-label">{{ $t('dashboard.totalCharacters') }}</div>
                  <div class="stat-value">{{ dashboardData.characterStats.total }}</div>
                </div>
                <div class="stat-box">
                  <div class="stat-label">{{ $t('dashboard.favorites') }}</div>
                  <div class="stat-value">{{ dashboardData.characterStats.favorites }}</div>
                </div>
              </div>
              <button class="btn-small" @click="handleViewMarket">{{ $t('dashboard.browseMarket') }}</button>
            </template>
          </div>
        </div>

        <div class="dashboard-card">
          <div class="card-header">
            <h3 class="card-title">
              <el-icon><TrendCharts /></el-icon>
              {{ $t('dashboard.usageStats') }}
            </h3>
          </div>
          <div class="card-content">
            <el-skeleton v-if="loading" :rows="2" animated />
            <template v-else>
              <div class="stats-container">
                <div class="stat-box">
                  <div class="stat-label">{{ $t('dashboard.messagesThisMonth') }}</div>
                  <div class="stat-value">{{ dashboardData.usageStats.messagesThisMonth }}</div>
                </div>
                <div class="stat-box">
                  <div class="stat-label">{{ $t('dashboard.charactersUsed') }}</div>
                  <div class="stat-value">{{ dashboardData.usageStats.charactersUsed }}</div>
                </div>
              </div>
              <button class="btn-small" @click="handleViewSubscription">{{ $t('dashboard.viewAll') }}</button>
            </template>
          </div>
        </div>

        <div class="dashboard-card activity-card">
          <div class="card-header">
            <h3 class="card-title">
              <el-icon><TrendCharts /></el-icon>
              {{ $t('dashboard.activityTitle') }}
            </h3>
          </div>
          <div class="card-content activity-chart-content">
            <svg :viewBox="`0 0 ${chartWidth} ${chartHeight}`" class="activity-chart" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--accent-purple)" stop-opacity="0.3" />
                  <stop offset="100%" stop-color="var(--accent-purple)" stop-opacity="0.02" />
                </linearGradient>
              </defs>
              <path :d="areaPath" fill="url(#activityGradient)" />
              <polyline :points="polylinePoints" fill="none" stroke="var(--accent-purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <circle v-for="(point, idx) in activityPoints" :key="idx" :cx="point.x" :cy="point.y" r="3" fill="var(--accent-purple)" class="chart-dot" />
              <text v-for="(point, idx) in activityPoints" :key="'label-'+idx" :x="point.x" :y="chartHeight - 6" text-anchor="middle" class="chart-label">{{ t(activityDayKeys[point.day]) }}</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.btn-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-action:hover {
  background: var(--bg-base);
  border-color: var(--accent-purple);
  color: var(--accent-purple);
}

.btn-action-primary {
  background: var(--accent-purple);
  color: white;
  border-color: var(--accent-purple);
}

.btn-action-primary:hover {
  background: var(--accent-purple);
  border-color: var(--accent-purple);
}

.dashboard-content {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}

.welcome-section {
  margin-bottom: 32px;
  padding: 32px;
  border-radius: 16px;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--accent-purple) 12%, var(--surface-card)),
    color-mix(in srgb, var(--accent-cyan) 8%, var(--surface-card))
  );
  border: 1px solid var(--border-subtle);
}

.welcome-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.welcome-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.dashboard-card {
  background: color-mix(in srgb, var(--surface-card) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  overflow: hidden;
  transition: all var(--duration-slow) var(--ease-out);
  animation: fadeIn var(--duration-slow) var(--ease-out) both;
}

.dashboard-card:nth-child(1) { animation-delay: 0s; }
.dashboard-card:nth-child(2) { animation-delay: 0.1s; }
.dashboard-card:nth-child(3) { animation-delay: 0.2s; }

.dashboard-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--accent-purple) 8%, transparent);
  border-color: var(--accent-purple);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
  background: color-mix(in srgb, var(--accent-purple) 2%, transparent);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.card-title :deep(.el-icon) {
  color: var(--accent-purple);
}

.card-link {
  padding: 0;
  background: none;
  border: none;
  color: var(--accent-purple);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s ease;
}

.card-link:hover {
  color: var(--accent-purple);
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
  color: color-mix(in srgb, var(--accent-purple) 15%, transparent);
  margin-bottom: 16px;
}

.empty-state p {
  font-size: 14px;
  color: var(--text-secondary);
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
  background: color-mix(in srgb, var(--accent-purple) 2%, transparent);
  cursor: pointer;
  transition: all 0.2s ease;
}

.chat-item:focus-visible {
  outline: 2px solid var(--accent-purple);
  outline-offset: -2px;
  border-radius: 8px;
}

.chat-item:hover {
  background: color-mix(in srgb, var(--accent-purple) 8%, transparent);
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
  color: var(--text-primary);
  margin-bottom: 4px;
}

.chat-preview {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-time {
  font-size: 12px;
  color: var(--text-secondary);
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
  background: color-mix(in srgb, var(--accent-purple) 5%, transparent);
  border-radius: 8px;
  text-align: center;
}

.stat-box .stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.stat-box .stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent-purple);
}

.btn-small {
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--accent-purple);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-purple) 10%, transparent);
  color: var(--accent-purple);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-small:hover {
  background: var(--accent-purple);
  color: white;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.quick-action-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: color-mix(in srgb, var(--surface-card) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  cursor: pointer;
  transition: all var(--duration-slow) var(--ease-out);
}

.quick-action-card:focus-visible {
  outline: 2px solid var(--accent-purple);
  outline-offset: 2px;
}

.quick-action-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--accent-purple) 8%, transparent);
  border-color: var(--accent-purple);
}

.quick-action-card .el-icon {
  color: var(--accent-purple);
  flex-shrink: 0;
}

.quick-action-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quick-action-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.quick-action-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.activity-card {
  grid-column: 1 / -1;
}

.activity-chart-content {
  padding: 16px 20px 8px;
}

.activity-chart {
  width: 100%;
  height: auto;
  max-height: 160px;
}

.chart-dot {
  transition: r 0.2s ease;
}

.chart-dot:hover {
  r: 5;
}

.chart-label {
  font-size: 10px;
  fill: var(--text-secondary);
  user-select: none;
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

  .quick-actions {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .stats-container {
    grid-template-columns: 1fr;
  }
}

</style>
