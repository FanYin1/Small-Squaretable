<template>
  <div class="welcome-page">
    <h1 class="welcome-title">{{ t('chat.welcomeTitle') }}</h1>
    <p class="welcome-subtitle">{{ t('chat.welcomeSubtitle') }}</p>

    <!-- Chat mode toggle -->
    <div class="mode-toggle">
      <span :class="['mode-label', { active: !isGroupMode }]">{{ t('groupChat.singleMode') }}</span>
      <el-switch v-model="isGroupMode" :aria-label="t('groupChat.groupMode')" />
      <span :class="['mode-label', { active: isGroupMode }]">{{ t('groupChat.groupMode') }}</span>
    </div>

    <div class="welcome-search">
      <el-input
        v-model="searchQuery"
        :placeholder="t('chat.searchCharacters')"
        :prefix-icon="Search"
        clearable
      />
    </div>

    <!-- Group mode selection bar -->
    <div v-if="isGroupMode && selectedCharacterIds.length > 0" class="group-selection-bar">
      <span class="selection-count">{{ t('groupChat.selectCharacters') }}: {{ selectedCharacterIds.length }} / 10</span>
      <el-button type="primary" size="small" :disabled="selectedCharacterIds.length < 2" @click="startGroupChat">
        {{ t('groupChat.groupMode') }}
      </el-button>
    </div>

    <!-- Templates section -->
    <template v-if="!isGroupMode && allTemplates.length > 0">
      <div class="section-title">{{ t('chat.templates') }}</div>
      <div class="template-grid">
        <div
          v-for="tpl in allTemplates"
          :key="tpl.id"
          class="template-card"
          role="button"
          :tabindex="0"
          @click="handleUseTemplate(tpl)"
          @keydown.enter="handleUseTemplate(tpl)"
        >
          <span class="template-name">{{ tpl.name }}</span>
          <span class="template-desc">{{ tpl.description || '' }}</span>
          <div v-if="tpl.tags?.length" class="template-tags">
            <el-tag v-for="tag in tpl.tags.slice(0, 3)" :key="tag" size="small" type="info">{{ tag }}</el-tag>
          </div>
        </div>
      </div>
    </template>

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

    <!-- Error state -->
    <template v-else-if="loadError">
      <div class="empty-state">
        <p class="empty-message">{{ t('common.loadFailed', t('common.retry')) }}</p>
        <el-button type="primary" @click="retryLoad">{{ t('common.retry') }}</el-button>
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
          :class="['character-card', { selected: isGroupMode && selectedCharacterIds.includes(character.id) }]"
          role="button"
          :tabindex="0"
          :aria-label="character.name"
          @click="handleCardClick(character.id)"
          @keydown.enter="handleCardClick(character.id)"
        >
          <div v-if="isGroupMode" class="card-checkbox">
            <el-checkbox
              :model-value="selectedCharacterIds.includes(character.id)"
              @click.stop
              @change="toggleCharacterSelection(character.id)"
            />
          </div>
          <el-avatar :size="64" :src="character.avatar">
            {{ character.name?.charAt(0) }}
          </el-avatar>
          <span class="character-name">{{ character.name }}</span>
          <span class="character-desc">{{ getCleanDescription(character) }}</span>
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
import { useChatTemplateStore } from '@client/stores/chatTemplate';
import { cleanDescription } from '@client/utils/sillytavern';
import type { ChatTemplate } from '@client/services/chat-template.api';

const emit = defineEmits<{
  (e: 'select-character', characterId: string): void;
  (e: 'select-characters', characterIds: string[]): void;
  (e: 'use-template', template: ChatTemplate): void;
}>();

const router = useRouter();
const { t } = useI18n();
const templateStore = useChatTemplateStore();

const searchQuery = ref('');
const characters = ref<Character[]>([]);
const loading = ref(true);
const isGroupMode = ref(false);
const selectedCharacterIds = ref<string[]>([]);
const loadError = ref(false);

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

const toggleCharacterSelection = (characterId: string) => {
  const idx = selectedCharacterIds.value.indexOf(characterId);
  if (idx >= 0) {
    selectedCharacterIds.value.splice(idx, 1);
  } else if (selectedCharacterIds.value.length < 10) {
    selectedCharacterIds.value.push(characterId);
  }
};

const handleCardClick = (characterId: string) => {
  if (isGroupMode.value) {
    toggleCharacterSelection(characterId);
  } else {
    selectCharacter(characterId);
  }
};

const startGroupChat = () => {
  if (selectedCharacterIds.value.length >= 2) {
    emit('select-characters', [...selectedCharacterIds.value]);
    selectedCharacterIds.value = [];
  }
};

const allTemplates = computed(() => [
  ...templateStore.ownTemplates,
  ...templateStore.publicTemplates.filter(t => !templateStore.ownTemplates.some(o => o.id === t.id)),
]);

const handleUseTemplate = async (template: ChatTemplate) => {
  await templateStore.useTemplate(template.id);
  emit('use-template', template);
};

const goToMarket = () => {
  router.push({ name: 'Market' });
};

const getCleanDescription = (character: Character) => {
  return cleanDescription(character.description, character.name, 80);
};

const goToMyCharacters = () => {
  router.push({ name: 'MyCharacters' });
};

const retryLoad = async () => {
  loading.value = true;
  try {
    const res = await characterApi.getCharacters({ limit: 12 });
    characters.value = res.characters;
    loadError.value = false;
  } catch {
    characters.value = [];
    loadError.value = true;
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  try {
    const res = await characterApi.getCharacters({ limit: 12 });
    characters.value = res.characters;
    loadError.value = false;
  } catch {
    characters.value = [];
    loadError.value = true;
  } finally {
    loading.value = false;
  }
  templateStore.fetchTemplates();
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
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
  text-align: center;
}

.welcome-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
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
  color: var(--text-secondary);
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
  border: 1px solid var(--border-default);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-surface);
}

.character-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.character-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.character-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.character-desc {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.browse-link {
  margin-top: 24px;
  color: var(--accent-text);
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

.mode-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.mode-label {
  font-size: 14px;
  color: var(--text-secondary);
  transition: color 0.2s;
}

.mode-label.active {
  color: var(--accent-text);
  font-weight: 600;
}

.group-selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 600px;
  padding: 8px 16px;
  margin-bottom: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--accent);
  border-radius: 8px;
}

.selection-count {
  font-size: 14px;
  color: var(--text-primary);
}

.character-card.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-surface));
}

.card-checkbox {
  position: absolute;
  top: 8px;
  right: 8px;
}

.character-card {
  position: relative;
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
  color: var(--text-secondary);
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  max-width: 600px;
  width: 100%;
  margin-bottom: 24px;
}

.template-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-surface);
}

.template-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.template-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.template-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.template-desc {
  font-size: 12px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.template-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}

@media (max-width: 480px) {
  .character-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .template-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
