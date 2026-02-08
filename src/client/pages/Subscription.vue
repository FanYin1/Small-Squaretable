<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Check, CreditCard, Calendar, TrendCharts, User, ChatDotRound, Cpu, Picture } from '@element-plus/icons-vue';
import { useSubscriptionStore } from '@client/stores/subscription';
import { useUsageStore } from '@client/stores/usage';
import { useToast } from '@client/composables/useToast';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import UsageDashboard from '@client/components/subscription/UsageDashboard.vue';

const route = useRoute();
const subscriptionStore = useSubscriptionStore();
const usageStore = useUsageStore();
const toast = useToast();
const { t, locale } = useI18n();
const billingCycle = ref<'monthly' | 'yearly'>('monthly');

const plans = computed(() => [
  {
    id: 'free',
    name: t('subscription.free'),
    monthlyPrice: '¥0',
    yearlyPrice: '¥0',
    features: [
      t('subscription.freeMessages'),
      t('subscription.freeTokens'),
      t('subscription.freeImages'),
      t('subscription.freeBasicChat'),
      t('subscription.freeCommunity'),
    ],
    priceId: null,
  },
  {
    id: 'pro',
    name: t('subscription.pro'),
    monthlyPrice: '¥29',
    yearlyPrice: '¥290',
    features: [
      t('subscription.proMessages'),
      t('subscription.proTokens'),
      t('subscription.proImages'),
      t('subscription.proPriority'),
      t('subscription.proModels'),
      t('subscription.proSharing'),
      t('subscription.proExport'),
    ],
    priceId: billingCycle.value === 'monthly'
      ? subscriptionStore.config?.prices.proMonthly
      : subscriptionStore.config?.prices.proYearly,
    popular: true,
    savings: t('subscription.saveTwoMonths'),
  },
  {
    id: 'team',
    name: t('subscription.team'),
    monthlyPrice: '¥99',
    yearlyPrice: '¥990',
    features: [
      t('subscription.teamMessages'),
      t('subscription.teamTokens'),
      t('subscription.teamImages'),
      t('subscription.teamApiCalls'),
      t('subscription.teamCollaboration'),
      t('subscription.teamCustomCharacters'),
      t('subscription.teamApiAccess'),
      t('subscription.teamSupport'),
    ],
    priceId: subscriptionStore.config?.prices.teamMonthly,
    savings: t('subscription.saveTwoMonths'),
  },
]);

const statusText = computed(() => {
  const status = subscriptionStore.subscription?.status;
  const map: Record<string, string> = {
    active: t('subscription.statusActive'),
    canceled: t('subscription.statusCancelled'),
    past_due: t('subscription.statusOverdue'),
    trialing: t('subscription.statusTrial'),
  };
  return map[status || ''] || t('subscription.statusUnknown');
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
    free: t('subscription.free'),
    pro: t('subscription.pro'),
    team: t('subscription.team'),
  };
  return names[plan] || t('subscription.free');
});

