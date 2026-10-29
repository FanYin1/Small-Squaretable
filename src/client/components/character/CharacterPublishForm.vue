<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useFeatureGate } from '@client/composables/useFeatureGate';
import { api } from '@client/services/api';
import { userApi } from '@client/services/user.api';
import type { Character } from '@client/types';
import { storyIntroduction, openingDisplayText } from '../../../types/story-opening';
import PresentationSource from './PresentationSource.vue';

const props = defineProps<{
  character: Character;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
  success: [];
}>();

const { t } = useI18n();
const { hasFeature, getUpgradeMessage, featureError, retryFeatures } = useFeatureGate();

// Check if user has character_share feature
const canPublish = computed(() => hasFeature('character_share'));

// Form state
function initialForm() {
  const introduction = storyIntroduction(props.character.description, props.character.cardData ?? {}, props.character.presentation);
  return {
  name: props.character.name,
  description: props.character.description || (props.character.presentation && introduction.source === 'opening' ? introduction.text : ''),
  category: props.character.category || '',
  tags: [...(props.character.tags || [])],
  isNsfw: props.character.isNsfw || false,
  };
}
const formData = ref(initialForm());

const publishing = ref(false);
const savedBeforePublish = ref(false);
const publicIntroduction = computed(() => openingDisplayText(formData.value.description));
watch(() => [props.character.id, props.visible], () => {
  formData.value = initialForm();
  savedBeforePublish.value = false;
});

// 平台是否允许发布 NSFW 卡（NSFW_ENABLED）。读不到时按「不允许」处理：
// 宁可在本地多拦一次，也不要让作者撞到服务端的 400
const platformAllowsNsfw = ref(false);

onMounted(async () => {
  try {
    const prefs = await userApi.getPreferences();
    platformAllowsNsfw.value = prefs.nsfwEnabled === true;
  } catch {
    platformAllowsNsfw.value = false;
  }
});

// Predefined tags
const availableTags = [
  'Fantasy',
  'Sci-Fi',
  'Anime',
  'Game',
  'Historical',
  'Modern',
  'Romance',
  'Adventure',
  'Horror',
  'Comedy',
  'Drama',
  'Action',
];

// Categories
const categories = [
  { value: 'assistant', labelKey: 'market.filters.assistant' },
  { value: 'entertainment', labelKey: 'market.filters.entertainment' },
  { value: 'education', labelKey: 'market.filters.education' },
  { value: 'game', labelKey: 'market.filters.game' },
  { value: 'historical', labelKey: 'market.filters.historical' },
  { value: 'modern', labelKey: 'market.filters.modern' },
];

async function handlePublish() {
  if (publishing.value) return;
  if (!canPublish.value) {
    ElMessage.warning(getUpgradeMessage('character_share'));
    return;
  }

  // Validate form
  if (!formData.value.name.trim()) {
    ElMessage.warning(t('characterPublish.nameRequired'));
    return;
  }

  if (!formData.value.category) {
    ElMessage.warning(t('characterPublish.categoryRequired'));
    return;
  }

  if (formData.value.tags.length === 0) {
    ElMessage.warning(t('characterPublish.tagsRequired'));
    return;
  }

  // 平台关闭 NSFW 时，服务端会直接拒绝 isNsfw=true 的发布。在提交前拦住，
  // 而不是先 PATCH 把 category/tags 写进去再撞 400——那样表单失败了、
  // 角色数据却已经被改过。平台开启时允许发布：卡带 NSFW 标记，
  // 只对打开了偏好的用户可见
  if (formData.value.isNsfw && !platformAllowsNsfw.value) {
    ElMessage.warning(t('characterPublish.nsfwBlocked'));
    return;
  }

  publishing.value = true;
  const targetId = props.character.id;
  const payload = { ...formData.value, tags: [...formData.value.tags] };
  try {
    // Update character with form data
    await api.patch(`/characters/${targetId}`, payload);
    if (props.character.id !== targetId || !props.visible) return;
    savedBeforePublish.value = true;

    // Publish character
    const result = await api.post<{ moderationStatus?: string }>(`/characters/${targetId}/publish`);
    if (props.character.id !== targetId || !props.visible) return;

    ElMessage.success(t(result.moderationStatus === 'approved' ? 'characterPublish.success' : result.moderationStatus === 'hidden' ? 'characterPublish.hidden' : 'characterPublish.submitted'));
    emit('success');
    emit('close');
  } catch (error: any) {
    if (error.response?.status === 403) {
      ElMessage.error(getUpgradeMessage('character_share'));
    } else {
      ElMessage.error(error.message || t('characterPublish.error'));
    }
  } finally {
    publishing.value = false;
  }
}

function handleClose() {
  if (publishing.value) return;
  emit('close');
}
</script>

