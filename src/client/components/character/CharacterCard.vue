<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChatDotRound, Star } from '@element-plus/icons-vue';
import LazyImage from '../ui/LazyImage.vue';
import type { Character } from '@client/types';

const props = defineProps<{
  character: Character;
}>();

const router = useRouter();
const { t } = useI18n();

const cardRef = ref<HTMLElement>();

function handleMouseMove(e: MouseEvent) {
  if (!cardRef.value) return;
  const rect = cardRef.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  cardRef.value.style.setProperty('--mouse-x', `${x}px`);
  cardRef.value.style.setProperty('--mouse-y', `${y}px`);
}

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
  <div
    ref="cardRef"
    class="character-card-wrapper"
    @mousemove="handleMouseMove"
  >
  <el-card
    class="character-card"
    shadow="hover"
    role="article"
    tabindex="0"
    :aria-label="character.name"
    @keydown.enter="handleStartChat"
  >
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
          {{ character.description || $t('market.noDescription') }}
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
            {{ $t('market.startChat') }}
          </el-button>
        </div>
      </div>
    </div>
  </el-card>
  </div>
</template>

<style scoped>
.character-card-wrapper {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-xl);
}

.character-card-wrapper::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(
    300px circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    color-mix(in srgb, var(--accent-purple) 10%, transparent),
    transparent
  );
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
  z-index: 1;
}

.character-card-wrapper:hover::before {
  opacity: 1;
}

.character-card {
  cursor: pointer;
  transition: all var(--duration-slow) var(--ease-out);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-subtle);
  background: var(--surface-card);
}

.character-card:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow: 0 8px 32px color-mix(in srgb, var(--accent-purple) 12%, transparent);
  border-color: var(--accent-purple);
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
  color: var(--text-primary);
}

.character-description {
  font-size: 14px;
  color: var(--text-secondary);
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
  background: color-mix(in srgb, var(--accent-purple) 8%, transparent);
  color: var(--accent-purple);
  border-color: color-mix(in srgb, var(--accent-purple) 15%, transparent);
  font-size: 12px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--bg-surface);
}

.rating {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--text-secondary);
}

.rating .el-icon {
  color: var(--color-warning);
  font-size: 16px;
}

.rating-count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.card-footer :deep(.el-button) {
  background: var(--accent-purple);
  border-color: var(--accent-purple);
  font-size: 13px;
  padding: 6px 16px;
}

.card-footer :deep(.el-button:hover) {
  background: var(--accent-purple);
  border-color: var(--accent-purple);
  opacity: 0.85;
}

.card-footer :deep(.el-button:active) {
  background: var(--accent-purple);
  border-color: var(--accent-purple);
  opacity: 0.75;
}

/* Mobile breakpoint */
@media (max-width: 480px) {
  .character-card :deep(.el-card__body) {
    padding: 15px;
  }

  .card-content {
    gap: 12px;
  }

  .avatar-section :deep(img) {
    width: 64px;
    height: 64px;
  }

  .character-name {
    font-size: 14px;
  }

  .character-description {
    font-size: 12px;
    min-height: 34px;
  }

  .tags :deep(.el-tag) {
    font-size: 11px;
  }

  .rating {
    font-size: 12px;
  }

  .rating .el-icon {
    font-size: 14px;
  }

  .card-footer {
    padding-top: 8px;
    margin-top: 6px;
  }

  .card-footer :deep(.el-button) {
    font-size: 12px;
    padding: 4px 12px;
  }
}
</style>
