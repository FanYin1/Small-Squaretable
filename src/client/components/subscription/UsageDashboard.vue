<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useUsageStore } from '@client/stores/usage';
import { useSubscriptionStore } from '@client/stores/subscription';
import { useRouter } from 'vue-router';
import { Warning } from '@element-plus/icons-vue';

const usageStore = useUsageStore();
const subscriptionStore = useSubscriptionStore();
const router = useRouter();

const quotaItems = computed(() => [
  {
    label: '消息数量',
    key: 'messages',
    quota: usageStore.messagesQuota,
    icon: '💬',
  },
  {
    label: 'LLM Tokens',
    key: 'llm_tokens',
    quota: usageStore.tokensQuota,
    icon: '🤖',
  },
  {
    label: '图片生成',
    key: 'images',
    quota: usageStore.imagesQuota,
    icon: '🖼️',
  },
  {
    label: 'API 调用',
    key: 'api_calls',
    quota: usageStore.apiCallsQuota,
    icon: '🔌',
  },
]);

const resetDate = computed(() => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

onMounted(async () => {
  await usageStore.fetchQuota();
});

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function handleUpgrade() {
  router.push({ name: 'Subscription' });
}
</script>

<template>
  <el-card class="usage-dashboard">
    <template #header>
      <div class="card-header">
        <span class="title">使用量统计</span>
        <el-tag v-if="usageStore.hasWarning" type="warning" size="small">
          <el-icon><Warning /></el-icon>
          接近限制
        </el-tag>
        <el-tag v-else-if="usageStore.hasExceeded" type="danger" size="small">
          <el-icon><Warning /></el-icon>
          已超限
        </el-tag>
      </div>
    </template>

    <div v-loading="usageStore.loading" class="usage-content">
      <el-alert
        v-if="usageStore.hasExceeded"
        type="error"
        :closable="false"
        show-icon
        class="quota-alert"
      >
        <template #title>
          您已达到配额限制
        </template>
        <template #default>
          升级到更高级别的方案以继续使用服务
          <el-button type="primary" size="small" @click="handleUpgrade" style="margin-left: 12px;">
            立即升级
          </el-button>
        </template>
      </el-alert>

      <el-alert
        v-else-if="usageStore.hasWarning"
        type="warning"
        :closable="false"
        show-icon
        class="quota-alert"
      >
        <template #title>
          配额即将用尽
        </template>
        <template #default>
          您的某些配额使用量已超过 80%，建议升级方案
        </template>
      </el-alert>

      <div class="quota-list">
        <div
          v-for="item in quotaItems"
          :key="item.key"
          class="quota-item"
        >
          <div class="quota-header">
            <span class="quota-icon">{{ item.icon }}</span>
            <span class="quota-label">{{ item.label }}</span>
            <span class="quota-value">
              {{ formatNumber(item.quota?.currentUsage || 0) }} / {{ formatNumber(item.quota?.limit || 0) }}
            </span>
          </div>
          <el-progress
            :percentage="usageStore.getQuotaPercentage(item.quota)"
            :status="usageStore.getQuotaStatus(item.quota)"
            :stroke-width="12"
          />
          <div class="quota-footer">
            <span class="remaining">
              剩余: {{ formatNumber(item.quota?.remaining || 0) }}
            </span>
          </div>
        </div>
      </div>

      <div class="reset-info">
        <el-icon><Warning /></el-icon>
        <span>配额将在 {{ resetDate }} 重置</span>
      </div>

      <div v-if="subscriptionStore.currentPlan === 'free'" class="upgrade-cta">
        <p>升级到专业版或团队版，享受更高配额</p>
        <el-button type="primary" @click="handleUpgrade">
          查看订阅方案
        </el-button>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.usage-dashboard {
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-header .title {
  font-size: 16px;
  font-weight: 600;
}

.usage-content {
  min-height: 200px;
}

.quota-alert {
  margin-bottom: 20px;
}

.quota-list {
  display: grid;
  gap: 24px;
}

.quota-item {
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  transition: all 0.2s;
}

.quota-item:hover {
  background: var(--el-fill-color);
}

.quota-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.quota-icon {
  font-size: 20px;
}

.quota-label {
  flex: 1;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.quota-value {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.quota-footer {
  margin-top: 8px;
  text-align: right;
}

.quota-footer .remaining {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.reset-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding: 12px;
  background: var(--el-color-info-light-9);
  border-radius: 6px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.upgrade-cta {
  margin-top: 20px;
  padding: 20px;
  text-align: center;
  background: linear-gradient(135deg, var(--el-color-primary-light-9), var(--el-color-primary-light-8));
  border-radius: 8px;
}

.upgrade-cta p {
  margin: 0 0 12px 0;
  color: var(--el-text-color-primary);
  font-weight: 500;
}
</style>
