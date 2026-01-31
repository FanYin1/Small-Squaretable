<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { useCharacterStore } from '@client/stores';
import CharacterCard from '@client/components/character/CharacterCard.vue';
import CharacterDetail from '@client/components/character/CharacterDetail.vue';

const characterStore = useCharacterStore();
const searchInput = ref('');
const selectedCharacterId = ref<string | null>(null);
const detailVisible = ref(false);

onMounted(async () => {
  await characterStore.fetchCharacters();
});

async function handleSearch() {
  await characterStore.searchCharacters(searchInput.value);
}

function handleCardClick(characterId: string) {
  selectedCharacterId.value = characterId;
  characterStore.fetchCharacter(characterId);
  detailVisible.value = true;
}

function handleCloseDetail() {
  detailVisible.value = false;
  selectedCharacterId.value = null;
}
</script>

<template>
  <div class="market-container">
    <div class="market-header">
      <h1>角色市场</h1>
      <p>探索并选择你喜欢的 AI 角色</p>
    </div>

    <div class="search-bar">
      <el-input
        v-model="searchInput"
        placeholder="搜索角色名称或描述..."
        :prefix-icon="Search"
        size="large"
        clearable
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #append>
          <el-button :icon="Search" @click="handleSearch">搜索</el-button>
        </template>
      </el-input>
    </div>

    <div v-loading="characterStore.loading" class="characters-grid">
      <CharacterCard
        v-for="character in characterStore.filteredCharacters"
        :key="character.id"
        :character="character"
        @click="handleCardClick(character.id)"
      />

      <el-empty
        v-if="!characterStore.loading && characterStore.filteredCharacters.length === 0"
        description="暂无角色"
      />
    </div>

    <CharacterDetail
      v-if="selectedCharacterId"
      :visible="detailVisible"
      :character-id="selectedCharacterId"
      @close="handleCloseDetail"
    />
  </div>
</template>

<style scoped>
.market-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.market-header {
  text-align: center;
  margin-bottom: 32px;
}

.market-header h1 {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

.market-header p {
  color: var(--el-text-color-secondary);
  margin: 0;
}

.search-bar {
  margin-bottom: 24px;
}

.characters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  min-height: 400px;
}

@media (max-width: 768px) {
  .characters-grid {
    grid-template-columns: 1fr;
  }
}
</style>
