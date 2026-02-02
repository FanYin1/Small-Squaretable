<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Check, CreditCard, Calendar, TrendCharts, User } from '@element-plus/icons-vue';
import { useSubscriptionStore } from '@client/stores/subscription';
import { useUsageStore } from '@client/stores/usage';
import { useUserStore } from '@client/stores';
import LeftSidebar from '@client/components/layout/LeftSidebar.vue';
import UsageDashboard from '@client/components/subscription/UsageDashboard.vue';

const route = useRoute();
const router = useRouter();
const subscriptionStore = useSubscriptionStore();
const usageStore = useUsageStore();
const userStore = useUserStore();
const billingCycle = ref<'monthly' | 'yearly'>('monthly');
const showUserMenu = ref(false);

const plans = computed(() => [
  {
    id: 'free',
    name: '免费版',
    monthlyPrice: '¥0',
    yearlyPrice: '¥0',
    features: [
      '100 条消息/月',
      '50,000 LLM Tokens/月',
      '10 张图片/月',
      '基础对话功能',
      '社区浏览',
    ],
    priceId: null,
  },
  {
    id: 'pro',
    name: '专业版',
    monthlyPrice: '¥29',
    yearlyPrice: '¥290',
    features: [
      '10,000 条消息/月',
      '1,000,000 LLM Tokens/月',
      '500 张图片/月',
      '优先响应速度',
      '高级模型访问',
      '角色分享',
      '历史记录导出',
    ],
    priceId: billingCycle.value === 'monthly'
      ? subscriptionStore.config?.prices.proMonthly
      : subscriptionStore.config?.prices.proYearly,
    popular: true,
    savings: '节省 2 个月费用',
  },
  {
    id: 'team',
    name: '团队版',
    monthlyPrice: '¥99',
    yearlyPrice: '¥990',
    features: [
      '100,000 条消息/月',
      '10,000,000 LLM Tokens/月',
      '5,000 张图片/月',
      '10,000 API 调用/月',
      '团队协作',
      '自定义角色',
      'API 访问',
      '优先客服支持',
    ],
    priceId: subscriptionStore.config?.prices.teamMonthly,
    savings: '节省 2 个月费用',
  },
]);

const statusText = computed(() => {
  const status = subscriptionStore.subscription?.status;
  const map: Record<string, string> = {
    active: '活跃',
    canceled: '已取消',
    past_due: '逾期',
    trialing: '试用中',
  };
  return map[status || ''] || '未知';
});

const statusType = computed(() => {
  const status = subscriptionStore.subscription?.status;
  const map: Record<string, string> = {
    active: 'success',
    canceled: 'info',
    past_due: 'danger',
    trialing: 'warning',
  };
  return map[status || ''] || 'info';
});

const currentPlanName = computed(() => {
  const plan = subscriptionStore.currentPlan;
  const names: Record<string, string> = {
    free: '免费版',
    pro: '专业版',
    team: '团队版',
  };
  return names[plan] || '免费版';
});

