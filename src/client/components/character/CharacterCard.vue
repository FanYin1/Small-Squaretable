<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ChatDotRound, Star } from '@element-plus/icons-vue';
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
  router.push(`/chat?characterId=${props.character.id}`);
}
</script>

<template>
  <el-card class="character-card" shadow="hover">
    <div class="card-content">
      <div class="avatar-section">
        <el-avatar :size="80" :src="avatarUrl" />
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
  transition: transform 0.2s;
}

.character-card:hover {
  transform: translateY(-4px);
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
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-description {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 40px;
}

.tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.rating {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.rating-count {
  font-size: 12px;
}
</style>
