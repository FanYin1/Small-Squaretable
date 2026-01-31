<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ChatDotRound, Star } from '@element-plus/icons-vue';
import { useCharacterStore } from '@client/stores';

const props = defineProps<{
  visible: boolean;
  characterId: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const router = useRouter();
const characterStore = useCharacterStore();

const character = computed(() => characterStore.currentCharacter);

const avatarUrl = computed(() =>
  character.value?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${props.characterId}`
);

const ratingDisplay = computed(() =>
  character.value?.rating ? character.value.rating.toFixed(1) : 'N/A'
);

function handleStartChat() {
  if (character.value) {
    router.push(`/chat?characterId=${character.value.id}`);
    emit('close');
  }
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    title="角色详情"
    size="500px"
    @close="handleClose"
  >
    <div v-if="character" class="detail-content">
      <div class="detail-header">
        <el-avatar :size="120" :src="avatarUrl" />
        <h2>{{ character.name }}</h2>

        <div class="rating-section">
          <el-icon><Star /></el-icon>
          <span class="rating-value">{{ ratingDisplay }}</span>
          <span v-if="character.ratingCount" class="rating-count">
            ({{ character.ratingCount }} 评分)
          </span>
        </div>
      </div>

      <el-divider />

      <div class="detail-section">
        <h3>描述</h3>
        <p>{{ character.description || '暂无描述' }}</p>
      </div>

      <div v-if="character.tags && character.tags.length" class="detail-section">
        <h3>标签</h3>
        <div class="tags">
          <el-tag
            v-for="tag in character.tags"
            :key="tag"
            type="info"
          >
            {{ tag }}
          </el-tag>
        </div>
      </div>

      <div class="detail-section">
        <h3>创建时间</h3>
        <p>{{ new Date(character.createdAt).toLocaleDateString('zh-CN') }}</p>
      </div>

      <div class="action-section">
        <el-button
          type="primary"
          size="large"
          :icon="ChatDotRound"
          @click="handleStartChat"
        >
          开始聊天
        </el-button>
      </div>
    </div>

    <div v-else v-loading="characterStore.loading" class="loading-container" />
  </el-drawer>
</template>

<style scoped>
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.detail-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.rating-section {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
}

.rating-value {
  font-weight: 600;
}

.rating-count {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.detail-section h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px 0;
}

.detail-section p {
  margin: 0;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-section {
  margin-top: 16px;
}

.action-section .el-button {
  width: 100%;
}

.loading-container {
  min-height: 400px;
}
</style>
