<template>
  <div class="welcome-page">
    <h1 class="welcome-title">{{ t('chat.welcomeTitle') }}</h1>
    <p class="welcome-subtitle">{{ t('chat.welcomeSubtitle') }}</p>

    <div class="welcome-search">
      <el-input
        v-model="searchQuery"
        :placeholder="t('chat.searchCharacters')"
        :prefix-icon="Search"
        clearable
      />
    </div>

    <!-- Loading state -->
    <template v-if="loading">
      <div class="section-title">{{ t('chat.recentCharacters') }}</div>
      <div class="character-grid">
        <div v-for="n in 3" :key="n" class="character-card">
          <el-skeleton animated>
            <template #template>
              <el-skeleton-item variant="circle" style="width: 64px; height: 64px" />
              <el-skeleton-item variant="text" style="width: 60%; margin-top: 8px" />
              <el-skeleton-item variant="text" style="width: 80%; margin-top: 4px" />
            </template>
          </el-skeleton>
        </div>
      </div>
    </template>

    <!-- Empty state -->
    <template v-else-if="characters.length === 0">
      <div class="empty-state">
        <p class="empty-message">{{ t('chat.createFirst') }}</p>
        <el-button type="primary" @click="goToMyCharacters">
          {{ t('chat.createCharacter') }}
        </el-button>
      </div>
    </template>

    <!-- Character grid -->
    <template v-else>
      <div class="section-title">{{ t('chat.recentCharacters') }}</div>
      <div class="character-grid">
        <div
          v-for="character in filteredCharacters"
          :key="character.id"
          class="character-card"
          role="button"
          :tabindex="0"
          :aria-label="character.name"
          @click="selectCharacter(character.id)"
          @keydown.enter="selectCharacter(character.id)"
        >
          <el-avatar :size="64" :src="character.avatar">
            {{ character.name?.charAt(0) }}
          </el-avatar>
          <span class="character-name">{{ character.name }}</span>
          <span class="character-desc">{{ character.description }}</span>
        </div>
      </div>

      <button class="browse-link" @click="goToMarket">
        {{ t('chat.browseMarket') }} →
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Search } from '@element-plus/icons-vue';
import { characterApi } from '@client/services/character.api';
import type { Character } from '@client/types';

const emit = defineEmits<{
  (e: 'select-character', characterId: string): void;
}>();

const router = useRouter();
const { t } = useI18n();

const searchQuery = ref('');
const characters = ref<Character[]>([]);
const loading = ref(true);

const filteredCharacters = computed(() => {
  if (!searchQuery.value) return characters.value;
  const query = searchQuery.value.toLowerCase();
  return characters.value.filter((c) =>
    c.name.toLowerCase().includes(query)
  );
});

const selectCharacter = (characterId: string) => {
  emit('select-character', characterId);
};

const goToMarket = () => {
  router.push({ name: 'Market' });
};

const goToMyCharacters = () => {
  router.push({ name: 'MyCharacters' });
};

onMounted(async () => {
  try {
    const res = await characterApi.getCharacters({ limit: 12 });
    characters.value = res.characters;
  } catch {
    characters.value = [];
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.welcome-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 48px 24px;
}

.welcome-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-color-primary);
  margin-bottom: 8px;
}

.welcome-subtitle {
  font-size: 16px;
  color: var(--text-color-secondary);
  margin-bottom: 32px;
}

.welcome-search {
  width: 100%;
  max-width: 400px;
  margin-bottom: 32px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 16px;
  align-self: flex-start;
  max-width: 600px;
  width: 100%;
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  max-width: 600px;
  width: 100%;
}

.character-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-color);
}

.character-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.character-card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.character-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.character-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.browse-link {
  margin-top: 24px;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
}

.browse-link:hover {
  opacity: 0.8;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 0;
}

.empty-message {
  font-size: 16px;
  color: var(--text-color-secondary);
}

@media (max-width: 480px) {
  .character-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
