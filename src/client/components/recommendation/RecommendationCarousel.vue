<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import CharacterCard from '@client/components/character/CharacterCard.vue';
import type { Character } from '@client/types';

defineProps<{
  title: string;
  characters: Character[];
  loading: boolean;
}>();

const emit = defineEmits<{
  click: [characterId: string];
}>();

const { t } = useI18n();

function handleCardClick(characterId: string) {
  emit('click', characterId);
}
</script>

<template>
  <section class="recommendation-section" aria-label="Recommendations">
    <div class="recommendation-header">
      <h3 class="recommendation-title">{{ title }}</h3>
    </div>

    <div v-if="loading" class="carousel-scroll">
      <div v-for="i in 5" :key="i" class="skeleton-card-wrapper">
        <div class="skeleton-card">
          <div class="skeleton-avatar" />
          <div class="skeleton-line skeleton-line-title" />
          <div class="skeleton-line skeleton-line-desc" />
          <div class="skeleton-line skeleton-line-short" />
        </div>
      </div>
    </div>

    <div v-else-if="characters.length > 0" class="carousel-scroll">
      <div
        v-for="character in characters"
        :key="character.id"
        class="carousel-item"
        @click="handleCardClick(character.id)"
      >
        <CharacterCard :character="character" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.recommendation-section {
  margin-bottom: 24px;
}

.recommendation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.recommendation-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.carousel-scroll {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  padding-bottom: 8px;
  -webkit-overflow-scrolling: touch;
}

.carousel-scroll::-webkit-scrollbar {
  height: 6px;
}

.carousel-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.carousel-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--text-secondary) 20%, transparent);
  border-radius: 3px;
}

.carousel-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--text-secondary) 40%, transparent);
}

.carousel-item {
  flex: 0 0 260px;
  scroll-snap-align: start;
  cursor: pointer;
}

.skeleton-card-wrapper {
  flex: 0 0 260px;
  scroll-snap-align: start;
}

.skeleton-card {
  padding: 20px;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl, 12px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  height: 220px;
}

.skeleton-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text-secondary) 10%, transparent);
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-line {
  border-radius: 4px;
  background: color-mix(in srgb, var(--text-secondary) 10%, transparent);
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-line-title {
  width: 70%;
  height: 16px;
}

.skeleton-line-desc {
  width: 90%;
  height: 12px;
  animation-delay: 0.1s;
}

.skeleton-line-short {
  width: 50%;
  height: 12px;
  animation-delay: 0.2s;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@media (max-width: 767px) {
  .carousel-item {
    flex: 0 0 220px;
  }

  .skeleton-card-wrapper {
    flex: 0 0 220px;
  }

  .recommendation-title {
    font-size: 16px;
  }
}
</style>