const expiryDate = computed(() => {
  if (!subscriptionStore.subscription?.currentPeriodEnd) return null;
  return new Date(subscriptionStore.subscription.currentPeriodEnd).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

const usageStats = computed(() => [
  {
    label: '消息数',
    value: usageStore.messagesQuota?.currentUsage || 0,
    total: usageStore.messagesQuota?.limit || 0,
    icon: '💬',
  },
  {
    label: 'LLM Tokens',
    value: usageStore.tokensQuota?.currentUsage || 0,
    total: usageStore.tokensQuota?.limit || 0,
    icon: '🤖',
  },
  {
    label: '图片生成',
    value: usageStore.imagesQuota?.currentUsage || 0,
    total: usageStore.imagesQuota?.limit || 0,
    icon: '🖼️',
  },
]);

const isLoggedIn = computed(() => !!userStore.user);

onMounted(async () => {
  await Promise.all([
    subscriptionStore.fetchStatus(),
    subscriptionStore.fetchConfig(),
    usageStore.fetchQuota(),
  ]);

  if (route.query.success === 'true') {
    ElMessage.success('订阅成功！感谢您的支持');
  } else if (route.query.canceled === 'true') {
    ElMessage.info('订阅已取消');
  }
});

async function handleSubscribe(priceId: string | null) {
  if (!priceId) return;
  try {
    await subscriptionStore.startCheckout(priceId);
  } catch {
    ElMessage.error('启动支付失败，请稍后重试');
  }
}

async function handleManage() {
  try {
    await subscriptionStore.openPortal();
  } catch {
    ElMessage.error('打开账单管理失败，请稍后重试');
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function handleLogout() {
  userStore.logout();
  showUserMenu.value = false;
}
</script>

<template>
  <div class="subscription-page">
    <!-- 左侧导航栏 -->
    <LeftSidebar />

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部栏 -->
      <header class="top-bar">
        <h1 class="page-title">订阅管理</h1>

        <!-- 用户菜单 -->
        <div class="user-menu-wrapper">
          <el-dropdown v-if="isLoggedIn" trigger="click" @command="handleLogout">
            <div class="user-avatar-btn">
              <el-avatar
                :size="40"
                :src="userStore.user?.avatar"
              >
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
                <el-dropdown-item divided @click="$router.push('/profile')">
                  个人中心
                </el-dropdown-item>
                <el-dropdown-item @click="$router.push('/my-characters')">
                  我的角色
                </el-dropdown-item>
                <el-dropdown-item @click="$router.push('/subscription')">
                  订阅管理
                </el-dropdown-item>
                <el-dropdown-item @click="$router.push('/profile')">
                  设置
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <div v-else class="auth-buttons">
            <el-button @click="$router.push('/login')">登录</el-button>
            <el-button type="primary" @click="$router.push('/register')">注册</el-button>
          </div>
        </div>
      </header>

      <!-- 内容区域 -->
      <div class="content-wrapper">
        <!-- 当前订阅状态卡片 -->
        <section class="current-status-section">
          <div class="section-header">
            <h2>当前订阅</h2>
            <p>管理您的订阅计划和使用情况</p>
          </div>

          <div class="status-cards">
            <!-- 订阅信息卡片 -->
            <div v-if="subscriptionStore.subscription" class="status-card subscription-card">
              <div class="card-badge" :class="subscriptionStore.currentPlan">
                {{ currentPlanName }}
              </div>

              <div class="card-content">
                <div class="status-row">
                  <span class="label">状态</span>
                  <el-tag :type="statusType" size="large">{{ statusText }}</el-tag>
                </div>

                <div v-if="expiryDate" class="status-row">
                  <span class="label">
                    <el-icon><Calendar /></el-icon>
                    到期时间
                  </span>
                  <span class="value">{{ expiryDate }}</span>
                </div>

                <div v-if="subscriptionStore.subscription.cancelAtPeriodEnd" class="cancel-warning">
                  <el-alert type="warning" :closable="false" show-icon>
                    订阅将在周期结束后取消
                  </el-alert>
                </div>

                <el-button
                  v-if="subscriptionStore.isPro"
                  type="primary"
                  :icon="CreditCard"
                  @click="handleManage"
                  :loading="subscriptionStore.loading"
                  class="manage-btn"
                >
                  管理订阅
                </el-button>
              </div>
            </div>

            <!-- 使用量统计卡片 -->
            <div class="status-card usage-card">
              <div class="card-header">
                <el-icon class="header-icon"><TrendCharts /></el-icon>
                <span class="header-title">使用统计</span>
              </div>

              <div class="card-content">
                <div class="usage-list">
                  <div v-for="stat in usageStats" :key="stat.label" class="usage-item">
                    <div class="usage-header">
                      <span class="usage-icon">{{ stat.icon }}</span>
                      <span class="usage-label">{{ stat.label }}</span>
                    </div>
                    <div class="usage-progress">
                      <div class="progress-bar">
                        <div
                          class="progress-fill"
                          :style="{ width: `${Math.min((stat.value / stat.total) * 100, 100)}%` }"
                        />
                      </div>
                      <span class="usage-text">{{ formatNumber(stat.value) }} / {{ formatNumber(stat.total) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 订阅计划选择 -->
        <section class="plans-section">
          <div class="section-header">
            <h2>选择订阅计划</h2>
            <p>升级到更高级别的方案，解锁更多功能</p>
          </div>

          <!-- 计费周期切换 -->
          <div class="billing-toggle">
            <span :class="{ active: billingCycle === 'monthly' }">月付</span>
            <el-switch
              v-model="billingCycle"
              active-value="yearly"
              inactive-value="monthly"
              size="large"
            />
            <span :class="{ active: billingCycle === 'yearly' }">
              年付
              <el-tag type="success" size="small" style="margin-left: 8px;">省 17%</el-tag>
            </span>
          </div>

          <!-- 计划卡片网格 -->
          <div class="plans-grid">
            <div
              v-for="plan in plans"
              :key="plan.id"
              :class="['plan-card', { popular: plan.popular, current: subscriptionStore.currentPlan === plan.id }]"
            >
              <div v-if="plan.popular" class="popular-badge">最受欢迎</div>

              <div class="plan-header">
                <h3>{{ plan.name }}</h3>
                <div class="price">
                  <span class="amount">{{ billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice }}</span>
                  <span class="period">{{ billingCycle === 'monthly' ? '/月' : '/年' }}</span>
                </div>
                <div v-if="billingCycle === 'yearly' && plan.savings" class="savings">
                  {{ plan.savings }}
                </div>
              </div>

              <ul class="features">
                <li v-for="feature in plan.features" :key="feature">
                  <el-icon class="check-icon"><Check /></el-icon>
                  <span>{{ feature }}</span>
                </li>
              </ul>

              <el-button
                v-if="plan.priceId && subscriptionStore.currentPlan !== plan.id"
                type="primary"
                :class="{ 'popular-btn': plan.popular }"
                @click="handleSubscribe(plan.priceId)"
                :loading="subscriptionStore.loading"
                class="subscribe-btn"
              >
                {{ subscriptionStore.currentPlan === 'free' ? '立即订阅' : '升级方案' }}
              </el-button>
              <el-button v-else-if="subscriptionStore.currentPlan === plan.id" disabled class="subscribe-btn">
                当前方案
              </el-button>
              <el-button v-else disabled class="subscribe-btn">
                免费使用
              </el-button>
            </div>
          </div>
        </section>

        <!-- 详细使用量仪表盘 -->
        <section class="dashboard-section">
          <UsageDashboard />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.subscription-page {
  display: flex;
  min-height: 100vh;
  background: #F9FAFB;
}

/* 主内容区 */
.main-content {
  flex: 1;
  margin-left: 64px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* 顶部栏 */
.top-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 32px;
  background: white;
  border-bottom: 1px solid #E5E7EB;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  margin: 0;
  white-space: nowrap;
}

.user-menu-wrapper {
  margin-left: auto;
  flex-shrink: 0;
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
  color: #111827;
  margin-bottom: 4px;
}

.user-email {
  font-size: 12px;
  color: #9CA3AF;
}

.auth-buttons {
  display: flex;
  gap: 12px;
}

/* 内容包装器 */
.content-wrapper {
  flex: 1;
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* 区块标题 */
.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 8px 0;
}

.section-header p {
  font-size: 14px;
  color: #6B7280;
  margin: 0;
}

/* 当前状态区域 */
.current-status-section {
  margin-bottom: 48px;
}

.status-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

.status-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.status-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

/* 订阅卡片 */
.subscription-card {
  position: relative;
}

.card-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 20px;
}

.card-badge.free {
  background: linear-gradient(135deg, #6B7280, #9CA3AF);
  color: white;
}

.card-badge.pro {
  background: linear-gradient(135deg, #3B82F6, #60A5FA);
  color: white;
}

.card-badge.team {
  background: linear-gradient(135deg, #10B981, #34D399);
  color: white;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #F3F4F6;
}

.status-row:last-of-type {
  border-bottom: none;
}

.status-row .label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #6B7280;
}

.status-row .value {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.cancel-warning {
  margin-top: 8px;
}

.manage-btn {
  width: 100%;
  margin-top: 8px;
  background: #3B82F6;
  border-color: #3B82F6;
}

.manage-btn:hover {
  background: #2563EB;
  border-color: #2563EB;
}

/* 使用量卡片 */
.usage-card .card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid #F3F4F6;
}

.header-icon {
  font-size: 20px;
  color: #3B82F6;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.usage-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.usage-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.usage-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.usage-icon {
  font-size: 20px;
}

.usage-label {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.usage-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar {
  height: 8px;
  background: #E5E7EB;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3B82F6, #10B981);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.usage-text {
  font-size: 12px;
  color: #6B7280;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}

/* 订阅计划区域 */
.plans-section {
  margin-bottom: 48px;
}

.billing-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px;
  margin-bottom: 32px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.billing-toggle span {
  font-size: 15px;
  font-weight: 500;
  color: #6B7280;
  transition: all 0.2s;
}

.billing-toggle span.active {
  color: #3B82F6;
  font-weight: 600;
}

/* 计划卡片网格 */
.plans-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.plan-card {
  position: relative;
  background: white;
  border: 2px solid #E5E7EB;
  border-radius: 16px;
  padding: 32px 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}

.plan-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.plan-card.popular {
  border-color: #3B82F6;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.03), rgba(59, 130, 246, 0.08));
}

.plan-card.current {
  border-color: #10B981;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.03), rgba(16, 185, 129, 0.08));
}

.popular-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #3B82F6, #2563EB);
  color: white;
  padding: 6px 20px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.plan-header {
  text-align: center;
  padding-bottom: 24px;
  border-bottom: 2px solid #F3F4F6;
  margin-bottom: 24px;
}

.plan-header h3 {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 16px 0;
  color: #111827;
}

.price {
  margin-bottom: 8px;
}

.price .amount {
  font-size: 36px;
  font-weight: 800;
  color: #3B82F6;
}

.price .period {
  font-size: 14px;
  color: #6B7280;
  font-weight: 500;
}

.savings {
  margin-top: 8px;
  font-size: 13px;
  color: #10B981;
  font-weight: 600;
}

.features {
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
  flex: 1;
}

.features li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  color: #374151;
  font-size: 14px;
}

.features li .check-icon {
  color: #10B981;
  font-size: 18px;
  flex-shrink: 0;
}

.subscribe-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
  transition: all 0.2s ease;
  background: #3B82F6;
  border-color: #3B82F6;
  color: white;
}

.subscribe-btn:hover {
  background: #2563EB;
  border-color: #2563EB;
  transform: translateY(-1px);
}

.popular-btn {
  background: linear-gradient(135deg, #3B82F6, #2563EB);
  border: none;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.popular-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

/* 仪表盘区域 */
.dashboard-section {
  margin-bottom: 32px;
}

/* 平板端适配 */
@media (max-width: 1023px) {
  .status-cards {
    grid-template-columns: 1fr;
  }

  .plans-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* 移动端适配 */
@media (max-width: 767px) {
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

  .user-menu-wrapper {
    margin-left: 0;
  }

  .auth-buttons {
    width: 100%;
  }

  .auth-buttons .el-button {
    flex: 1;
  }

  .content-wrapper {
    padding: 20px 16px;
  }

  .section-header h2 {
    font-size: 18px;
  }

  .section-header p {
    font-size: 13px;
  }

  .status-cards {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .status-card {
    padding: 20px;
  }

  .plans-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .plan-card {
    padding: 24px 20px;
  }

  .price .amount {
    font-size: 32px;
  }

  .billing-toggle {
    padding: 16px;
  }
}
</style>
