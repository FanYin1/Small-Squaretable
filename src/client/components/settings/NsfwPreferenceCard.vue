<script setup lang="ts">
/**
 * "显示 NSFW 内容"偏好卡片（P2-6）
 *
 * - 平台开关关闭（nsfwEnabled=false）时整张卡片不渲染，用户看不到这个概念。
 * - 偏好默认关。未确认年龄的用户不能打开：开关禁用并说明原因。
 *   目前没有给存量用户补确认年龄的入口（年龄声明只在注册时收集），
 *   所以这里只能提示，不能引导到一个确认动作。
 * - 服务端是最终裁判：即使开关被绕过，打开时仍会返回 403
 *   （AGE_CONFIRMATION_REQUIRED / NSFW_DISABLED），这里把它翻成可读提示。
 */
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { View } from '@element-plus/icons-vue';
import { userApi, type NsfwPreferenceState } from '@client/services/user.api';
import { ApiError } from '@client/services/api';
import { useToast } from '@client/composables/useToast';

const { t } = useI18n();
const toast = useToast();

const state = ref<NsfwPreferenceState | null>(null);
const saving = ref(false);

onMounted(async () => {
  try {
    state.value = await userApi.getPreferences();
  } catch {
    // 读不到就不展示卡片，不影响设置页其余部分
    state.value = null;
  }
});

async function onChange(value: boolean | string | number) {
  if (!state.value) return;
  const next = value === true;
  saving.value = true;
  try {
    state.value = await userApi.updatePreferences({ showNsfw: next });
    toast.success(t('accountSettings.nsfwSaved'));
  } catch (error) {
    const code = error instanceof ApiError ? error.code : '';
    if (code === 'AGE_CONFIRMATION_REQUIRED') {
      toast.warning(t('accountSettings.nsfwAgeRequired'));
    } else if (code === 'NSFW_DISABLED') {
      toast.warning(t('accountSettings.nsfwPlatformOff'));
    } else {
      toast.error(t('accountSettings.nsfwSaveFailed'));
    }
    // 开关保持服务端的真实状态（v-model 已被我们换成只读绑定，不会停在错误位置）
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-card v-if="state && state.nsfwEnabled" class="settings-card nsfw-preference-card" shadow="never">
    <template #header>
      <div class="card-header">
        <el-icon :size="20"><View /></el-icon>
        <span>{{ t('accountSettings.nsfwTitle') }}</span>
      </div>
    </template>
    <p class="card-description">{{ t('accountSettings.nsfwDescription') }}</p>
    <div class="nsfw-row">
      <span id="nsfw-pref-label">{{ t('accountSettings.nsfwLabel') }}</span>
      <el-switch
        :model-value="state.showNsfw"
        :disabled="saving || (!state.ageConfirmed && !state.showNsfw)"
        aria-labelledby="nsfw-pref-label"
        @change="onChange"
      />
    </div>
    <p v-if="!state.ageConfirmed" class="nsfw-hint" role="status">
      {{ t('accountSettings.nsfwAgeRequired') }}
    </p>
  </el-card>
</template>

<style scoped>
/* 与 AccountSettings 里其它卡片保持一致（父页面的 scoped 样式不会作用到子组件内容） */
.settings-card {
  border: 1px solid var(--border-default);
  border-radius: 12px;
}

.settings-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
}

.settings-card :deep(.el-card__body) {
  padding: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-description {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0 0 16px 0;
  line-height: 1.6;
}

.nsfw-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nsfw-hint {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
