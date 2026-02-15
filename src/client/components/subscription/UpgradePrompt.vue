<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Check, Warning } from '@element-plus/icons-vue';

interface Props {
  visible: boolean;
  resourceType?: 'messages' | 'llm_tokens' | 'images' | 'api_calls';
  currentPlan?: 'free' | 'pro' | 'team';
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  resourceType: 'messages',
  currentPlan: 'free',
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  close: [];
}>();

const router = useRouter();
const { t } = useI18n();

const resourceLabels: Record<string, string> = {
  messages: t('subscription.resourceMessages'),
  llm_tokens: 'LLM Tokens',
  images: t('subscription.resourceImages'),
  api_calls: t('subscription.resourceApiCalls'),
};

const title = computed(() => {
  return t('subscription.quotaExhausted', { resource: resourceLabels[props.resourceType] });
});

const recommendedPlan = computed(() => {
  if (props.currentPlan === 'free') {
    return {
      name: t('subscription.pro'),
      price: '¥29',
      period: t('subscription.perMonth'),
      features: [
        t('subscription.proMessages'),
        t('subscription.proTokens'),
        t('subscription.proImages'),
        t('subscription.proPriority'),
        t('subscription.proModels'),
        t('subscription.proExport'),
      ],
    };
  }
  return {
    name: t('subscription.team'),
    price: '¥99',
    period: t('subscription.perMonth'),
    features: [
      t('subscription.teamMessages'),
      t('subscription.teamTokens'),
      t('subscription.teamImages'),
      t('subscription.teamCollaboration'),
      t('subscription.teamCustomCharacters'),
      t('subscription.teamApiAccess'),
      t('subscription.teamSupport'),
    ],
  };
});

function handleClose() {
  emit('update:visible', false);
  emit('close');
}

function handleUpgrade() {
  handleClose();
  router.push({ name: 'Subscription' });
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="500px"
    @close="handleClose"
  >
    <div class="upgrade-prompt">
      <div class="prompt-icon">
        <el-icon :size="48" color="var(--el-color-warning)">
          <Warning />
        </el-icon>
      </div>

      <p class="prompt-message">
        {{ $t('subscription.quotaReached', { resource: resourceLabels[resourceType] }) }}
        {{ $t('subscription.upgradeToUnlock') }}
      </p>

      <el-divider />

      <div class="recommended-plan">
        <div class="plan-badge">{{ $t('subscription.recommended') }}</div>
        <div class="plan-header">
          <h3>{{ recommendedPlan.name }}</h3>
          <div class="plan-price">
            <span class="amount">{{ recommendedPlan.price }}</span>
            <span class="period">{{ recommendedPlan.period }}</span>
          </div>
        </div>

        <ul class="plan-features">
          <li v-for="(feature, index) in recommendedPlan.features" :key="index">
            <el-icon color="var(--el-color-success)"><Check /></el-icon>
            <span>{{ feature }}</span>
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">{{ $t('common.later') }}</el-button>
        <el-button type="primary" @click="handleUpgrade">
          {{ $t('common.upgradeNow') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.upgrade-prompt {
  text-align: center;
}

.prompt-icon {
  margin-bottom: 16px;
}

.prompt-message {
  font-size: 15px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  margin: 0 0 20px 0;
}

.recommended-plan {
  position: relative;
  padding: 24px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  text-align: left;
}

.plan-badge {
  position: absolute;
  top: -10px;
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
  margin-bottom: 16px;
}

.plan-header h3 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.plan-price .amount {
  font-size: 28px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.plan-price .period {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.plan-features {
  list-style: none;
  padding: 0;
  margin: 0;
}

.plan-features li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