<template>
  <el-dialog
    class="story-publish-dialog"
    :model-value="visible"
    :title="$t('characterPublish.dialogTitle')"
    width="min(600px, 94vw)"
    :show-close="!publishing"
    :close-on-click-modal="!publishing"
    :close-on-press-escape="!publishing"
    @close="handleClose"
  >
    <p role="status" data-testid="publish-state">{{ savedBeforePublish ? $t('characterPublish.savedBeforePublish') : $t('characterPublish.visibilityHint') }}</p>
    <p v-if="featureError" role="alert">{{ $t('subscription.statusLoadFailed') }} <el-button @click="retryFeatures">{{ $t('credits.refresh') }}</el-button></p>
    <!-- Upgrade prompt for free users -->
    <el-alert
      v-if="!canPublish && !featureError"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 20px"
    >
      <template #title>
        {{ $t('characterPublish.upgradeRequired') }}
      </template>
      <p>{{ getUpgradeMessage('character_share') }}</p>
      <el-button type="primary" size="small" @click="$router.push({ name: 'Subscription' })">
        {{ $t('characterPublish.upgradeNow') }}
      </el-button>
    </el-alert>

    <el-form
      :model="formData"
      label-width="100px"
      :disabled="publishing"
    >
      <el-form-item :label="$t('characterPublish.nameLabel')" required>
        <el-input
          v-model="formData.name"
          :placeholder="$t('characterPublish.namePlaceholder')"
          maxlength="255"
          show-word-limit
        />
      </el-form-item>

      <el-form-item :label="$t('characterPublish.descLabel')">
        <el-input
          v-model="formData.description"
          type="textarea"
          :rows="4"
          :placeholder="$t('characterPublish.descPlaceholder')"
          maxlength="1000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item :label="$t('characterPublish.categoryLabel')" required>
        <el-select
          v-model="formData.category"
          :placeholder="$t('characterPublish.categoryPlaceholder')"
          style="width: 100%"
        >
          <el-option
            v-for="cat in categories"
            :key="cat.value"
            :label="$t(cat.labelKey)"
            :value="cat.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="$t('characterPublish.tagsLabel')" required>
        <el-select
          v-model="formData.tags"
          multiple
          :placeholder="$t('characterPublish.tagsPlaceholder')"
          style="width: 100%"
        >
          <el-option
            v-for="tag in availableTags"
            :key="tag"
            :label="tag"
            :value="tag"
          />
        </el-select>
      </el-form-item>

      <section class="public-preview" aria-label="公开入口预览" data-testid="publish-preview">
        <p class="preview-label">公开入口预览</p>
        <h3>{{ formData.name }}</h3>
        <p class="preview-introduction">{{ publicIntroduction || '尚未填写公开介绍' }}</p>
        <PresentationSource v-if="character.presentation && formData.description === character.presentation.draft.text" :presentation="character.presentation" />
        <p>{{ canPublish ? '提交即确认使用上方名称与介绍申请发布。原卡设定与已有故事保持各自版本。' : '仅在本机预览名称与介绍，不会保存或发布。当前账户暂不能提交发布，原卡与已有故事不变。' }}</p>
      </section>

      <el-form-item label="NSFW">
        <el-switch v-model="formData.isNsfw" />
        <span style="margin-left: 12px; font-size: 12px; color: var(--el-text-color-secondary)">
          {{ platformAllowsNsfw ? $t('characterPublish.nsfwAllowed') : $t('characterPublish.nsfwBlocked') }}
        </span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button :disabled="publishing" @click="handleClose">{{ $t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="publishing"
        :disabled="!canPublish"
        @click="handlePublish"
      >
        {{ $t('characterPublish.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.el-alert p {
  margin: 8px 0;
}
.public-preview { margin:16px 0; padding:20px; border:1px solid var(--border-default); border-radius:8px; background:var(--bg-surface); color:var(--text-primary); overflow-wrap:anywhere; }
.public-preview h3 { font:500 24px var(--font-display); margin:10px 0; }
.preview-label { color:var(--accent-text); font-size:12px; letter-spacing:.08em; }
.preview-introduction { font-family:var(--font-reading); line-height:1.9; white-space:pre-wrap; }
.public-preview > p:last-child { font-size:12px; color:var(--text-secondary); line-height:1.8; }
</style>

<style>
@media (max-width: 767px) {
  .el-dialog.story-publish-dialog { margin: 4dvh auto; max-height: 92dvh; display: flex; flex-direction: column; }
  .story-publish-dialog .el-dialog__header, .story-publish-dialog .el-dialog__footer { flex-shrink: 0; }
  .story-publish-dialog .el-dialog__body { min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; }
  .story-publish-dialog .el-dialog__footer { display: flex; gap: 12px; }
  .story-publish-dialog .el-dialog__footer .el-button { flex: 1; min-height: 44px; margin: 0; }
}
</style>
