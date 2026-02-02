<script setup lang="ts">
import { ref, computed } from 'vue';
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
  'Fantasy',
  'Sci-Fi',
  'Anime',
  'Game',
  'Historical',
  'Modern',
];

async function handlePublish() {
  if (!canPublish.value) {
    ElMessage.warning(getUpgradeMessage('character_share'));
    return;
  }

  // Validate form
  if (!formData.value.name.trim()) {
    ElMessage.warning('请输入角色名称');
    return;
  }

  if (!formData.value.category) {
    ElMessage.warning('请选择分类');
    return;
  }

  if (formData.value.tags.length === 0) {
    ElMessage.warning('请至少选择一个标签');
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

    ElMessage.success('角色已发布到市场');
    emit('success');
    emit('close');
  } catch (error: any) {
    if (error.response?.status === 403) {
      ElMessage.error(getUpgradeMessage('character_share'));
    } else {
      ElMessage.error(error.message || '发布失败');
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
    title="发布角色到市场"
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
        需要升级到 Pro 或 Team 套餐
      </template>
      <p>{{ getUpgradeMessage('character_share') }}</p>
      <el-button type="primary" size="small" @click="$router.push('/subscription')">
        立即升级
      </el-button>
    </el-alert>

    <el-form
      :model="formData"
      label-width="100px"
      :disabled="!canPublish"
    >
      <el-form-item label="角色名称" required>
        <el-input
          v-model="formData.name"
          placeholder="输入角色名称"
          maxlength="255"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="描述">
        <el-input
          v-model="formData.description"
          type="textarea"
          :rows="4"
          placeholder="输入角色描述"
          maxlength="1000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="分类" required>
        <el-select
          v-model="formData.category"
          placeholder="选择分类"
          style="width: 100%"
        >
          <el-option
            v-for="cat in categories"
            :key="cat"
            :label="cat"
            :value="cat"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="标签" required>
        <el-select
          v-model="formData.tags"
          multiple
          placeholder="选择标签"
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
          标记为 NSFW 的角色将被过滤显示
        </span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button
        type="primary"
        :loading="publishing"
        :disabled="!canPublish"
        @click="handlePublish"
      >
        发布
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.el-alert p {
  margin: 8px 0;
}
</style>