const expiryDate = computed(() => {
  if (!subscriptionStore.subscription?.currentPeriodEnd) return null;
  return new Date(subscriptionStore.subscription.currentPeriodEnd).toLocaleDateString(locale.value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

const usageStats = computed(() => [
  {
    label: t('subscription.messages'),
    value: usageStore.messagesQuota?.currentUsage || 0,
    total: usageStore.messagesQuota?.limit || 0,
    icon: ChatDotRound,
  },
  {
    label: t('subscription.tokens'),
    value: usageStore.tokensQuota?.currentUsage || 0,
    total: usageStore.tokensQuota?.limit || 0,
    icon: Cpu,
  },
  {
    label: t('subscription.images'),
    value: usageStore.imagesQuota?.currentUsage || 0,
    total: usageStore.imagesQuota?.limit || 0,
    icon: Picture,
  },
]);

onMounted(async () => {
  await Promise.all([
    subscriptionStore.fetchStatus(),
    subscriptionStore.fetchConfig(),
    usageStore.fetchQuota(),
  ]);

  if (route.query.success === 'true') {
    toast.success(t('subscription.subscribeSuccess'), { message: t('subscription.thankYou') });
  } else if (route.query.canceled === 'true') {
    toast.info(t('subscription.cancelled'));
  }
});

async function handleSubscribe(priceId: string | null) {
  if (!priceId) return;
  try {
    await subscriptionStore.startCheckout(priceId);
  } catch {
    toast.error(t('subscription.paymentFailed'), { message: t('common.retryLater') });
  }
}

async function handleManage() {
  try {
    await subscriptionStore.openPortal();
  } catch {
    toast.error(t('subscription.billingFailed'), { message: t('common.retryLater') });
  }
}

const faqs = computed(() => [
  { question: t('subscription.faqQ1'), answer: t('subscription.faqA1') },
  { question: t('subscription.faqQ2'), answer: t('subscription.faqA2') },
  { question: t('subscription.faqQ3'), answer: t('subscription.faqA3') },
  { question: t('subscription.faqQ4'), answer: t('subscription.faqA4') },
]);

const comparisonData = computed(() => [
  { feature: t('subscription.compMessages'), free: '50/day', pro: '500/day', team: t('subscription.unlimited') },
  { feature: t('subscription.compTokens'), free: '100K', pro: '1M', team: '10M' },
  { feature: t('subscription.compImages'), free: '10/day', pro: '100/day', team: t('subscription.unlimited') },
  { feature: t('subscription.compModels'), free: t('subscription.compBasic'), pro: t('subscription.compAll'), team: t('subscription.compAll') },
  { feature: t('subscription.compSharing'), free: '—', pro: '✓', team: '✓' },
  { feature: t('subscription.compApi'), free: '—', pro: '—', team: '✓' },
  { feature: t('subscription.compSupport'), free: t('subscription.compCommunity'), pro: t('subscription.compEmail'), team: t('subscription.compPriority') },
]);

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
    <template #title>{{ t('subscription.title') }}</template>

    <div class="content-wrapper">
      <section class="current-status-section">
        <div class="section-header">
          <h2>{{ t('subscription.currentPlan') }}</h2>
          <p>{{ t('subscription.subtitle') }}</p>
        </div>

          <div class="status-cards">
            <!-- 订阅信息卡片 -->
            <div v-if="subscriptionStore.subscription" class="status-card subscription-card">
              <div class="card-badge" :class="subscriptionStore.currentPlan">
                {{ currentPlanName }}
              </div>

              <div class="card-content">
                <div class="status-row">
                  <span class="label">{{ t('subscription.status') }}</span>
                  <el-tag :type="statusType" size="large">{{ statusText }}</el-tag>
                </div>

                <div v-if="expiryDate" class="status-row">
                  <span class="label">
                    <el-icon><Calendar /></el-icon>
                    {{ t('subscription.expiryDate') }}
                  </span>
                  <span class="value">{{ expiryDate }}</span>
                </div>

                <div v-if="subscriptionStore.subscription.cancelAtPeriodEnd" class="cancel-warning">
                  <el-alert type="warning" :closable="false" show-icon>
                    {{ t('subscription.cancelNotice') }}
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
                  {{ t('subscription.managePlan') }}
                </el-button>
              </div>
            </div>

            <!-- 使用量统计卡片 -->
            <div class="status-card usage-card">
              <div class="card-header">
                <el-icon class="header-icon"><TrendCharts /></el-icon>
                <span class="header-title">{{ t('subscription.usageStats') }}</span>
              </div>

              <div class="card-content">
                <div class="usage-list">
                  <div v-for="stat in usageStats" :key="stat.label" class="usage-item">
                    <div class="usage-header">
                      <span class="usage-icon"><el-icon :size="20"><component :is="stat.icon" /></el-icon></span>
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
            <h2>{{ t('subscription.choosePlan') }}</h2>
            <p>{{ t('subscription.upgradeDescription') }}</p>
          </div>

          <!-- 计费周期切换 -->
          <div class="billing-toggle">
            <span :class="{ active: billingCycle === 'monthly' }">{{ t('subscription.monthly') }}</span>
            <el-switch
              v-model="billingCycle"
              active-value="yearly"
              inactive-value="monthly"
              size="large"
            />
            <span :class="{ active: billingCycle === 'yearly' }">
              {{ t('subscription.yearly') }}
              <el-tag type="success" size="small" class="ml-sm">{{ t('subscription.save17') }}</el-tag>
            </span>
          </div>

          <!-- 计划卡片网格 -->
          <div class="plans-grid">
            <div
              v-for="plan in plans"
              :key="plan.id"
              :class="['plan-card', { popular: plan.popular, current: subscriptionStore.currentPlan === plan.id }]"
            >
              <div v-if="plan.popular" class="popular-badge">{{ t('subscription.mostPopular') }}</div>

              <div class="plan-header">
                <h3>{{ plan.name }}</h3>
                <div class="price">
                  <span class="amount">{{ billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice }}</span>
                  <span class="period">{{ billingCycle === 'monthly' ? t('subscription.perMonth') : t('subscription.perYear') }}</span>
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
                {{ subscriptionStore.currentPlan === 'free' ? t('subscription.subscribeNow') : t('subscription.upgradePlan') }}
              </el-button>
              <el-button v-else-if="subscriptionStore.currentPlan === plan.id" disabled class="subscribe-btn">
                {{ t('subscription.currentPlanLabel') }}
              </el-button>
              <el-button v-else disabled class="subscribe-btn">
                {{ t('subscription.freeUse') }}
              </el-button>
            </div>
          </div>
        </section>

        <!-- 详细使用量仪表盘 -->
        <section class="dashboard-section">
          <UsageDashboard />
        </section>

        <!-- Feature Comparison -->
        <div class="comparison-section">
          <h2 class="section-title">{{ t('subscription.featureComparison') }}</h2>
          <el-table :data="comparisonData" stripe class="comparison-table">
            <el-table-column prop="feature" :label="t('subscription.feature')" min-width="180" />
            <el-table-column prop="free" :label="t('subscription.free')" align="center" min-width="120" />
            <el-table-column prop="pro" :label="t('subscription.pro')" align="center" min-width="120" />
            <el-table-column prop="team" :label="t('subscription.team')" align="center" min-width="120" />
          </el-table>
        </div>

        <!-- FAQ -->
        <div class="faq-section">
          <h2 class="section-title">{{ t('subscription.faq') }}</h2>
          <el-collapse class="faq-collapse">
            <el-collapse-item v-for="(faq, i) in faqs" :key="i" :title="faq.question" :name="i">
              <p class="faq-answer">{{ faq.answer }}</p>
            </el-collapse-item>
          </el-collapse>
        </div>
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
  animation: fadeIn var(--duration-slow) var(--ease-out) both;
}

/* 区块标题 */
.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.section-header p {
  font-size: 14px;
  color: var(--text-secondary);
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
  background: var(--surface-card);
  border-radius: 16px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s ease;
  border: 1px solid var(--border-default);
}

.status-card:hover {
  box-shadow: var(--shadow-md);
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
  background: linear-gradient(135deg, var(--text-secondary), var(--text-tertiary));
  color: white;
}

.card-badge.pro {
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
  color: white;
}

.card-badge.team {
  background: linear-gradient(135deg, var(--color-success), var(--color-success));
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
  border-bottom: 1px solid var(--border-subtle);
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
  color: var(--text-secondary);
}

.status-row .value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.cancel-warning {
  margin-top: 8px;
}

.manage-btn {
  width: 100%;
  margin-top: 8px;
  background: var(--accent-purple);
  border-color: var(--accent-purple);
}

.manage-btn:hover {
  background: var(--accent-cyan);
  border-color: var(--accent-cyan);
}

/* 使用量卡片 */
.usage-card .card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--border-subtle);
}

