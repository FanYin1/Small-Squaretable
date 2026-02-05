<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Upload, Download, Share, Search, ChatDotRound } from '@element-plus/icons-vue';
import { api } from '@client/services/api';
import { useFeatureGate } from '@client/composables/useFeatureGate';
import { useToast } from '@client/composables/useToast';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import CharacterCard from '@client/components/character/CharacterCard.vue';
import EmptyState from '@client/components/market/EmptyState.vue';
import CharacterPublishForm from '@client/components/character/CharacterPublishForm.vue';
import { downloadCharacterJson, readCharacterFile } from '@client/utils/sillytavern';
import type { Character } from '@client/types';

const { hasFeature } = useFeatureGate();
const toast = useToast();
const router = useRouter();

// State
const characters = ref<Character[]>([]);
const loading = ref(false);
const activeTab = ref<'private' | 'published'>('private');
const searchQuery = ref('');

// Dialogs
const publishDialogVisible = ref(false);
const selectedCharacterForPublish = ref<Character | null>(null);

// Computed

const privateCharacters = computed(() => {
  return characters.value.filter(c => !c.isPublic);
});

const publishedCharacters = computed(() => {
  return characters.value.filter(c => c.isPublic);
});

const displayCharacters = computed(() => {
  const list = activeTab.value === 'private' ? privateCharacters.value : publishedCharacters.value;

  if (!searchQuery.value.trim()) {
    return list;
  }

  const query = searchQuery.value.toLowerCase();
  return list.filter(c =>
    c.name.toLowerCase().includes(query) ||
    c.description?.toLowerCase().includes(query) ||
    c.tags?.some(tag => tag.toLowerCase().includes(query))
  );
});

onMounted(async () => {
  await fetchCharacters();
});

async function fetchCharacters() {
  loading.value = true;
  try {
    // api.get automatically extracts response.data, so we get { items, pagination } directly
    const response = await api.get<{ items: Character[]; pagination: any }>('/characters');
    characters.value = response.items || [];
  } catch (error) {
    console.error('Failed to fetch characters:', error);
    toast.error('加载失败', { message: '获取角色列表失败' });
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  // Search is reactive through computed property
}

function handleClearFilters() {
  searchQuery.value = '';
}

function handleBrowseAll() {
  searchQuery.value = '';
  activeTab.value = 'private';
}

function handleCreateNew() {
  // Navigate to character creation page or open dialog
  toast.info('创建角色功能开发中');
}

function handlePublish(character: Character) {
  selectedCharacterForPublish.value = character;
  publishDialogVisible.value = true;
}

async function handleUnpublish(character: Character) {
  try {
    await ElMessageBox.confirm(
      '确定要从市场下架此角色吗？',
      '确认下架',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    await api.post(`/characters/${character.id}/unpublish`);
    toast.success('角色已下架');
    await fetchCharacters();
  } catch (error: any) {
    if (error !== 'cancel') {
      toast.error('下架失败', { message: error.message || '请稍后重试' });
    }
  }
}

async function handleDelete(character: Character) {
  try {
    await ElMessageBox.confirm(
      '确定要删除此角色吗？此操作不可恢复。',
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'error',
      }
    );

    await api.delete(`/characters/${character.id}`);
    toast.success('角色已删除');
    await fetchCharacters();
  } catch (error: any) {
    if (error !== 'cancel') {
      toast.error('删除失败', { message: error.message || '请稍后重试' });
    }
  }
}

function handleExport(character: Character) {
  downloadCharacterJson(character);
  toast.success('角色已导出');
}

async function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.png';

  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const characterData = await readCharacterFile(file);

      // If we have an avatar URL from PNG, we need to convert it to base64
      let avatarUrl = characterData.avatarUrl;

      // For PNG files, convert blob URL to base64 data URL
      if (avatarUrl && avatarUrl.startsWith('blob:')) {
        try {
          const response = await fetch(avatarUrl);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          avatarUrl = base64;
          // Clean up blob URL
          URL.revokeObjectURL(characterData.avatarUrl!);
        } catch {
          avatarUrl = undefined;
        }
      }

      // Create character with correct field names matching backend schema
      await api.post('/characters', {
        name: characterData.name,
        description: characterData.description,
        avatarUrl: avatarUrl,
        tags: characterData.tags,
        cardData: characterData.cardData,
        isNsfw: characterData.isNsfw || false,
      });
      toast.success('角色已导入');
      await fetchCharacters();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error('导入失败', { message: error.message || '请稍后重试' });
    }
  };

  input.click();
}

function handlePublishSuccess() {
  publishDialogVisible.value = false;
  selectedCharacterForPublish.value = null;
  fetchCharacters();
}

function handleCardClick(characterId: string) {
  // TODO: Open character detail modal or navigate to detail page
  console.log('Character clicked:', characterId);
}

function handleStartChat(character: Character) {
  router.push({ name: 'Chat', query: { characterId: character.id } });
}

</script>

