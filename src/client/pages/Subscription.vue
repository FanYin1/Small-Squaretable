<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Check, CreditCard } from '@element-plus/icons-vue';
import { useSubscriptionStore } from '@client/stores/subscription';

const route = useRoute();
const subscriptionStore = useSubscriptionStore();

const plans = computed(() => [
  {
    id: 'free',
    name: '免费版',
    price: '¥0',
    period: '/月',
    features: ['基础对话功能', '每日 10 次对话', '标准响应速度'],
    priceId: null,
  },
  {
    id: 'pro',
    name: '专业版',
    price: '¥29',
    period: '/月',
    features: ['无限对话', '优先响应速度', '高级角色访问', '历史记录导出'],
    priceId: subscriptionStore.config?.prices.proMonthly,
    popular: true,
  },
  {
    id: 'team',
    name: '团队版',
    price: '¥99',
    period: '/月',
    features: ['包含专业版所有功能', '团队协作', '自定义角色', 'API 访问', '优先客服支持'],
    priceId: subscriptionStore.config?.prices.teamMonthly,
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

onMounted(async () => {
  await Promise.all([
    subscriptionStore.fetchStatus(),
    subscriptionStore.fetchConfig(),
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
</script>

<template>
  <div class="subscription-container">
    <div class="subscription-header">
      <h1>订阅管理</h1>
      <p>选择适合您的方案，解锁更多功能</p>
    </div>

    <el-card v-if="subscriptionStore.subscription" class="current-plan-card">
      <div class="current-plan">
        <div class="plan-info">
          <span class="label">当前方案</span>
          <span class="plan-name">{{ subscriptionStore.currentPlan === 'free' ? '免费版' : subscriptionStore.currentPlan === 'pro' ? '专业版' : '团队版' }}</span>
          <el-tag :type="statusType" size="small">{{ statusText }}</el-tag>
        </div>
        <el-button
          v-if="subscriptionStore.isPro"
          type="primary"
          :icon="CreditCard"
          @click="handleManage"
          :loading="subscriptionStore.loading"
        >
          管理订阅
        </el-button>
      </div>
      <div v-if="subscriptionStore.subscription.cancelAtPeriodEnd" class="cancel-notice">
        <el-alert type="warning" :closable="false" show-icon>
          您的订阅将在当前周期结束后取消
        </el-alert>
      </div>
    </el-card>

    <div class="plans-grid">
      <el-card
        v-for="plan in plans"
        :key="plan.id"
        :class="['plan-card', { popular: plan.popular, current: subscriptionStore.currentPlan === plan.id }]"
      >
        <div v-if="plan.popular" class="popular-badge">最受欢迎</div>
        <div class="plan-header">
          <h3>{{ plan.name }}</h3>
          <div class="price">
            <span class="amount">{{ plan.price }}</span>
            <span class="period">{{ plan.period }}</span>
          </div>
        </div>
        <ul class="features">
          <li v-for="feature in plan.features" :key="feature">
            <el-icon><Check /></el-icon>
            <span>{{ feature }}</span>
          </li>
        </ul>
        <el-button
          v-if="plan.priceId && subscriptionStore.currentPlan !== plan.id"
          type="primary"
          :class="{ 'popular-btn': plan.popular }"
          @click="handleSubscribe(plan.priceId)"
          :loading="subscriptionStore.loading"
        >
          {{ subscriptionStore.currentPlan === 'free' ? '立即订阅' : '升级方案' }}
        </el-button>
        <el-button v-else-if="subscriptionStore.currentPlan === plan.id" disabled>
          当前方案
        </el-button>
        <el-button v-else disabled>
          免费使用
        </el-button>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.subscription-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
}

.subscription-header {
  text-align: center;
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
}

.current-plan-card {
  margin-bottom: 32px;
}

.current-plan {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.plan-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.plan-info .label {
  color: var(--el-text-color-secondary);
}

.plan-info .plan-name {
  font-size: 18px;
  font-weight: 600;
}

.cancel-notice {
  margin-top: 16px;
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.plan-card {
  position: relative;
  transition: transform 0.2s, box-shadow 0.2s;
}

.plan-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--el-box-shadow-light);
}

.plan-card.popular {
  border: 2px solid var(--el-color-primary);
}

.plan-card.current {
  background: var(--el-fill-color-light);
}

.popular-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--el-color-primary);
  color: white;
  padding: 4px 16px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.plan-header {
  text-align: center;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 20px;
}

.plan-header h3 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 12px;
}

.price .amount {
  font-size: 36px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.price .period {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.features {
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
}

.features li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  color: var(--el-text-color-regular);
}

.features li .el-icon {
  color: var(--el-color-success);
}

.plan-card :deep(.el-button) {
  width: 100%;
}

.popular-btn {
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
}
</style>
