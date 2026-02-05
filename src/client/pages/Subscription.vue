<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Check, CreditCard, Calendar, TrendCharts, User } from '@element-plus/icons-vue';
import { useSubscriptionStore } from '@client/stores/subscription';
import { useUsageStore } from '@client/stores/usage';
import { useToast } from '@client/composables/useToast';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import UsageDashboard from '@client/components/subscription/UsageDashboard.vue';

const route = useRoute();
const subscriptionStore = useSubscriptionStore();
const usageStore = useUsageStore();
const toast = useToast();
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
    toast.success('订阅成功', { message: '感谢您的支持' });
  } else if (route.query.canceled === 'true') {
    toast.info('订阅已取消');
  }
});

async function handleSubscribe(priceId: string | null) {
  if (!priceId) return;
  try {
    await subscriptionStore.startCheckout(priceId);
  } catch {
    toast.error('启动支付失败', { message: '请稍后重试' });
  }
}

async function handleManage() {
  try {
    await subscriptionStore.openPortal();
  } catch {
    toast.error('打开账单管理失败', { message: '请稍后重试' });
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
  <DashboardLayout>
    <template #title>订阅管理</template>

    <div class="content-wrapper">
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
  </DashboardLayout>
</template>

<style scoped>
/* 内容包装器 */
.content-wrapper {
  flex: 1;
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
  color: var(--text-color-primary);
  margin: 0 0 8px 0;
}

.section-header p {
  font-size: 14px;
  color: var(--text-color-secondary);
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
  background: var(--bg-color);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  border: 1px solid var(--border-color);
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
  background: linear-gradient(135deg, var(--text-color-secondary), var(--text-color-placeholder));
  color: white;
}

.card-badge.pro {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  color: white;
}

.card-badge.team {
  background: linear-gradient(135deg, var(--color-cta), var(--color-success));
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
  border-bottom: 1px solid var(--border-color-light);
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
  color: var(--text-color-secondary);
}

.status-row .value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.cancel-warning {
  margin-top: 8px;
}

.manage-btn {
  width: 100%;
  margin-top: 8px;
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.manage-btn:hover {
  background: var(--color-secondary);
  border-color: var(--color-secondary);
}

/* 使用量卡片 */
.usage-card .card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--border-color-light);
}

.header-icon {
  font-size: 20px;
  color: var(--color-primary);
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color-primary);
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
  color: var(--text-color-regular);
}

.usage-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar {
  height: 8px;
  background: var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary), var(--color-cta));
  border-radius: 4px;
  transition: width 0.3s ease;
}

.usage-text {
  font-size: 12px;
  color: var(--text-color-secondary);
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
  background: var(--bg-color);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border-color);
}

.billing-toggle span {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-color-secondary);
  transition: all 0.2s;
}

.billing-toggle span.active {
  color: var(--color-primary);
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
  background: var(--bg-color);
  border: 2px solid var(--border-color);
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
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, var(--bg-color));
}

.plan-card.current {
  border-color: var(--color-cta);
  background: color-mix(in srgb, var(--color-cta) 6%, var(--bg-color));
}

.popular-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
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
  border-bottom: 2px solid var(--border-color-light);
  margin-bottom: 24px;
}

.plan-header h3 {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 16px 0;
  color: var(--text-color-primary);
}

.price {
  margin-bottom: 8px;
}

.price .amount {
  font-size: 36px;
  font-weight: 800;
  color: var(--color-primary);
}

.price .period {
  font-size: 14px;
  color: var(--text-color-secondary);
  font-weight: 500;
}

.savings {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-cta);
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
  color: var(--text-color-regular);
  font-size: 14px;
}

.features li .check-icon {
  color: var(--color-cta);
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
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.subscribe-btn:hover {
  background: var(--color-secondary);
  border-color: var(--color-secondary);
  transform: translateY(-1px);
}

.popular-btn {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
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