<template>
  <DashboardLayout>
    <template #title>我的角色</template>
    <template #center>
      <div class="search-combo">
        <el-input
          v-model="searchQuery"
          placeholder="搜索角色名称、描述或标签..."
          :prefix-icon="Search"
          clearable
          @keyup.enter="handleSearch"
        />
      </div>
    </template>
    <template #actions>
      <el-button type="primary" :icon="Plus" @click="handleCreateNew">
        创建角色
      </el-button>
    </template>

    <div class="tabs-section">
      <el-tabs v-model="activeTab" class="character-tabs">
        <el-tab-pane name="private">
          <template #label>
            <span class="tab-label">
              私有角色
              <span class="tab-count">{{ privateCharacters.length }}</span>
            </span>
          </template>
        </el-tab-pane>
        <el-tab-pane name="published">
          <template #label>
            <span class="tab-label">
              已发布
              <span class="tab-count">{{ publishedCharacters.length }}</span>
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div class="tabs-actions">
        <el-button :icon="Upload" @click="handleImport">
          导入角色
        </el-button>
      </div>
    </div>

    <div v-loading="loading" class="characters-section">
      <div v-if="!loading && displayCharacters.length === 0">
        <EmptyState
          v-if="searchQuery.trim()"
          type="no-results"
          @action-primary="handleClearFilters"
          @action-secondary="handleBrowseAll"
        />
        <EmptyState
          v-else
          type="no-data"
          @action-primary="handleCreateNew"
        />
      </div>

      <div v-else class="characters-grid">
        <div
          v-for="character in displayCharacters"
          :key="character.id"
          class="character-card-wrapper"
        >
          <CharacterCard
            :character="character"
            @click="handleCardClick(character.id)"
          />

          <div class="card-actions-overlay">
            <el-button
              type="primary"
              size="small"
              :icon="ChatDotRound"
              @click.stop="handleStartChat(character)"
            >
              开始聊天
            </el-button>

            <el-button
              size="small"
              :icon="Edit"
              circle
              @click.stop="handleCardClick(character.id)"
            />

            <el-button
              v-if="!character.isPublic"
              size="small"
              type="success"
              :icon="Share"
              circle
              :disabled="!hasFeature('character_share')"
              @click.stop="handlePublish(character)"
            />

            <el-button
              v-else
              size="small"
              type="warning"
              :icon="Download"
              circle
              @click.stop="handleUnpublish(character)"
            />

            <el-button
              size="small"
              :icon="Download"
              circle
              @click.stop="handleExport(character)"
            />

            <el-button
              size="small"
              type="danger"
              :icon="Delete"
              circle
              @click.stop="handleDelete(character)"
            />
          </div>
        </div>
      </div>
    </div>

    <CharacterPublishForm
      v-if="selectedCharacterForPublish && publishDialogVisible"
      :visible="publishDialogVisible"
      :character="selectedCharacterForPublish"
      @close="publishDialogVisible = false"
      @success="handlePublishSuccess"
    />
  </DashboardLayout>
</template>

<style scoped>
.search-combo {
  width: 100%;
  max-width: 520px;
}

.search-combo :deep(.el-input) {
  flex: 1;
}

.search-combo :deep(.el-input__wrapper) {
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}

.search-combo :deep(.el-input__wrapper:hover) {
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
}

.search-combo :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* 标签栏 */
.tabs-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
  border-radius: 12px;
}

.character-tabs {
  flex: 1;
}

.character-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.character-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.character-tabs :deep(.el-tabs__active-bar) {
  background: var(--color-primary);
  height: 3px;
}

.character-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-color-secondary);
  padding: 0 20px;
  height: 44px;
  line-height: 44px;
}

.character-tabs :deep(.el-tabs__item:hover) {
  color: var(--color-primary);
}

.character-tabs :deep(.el-tabs__item.is-active) {
  color: var(--color-primary);
  font-weight: 600;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--color-bg);
  color: var(--color-primary);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.character-tabs :deep(.el-tabs__item.is-active) .tab-count {
  background: var(--color-primary);
  color: white;
}

.tabs-actions {
  display: flex;
  gap: 12px;
}

.tabs-actions :deep(.el-button) {
  border-radius: 8px;
}

/* 角色区域 */
.characters-section {
  flex: 1;
  min-height: 400px;
}

.characters-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

/* 角色卡片包装器 */
.character-card-wrapper {
  position: relative;
}

.character-card-wrapper:hover .card-actions-overlay {
  opacity: 1;
  pointer-events: auto;
}

/* 操作按钮覆盖层 */
.card-actions-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: color-mix(in srgb, var(--bg-color) 95%, transparent);
  backdrop-filter: blur(4px);
  border-radius: 16px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  padding: 16px;
  flex-wrap: wrap;
}

.card-actions-overlay :deep(.el-button) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-actions-overlay :deep(.el-button.is-circle) {
  width: 36px;
  height: 36px;
}

/* 平板端适配 (3列) */
@media (max-width: 1279px) and (min-width: 768px) {
  .characters-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
}

/* 移动端适配 (1列) */
@media (max-width: 767px) {
  .search-combo {
    width: 100%;
  }

  .tabs-section {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .tabs-actions {
    width: 100%;
  }

  .tabs-actions .el-button {
    flex: 1;
  }

  .characters-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .card-actions-overlay {
    opacity: 1;
    pointer-events: auto;
    position: static;
    background: var(--bg-color);
    border-top: 1px solid var(--border-color);
    border-radius: 0 0 16px 16px;
    margin-top: -16px;
    padding: 12px;
  }
}

/* 小平板端适配 */
@media (max-width: 1023px) and (min-width: 768px) {
  .tabs-section {
    padding: 12px 16px;
  }
}
</style>
