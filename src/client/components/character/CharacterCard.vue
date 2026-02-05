<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ChatDotRound, Star } from '@element-plus/icons-vue';
import LazyImage from '../ui/LazyImage.vue';
import type { Character } from '@client/types';

const props = defineProps<{
  character: Character;
}>();

const router = useRouter();

const avatarUrl = computed(() =>
  props.character.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${props.character.id}`
);

const ratingDisplay = computed(() =>
  props.character.rating ? props.character.rating.toFixed(1) : 'N/A'
);

function handleStartChat() {
  router.push({ name: 'Chat', query: { characterId: props.character.id } });
}
</script>

<template>
  <el-card class="character-card" shadow="hover">
    <div class="card-content">
      <div class="avatar-section">
        <LazyImage
          :src="avatarUrl"
          :alt="character.name"
          width="80"
          height="80"
          object-fit="cover"
        />
      </div>

      <div class="info-section">
        <h3 class="character-name">{{ character.name }}</h3>
        <p class="character-description">
          {{ character.description || '暂无描述' }}
        </p>

        <div v-if="character.tags && character.tags.length" class="tags">
          <el-tag
            v-for="tag in character.tags.slice(0, 3)"
            :key="tag"
            size="small"
            type="info"
          >
            {{ tag }}
          </el-tag>
        </div>

        <div class="card-footer">
          <div class="rating">
            <el-icon><Star /></el-icon>
            <span>{{ ratingDisplay }}</span>
            <span v-if="character.ratingCount" class="rating-count">
              ({{ character.ratingCount }})
            </span>
          </div>

          <el-button
            type="primary"
            size="small"
            :icon="ChatDotRound"
            @click.stop="handleStartChat"
          >
            开始聊天
          </el-button>
        </div>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.character-card {
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 16px;
  border: 1px solid #E5E7EB;
  background: white;
}

.character-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.15);
  border-color: #3B82F6;
}

.character-card :deep(.el-card__body) {
  padding: 20px;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.avatar-section {
  display: flex;
  justify-content: center;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.character-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #111827;
}

.character-description {
  font-size: 14px;
  color: #6B7280;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 40px;
  line-height: 1.5;
}

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tags :deep(.el-tag) {
  background: #EFF6FF;
  color: #3B82F6;
  border-color: #DBEAFE;
  font-size: 12px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid #F3F4F6;
}

.rating {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #6B7280;
}

.rating .el-icon {
  color: #FBBF24;
  font-size: 16px;
}

.rating-count {
  font-size: 12px;
  color: #9CA3AF;
}

.card-footer :deep(.el-button) {
  background: #3B82F6;
  border-color: #3B82F6;
  font-size: 13px;
  padding: 6px 16px;
}

.card-footer :deep(.el-button:hover) {
  background: #2563EB;
  border-color: #2563EB;
}

.card-footer :deep(.el-button:active) {
  background: #1D4ED8;
  border-color: #1D4ED8;
}
</style>