.header-icon {
  font-size: 20px;
  color: var(--accent-purple);
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
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
  display: inline-flex;
  align-items: center;
  color: var(--accent-purple);
}

.usage-label {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.usage-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar {
  height: 8px;
  background: var(--border-default);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-purple), var(--color-success));
  border-radius: 4px;
  transition: width 0.3s ease;
}

.usage-text {
  font-size: 12px;
  color: var(--text-secondary);
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
  background: var(--surface-card);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-default);
}

.billing-toggle span {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.billing-toggle span.active {
  color: var(--accent-purple);
  font-weight: 600;
}

.ml-sm {
  margin-left: 8px;
}

/* 计划卡片网格 */
.plans-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.plan-card {
  position: relative;
  background: var(--surface-card);
  border: 2px solid var(--border-default);
  border-radius: 16px;
  padding: 32px 24px;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}

.plan-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}

.plan-card.popular {
  border-color: var(--accent-purple);
  background: color-mix(in srgb, var(--accent-purple) 6%, var(--surface-card));
}

.plan-card.current {
  border-color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 6%, var(--surface-card));
}

.popular-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
  color: white;
  padding: 6px 20px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent-purple) 40%, transparent);
}

.plan-header {
  text-align: center;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border-subtle);
  margin-bottom: 24px;
}

.plan-header h3 {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.price {
  margin-bottom: 8px;
}

.price .amount {
  font-size: 36px;
  font-weight: 800;
  color: var(--accent-purple);
}

.price .period {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.savings {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-success);
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
  color: var(--text-secondary);
  font-size: 14px;
}

.features li .check-icon {
  color: var(--color-success);
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
  background: var(--accent-purple);
  border-color: var(--accent-purple);
  color: white;
}

.subscribe-btn:hover {
  background: var(--accent-cyan);
  border-color: var(--accent-cyan);
  transform: translateY(-1px);
}

.popular-btn {
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
  border: none;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent-purple) 30%, transparent);
}

.popular-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--accent-purple) 40%, transparent);
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

.section-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
  margin-bottom: 24px;
}

.comparison-section {
  margin-top: 48px;
  padding: 0 24px;
}

.comparison-table {
  border-radius: 12px;
  overflow: hidden;
}

.faq-section {
  margin-top: 48px;
  padding: 0 24px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

.faq-collapse {
  border: none;
}

.faq-answer {
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}
</style>
