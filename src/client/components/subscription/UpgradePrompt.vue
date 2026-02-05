<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
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

const resourceLabels: Record<string, string> = {
  messages: '消息数量',
  llm_tokens: 'LLM Tokens',
  images: '图片生成',
  api_calls: 'API 调用',
};

const title = computed(() => {
  return `${resourceLabels[props.resourceType]} 配额已用尽`;
});

const recommendedPlan = computed(() => {
  if (props.currentPlan === 'free') {
    return {
      name: '专业版',
      price: '¥29',
      period: '/月',
      features: [
        '10,000 条消息/月',
        '1,000,000 LLM Tokens/月',
        '500 张图片/月',
        '优先响应速度',
        '高级模型访问',
        '历史记录导出',
      ],
    };
  }
  return {
    name: '团队版',
    price: '¥99',
    period: '/月',
    features: [
      '100,000 条消息/月',
      '10,000,000 LLM Tokens/月',
      '5,000 张图片/月',
      '团队协作功能',
      '自定义角色',
      'API 访问',
      '优先客服支持',
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
        您当前的 {{ resourceLabels[resourceType] }} 配额已达到上限。
        升级到更高级别的方案以继续使用服务。
      </p>

      <el-divider />

      <div class="recommended-plan">
        <div class="plan-badge">推荐方案</div>
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
        <el-button @click="handleClose">稍后再说</el-button>
        <el-button type="primary" @click="handleUpgrade">
          立即升级
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
