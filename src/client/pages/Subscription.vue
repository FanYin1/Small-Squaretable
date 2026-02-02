<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Check, CreditCard, Calendar, TrendCharts } from '@element-plus/icons-vue';
import { useSubscriptionStore } from '@client/stores/subscription';
import { useUsageStore } from '@client/stores/usage';
import UsageDashboard from '@client/components/subscription/UsageDashboard.vue';

const route = useRoute();
const subscriptionStore = useSubscriptionStore();
const usageStore = useUsageStore();
const billingCycle = ref<'monthly' | 'yearly'>('monthly');

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
</script>

<template>
  <div class="subscription-container">
    <div class="subscription-header">
      <h1>订阅管理</h1>
      <p>选择适合您的方案，解锁更多功能</p>
    </div>

    <div class="subscription-layout">
      <!-- Left Sidebar -->
      <aside class="subscription-sidebar">
        <!-- Current Subscription Card -->
        <div v-if="subscriptionStore.subscription" class="current-subscription glass-card">
          <div class="subscription-badge" :class="subscriptionStore.currentPlan">
            <span class="badge-text">{{ currentPlanName }}</span>
          </div>

          <div class="subscription-status">
            <el-tag :type="statusType" size="large">{{ statusText }}</el-tag>
          </div>

          <div v-if="expiryDate" class="subscription-info">
            <div class="info-item">
              <el-icon><Calendar /></el-icon>
              <div class="info-content">
                <span class="info-label">到期时间</span>
                <span class="info-value">{{ expiryDate }}</span>
              </div>
            </div>
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

        <!-- Usage Statistics Card -->
        <div class="usage-stats glass-card">
          <div class="stats-header">
            <el-icon><TrendCharts /></el-icon>
            <span>使用统计</span>
          </div>

          <div class="stats-list">
            <div v-for="stat in usageStats" :key="stat.label" class="stat-item">
              <span class="stat-icon">{{ stat.icon }}</span>
              <div class="stat-content">
                <span class="stat-label">{{ stat.label }}</span>
                <div class="stat-progress">
                  <div class="stat-bar">
                    <div
                      class="stat-fill"
                      :style="{ width: `${Math.min((stat.value / stat.total) * 100, 100)}%` }"
                    />
                  </div>
                  <span class="stat-text">{{ formatNumber(stat.value) }} / {{ formatNumber(stat.total) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="quota-remaining">
            <span class="remaining-label">配额剩余</span>
            <el-progress
              :percentage="usageStore.messagesQuota ? Math.round((usageStore.messagesQuota.remaining / usageStore.messagesQuota.limit) * 100) : 0"
              :color="['#f56c6c', '#e6a23c', '#67c23a']"
              :stroke-width="8"
            />
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="subscription-main">
        <!-- Billing Cycle Toggle -->
        <div class="billing-cycle-toggle">
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

        <!-- Plans Grid -->
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

        <!-- Usage Dashboard -->
        <div class="usage-dashboard-section">
          <UsageDashboard />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.subscription-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 24px;
}

.subscription-header {
  margin-bottom: 32px;
}

.subscription-header h1 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
}

.subscription-header p {
  font-size: 16px;
  color: var(--el-text-color-secondary);
  margin: 0;
}

.subscription-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  align-items: start;
}

/* Left Sidebar */
.subscription-sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: sticky;
  top: 24px;
}

.glass-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.glass-card:hover {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

/* Current Subscription Card */
.current-subscription {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.subscription-badge {
  text-align: center;
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.subscription-badge.free {
  background: linear-gradient(135deg, #909399, #b1b3b8);
  color: white;
}

.subscription-badge.pro {
  background: linear-gradient(135deg, #409EFF, #66b1ff);
  color: white;
}

.subscription-badge.team {
  background: linear-gradient(135deg, #F56C6C, #f89898);
  color: white;
}

.subscription-status {
  display: flex;
  justify-content: center;
}

.subscription-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
}

.info-item .el-icon {
  font-size: 20px;
  color: var(--el-color-primary);
}

.info-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.info-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.cancel-warning {
  margin-top: 8px;
}

.manage-btn {
  width: 100%;
  margin-top: 8px;
}

/* Usage Statistics Card */
.usage-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  padding-bottom: 12px;
  border-bottom: 2px solid rgba(0, 0, 0, 0.06);
}

.stats-header .el-icon {
  font-size: 20px;
  color: var(--el-color-primary);
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.stat-icon {
  font-size: 24px;
  line-height: 1;
}

.stat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.stat-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-bar {
  height: 6px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 3px;
  overflow: hidden;
}

.stat-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.stat-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.quota-remaining {
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.remaining-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  margin-bottom: 8px;
}

/* Main Content */
.subscription-main {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.billing-cycle-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.billing-cycle-toggle span {
  font-size: 16px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  transition: all 0.3s;
}

.billing-cycle-toggle span.active {
  color: var(--el-color-primary);
  font-weight: 600;
}

/* Plans Grid */
.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.plan-card {
  position: relative;
  background: white;
  border: 2px solid transparent;
  border-radius: 16px;
  padding: 28px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
}

.plan-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
}

.plan-card.popular {
  border-color: var(--el-color-primary);
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.02), rgba(64, 158, 255, 0.05));
}

.plan-card.current {
  background: var(--el-fill-color-light);
  border-color: var(--el-color-success);
}

.popular-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
  color: white;
  padding: 6px 20px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
}

.plan-header {
  text-align: center;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--el-border-color-lighter);
  margin-bottom: 20px;
}

.plan-header h3 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
}

.price {
  margin-bottom: 8px;
}

.price .amount {
  font-size: 40px;
  font-weight: 800;
  color: var(--el-text-color-primary);
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.price .period {
  font-size: 16px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.savings {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-color-success);
  font-weight: 600;
}

.features {
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
}

.features li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.features li .check-icon {
  color: var(--el-color-success);
  font-size: 18px;
  flex-shrink: 0;
}

.subscribe-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 10px;
  transition: all 0.3s ease;
}

.popular-btn {
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
  border: none;
}

.popular-btn:hover {
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(64, 158, 255, 0.3);
}

.usage-dashboard-section {
  margin-top: 16px;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .subscription-container {
    padding: 20px 16px;
  }

  .subscription-header h1 {
    font-size: 24px;
  }

  .subscription-header p {
    font-size: 14px;
  }

  .subscription-layout {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .subscription-sidebar {
    position: static;
  }

  .glass-card {
    padding: 20px;
  }

  .plans-grid {
    grid-template-columns: 1fr;
  }

  .plan-card {
    padding: 24px;
  }

  .price .amount {
    font-size: 32px;
  }

  .billing-cycle-toggle {
    padding: 16px;
  }
}

/* Tablet */
@media (max-width: 1024px) and (min-width: 769px) {
  .subscription-layout {
    grid-template-columns: 280px 1fr;
  }

  .plans-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
}
</style>
