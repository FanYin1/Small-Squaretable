<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useFeatureGate } from '@client/composables/useFeatureGate';
import { api } from '@client/services/api';
import type { Character } from '@client/types';

const props = defineProps<{
  character: Character;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
  success: [];
}>();

const { t } = useI18n();
const { hasFeature, getUpgradeMessage } = useFeatureGate();

// Check if user has character_share feature
const canPublish = computed(() => hasFeature('character_share'));

// Form state
const formData = ref({
  name: props.character.name,
  description: props.character.description || '',
  category: props.character.category || '',
  tags: props.character.tags || [],
  isNsfw: props.character.isNsfw || false,
});

const publishing = ref(false);

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

  publishing.value = true;
  try {
    // Update character with form data
    await api.patch(`/characters/${props.character.id}`, {
      name: formData.value.name,
      description: formData.value.description,
      category: formData.value.category,
      tags: formData.value.tags,
      isNsfw: formData.value.isNsfw,
    });

    // Publish character
    await api.post(`/characters/${props.character.id}/publish`);

    ElMessage.success(t('characterPublish.success'));
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
  emit('close');
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="$t('characterPublish.dialogTitle')"
    width="600px"
    @close="handleClose"
  >
    <!-- Upgrade prompt for free users -->
    <el-alert
      v-if="!canPublish"
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
      :disabled="!canPublish"
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

      <el-form-item label="NSFW">
        <el-switch v-model="formData.isNsfw" />
        <span style="margin-left: 12px; font-size: 12px; color: var(--el-text-color-secondary)">
          {{ $t('characterPublish.nsfwHint') }}
        </span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">{{ $t('common.cancel') }}</el-button>
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
</style>
