<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Upload, Download, Share, Search, ChatDotRound, CopyDocument, FolderAdd, PriceTag } from '@element-plus/icons-vue';
import { api } from '@client/services/api';
import { characterApi } from '@client/services/character.api';
import { characterCollectionApi } from '@client/services/character-collection.api';
import { exportApi } from '@client/services/export.api';
import { useFeatureGate } from '@client/composables/useFeatureGate';
import { useToast } from '@client/composables/useToast';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import CharacterCard from '@client/components/character/CharacterCard.vue';
import EmptyState from '@client/components/market/EmptyState.vue';
import CharacterPublishForm from '@client/components/character/CharacterPublishForm.vue';
import CollectionSidebar from '@client/components/character/CollectionSidebar.vue';
import { downloadCharacterJson, readCharacterFile } from '@client/utils/sillytavern';
import type { Character, CharacterCollection } from '@client/types';

const { t } = useI18n();
const { hasFeature } = useFeatureGate();
const toast = useToast();
const router = useRouter();

// State
const characters = ref<Character[]>([]);
const loading = ref(false);
const activeTab = ref<'private' | 'published'>('private');
const searchQuery = ref('');

// Collections
const collections = ref<CharacterCollection[]>([]);
const activeCollection = ref<string | null>(null);

// Batch mode
const batchMode = ref(false);
const selectedIds = ref<string[]>([]);
const importInput = ref<HTMLInputElement | null>(null);

// Tag management
const showTagDialog = ref(false);
const addTagsList = ref<string[]>([]);
const removeTagsList = ref<string[]>([]);

function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) selectedIds.value.splice(idx, 1);
  else selectedIds.value.push(id);
}

async function batchExport(format: 'json' | 'png') {
  if (selectedIds.value.length === 0) return;
  try {
    const blob = await exportApi.batchExportCharacters(selectedIds.value, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `characters-export.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('myCharacters.exportSuccess'));
  } catch (e: any) {
    toast.error(t('myCharacters.exportFailed'), { message: e.message || t('common.retry') });
  }
}

async function handleBatchImport(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;
  try {
    const result = await exportApi.batchImportCharacters(Array.from(input.files));
    toast.success(t('myCharacters.batchImportSuccess', { count: result.imported }));
    await fetchCharacters();
  } catch (e: any) {
    toast.error(t('myCharacters.importFailed'), { message: e.message || t('common.retry') });
  }
  input.value = '';
}

async function batchDelete() {
  if (selectedIds.value.length === 0) return;
  try {
    await ElMessageBox.confirm(
      t('myCharacters.batchDeleteConfirm'),
      t('myCharacters.deleteTitle'),
      {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'error',
      }
    );
    const result = await characterApi.batchDelete(selectedIds.value);
    toast.success(t('myCharacters.batchDeleteSuccess', { count: result.deleted }));
    selectedIds.value = [];
    await fetchCharacters();
  } catch (e: any) {
    if (e !== 'cancel') {
      toast.error(t('myCharacters.deleteFailed'), { message: e.message || t('common.retry') });
    }
  }
}

async function handleBatchTags() {
  if (addTagsList.value.length === 0 && removeTagsList.value.length === 0) return;
  try {
    const result = await characterApi.batchUpdateTags(
      selectedIds.value,
      addTagsList.value,
      removeTagsList.value,
    );
    toast.success(t('myCharacters.tagsUpdated', { count: result.updatedCount }));
    showTagDialog.value = false;
    addTagsList.value = [];
    removeTagsList.value = [];
    await fetchCharacters();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : t('common.retry');
    toast.error(t('common.updateFailed'), { message: msg });
  }
}

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
  await Promise.all([fetchCharacters(), fetchCollections()]);
});

async function fetchCollections() {
  try {
    collections.value = await characterCollectionApi.getCollections();
  } catch {
    // silently fail — collections are supplementary
  }
}

async function fetchCharacters() {
  loading.value = true;
  try {
    if (activeCollection.value) {
      characters.value = await characterCollectionApi.getCollectionCharacters(activeCollection.value);
    } else {
      const response = await api.get<{ items: Character[]; pagination: any }>('/characters');
      characters.value = response.items || [];
    }
  } catch (error) {
    console.error('Failed to fetch characters:', error);
    toast.error(t('myCharacters.loadFailed'), { message: t('myCharacters.loadListFailed') });
  } finally {
    loading.value = false;
  }
}

function handleCollectionSelect(collectionId: string | null) {
  activeCollection.value = collectionId;
  fetchCharacters();
}

async function handleAddToCollection() {
  if (selectedIds.value.length === 0 || collections.value.length === 0) return;
  // Use first collection as default, or let user pick if multiple
  if (collections.value.length === 1) {
    try {
      await characterCollectionApi.addCharacters(collections.value[0].id, selectedIds.value);
      toast.success(t('collections.addSuccess'));
      await fetchCollections();
    } catch (e: any) {
      toast.error(t('common.updateFailed'), { message: e.message || t('common.retry') });
    }
    return;
  }
  // Multiple collections — show a simple prompt
  const choices = collections.value.map(c => c.name).join(', ');
  try {
    const result = await ElMessageBox.prompt(
      t('myCharacters.addToCollection') + ': ' + choices,
      {
        inputValue: collections.value[0].name,
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
      }
    );
    const value = (result as { value: string }).value;
    const target = collections.value.find(c => c.name === value?.trim());
    if (target) {
      await characterCollectionApi.addCharacters(target.id, selectedIds.value);
      toast.success(t('collections.addSuccess'));
      await fetchCollections();
    }
  } catch (e: any) {
    if (e !== 'cancel') {
      toast.error(t('common.updateFailed'), { message: e.message || t('common.retry') });
    }
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
  router.push({ name: 'CharacterCreate' });
}

function handleEdit(character: Character) {
  router.push({ name: 'CharacterEdit', params: { id: character.id } });
}

function handlePublish(character: Character) {
  selectedCharacterForPublish.value = character;
  publishDialogVisible.value = true;
}

async function handleUnpublish(character: Character) {
  try {
    await ElMessageBox.confirm(
      t('myCharacters.unlistConfirm'),
      t('myCharacters.unlistTitle'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );

    await api.post(`/characters/${character.id}/unpublish`);
    toast.success(t('myCharacters.unlisted'));
    await fetchCharacters();
  } catch (error: any) {
    if (error !== 'cancel') {
      toast.error(t('myCharacters.unlistFailed'), { message: error.message || t('common.retry') });
    }
  }
}

async function handleDelete(character: Character) {
  try {
    await ElMessageBox.confirm(
      t('myCharacters.deleteConfirm'),
      t('myCharacters.deleteTitle'),
      {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'error',
      }
    );

    await api.delete(`/characters/${character.id}`);
    toast.success(t('myCharacters.deleted'));
    await fetchCharacters();
  } catch (error: any) {
    if (error !== 'cancel') {
      toast.error(t('myCharacters.deleteFailed'), { message: error.message || t('common.retry') });
    }
  }
}

function handleExport(character: Character) {
  downloadCharacterJson(character);
  toast.success(t('myCharacters.exported'));
}

async function handleDuplicate(character: Character) {
  try {
    await characterApi.duplicateCharacter(character.id);
    toast.success(t('myCharacters.duplicated'));
    await fetchCharacters();
  } catch (error: any) {
    toast.error(t('myCharacters.duplicateFailed'), { message: error.message || t('common.retry') });
  }
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
      toast.success(t('myCharacters.imported'));
      await fetchCharacters();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(t('myCharacters.importFailed'), { message: error.message || t('common.retry') });
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
  router.push({ name: 'CharacterDetail', params: { id: characterId } });
}

function handleStartChat(character: Character) {
  router.push({ name: 'Chat', query: { characterId: character.id } });
}

</script>

<template>
  <DashboardLayout>
    <template #title>{{ $t('myCharacters.title') }}</template>
    <template #center>
      <div class="search-combo">
        <el-input
          v-model="searchQuery"
          :placeholder="$t('myCharacters.searchPlaceholder')"
          :prefix-icon="Search"
          clearable
          @keyup.enter="handleSearch"
        />
      </div>
    </template>
    <template #actions>
      <el-button type="primary" :icon="Plus" @click="handleCreateNew">
        {{ $t('myCharacters.createCharacter') }}
      </el-button>
    </template>

    <div class="my-characters-layout">
      <CollectionSidebar
        :active-collection="activeCollection"
        :collections="collections"
        @select="handleCollectionSelect"
        @refresh="fetchCollections"
      />

      <div class="my-characters-main">
    <div class="tabs-section">
      <el-tabs v-model="activeTab" class="character-tabs">
        <el-tab-pane name="private">
          <template #label>
            <span class="tab-label">
              {{ $t('myCharacters.private') }}
              <span class="tab-count">{{ privateCharacters.length }}</span>
            </span>
          </template>
        </el-tab-pane>
        <el-tab-pane name="published">
          <template #label>
            <span class="tab-label">
              {{ $t('myCharacters.published') }}
              <span class="tab-count">{{ publishedCharacters.length }}</span>
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div class="tabs-actions">
        <el-button @click="batchMode = !batchMode" :type="batchMode ? 'primary' : 'default'" size="small">
          {{ t('myCharacters.batchMode') }}
        </el-button>
        <input ref="importInput" type="file" multiple accept=".json,.png" style="display:none" @change="handleBatchImport" />
        <el-button :icon="Upload" @click="importInput?.click()" size="small">
          {{ t('myCharacters.batchImport') }}
        </el-button>
        <el-button :icon="Upload" @click="handleImport">
          {{ $t('myCharacters.importCharacter') }}
        </el-button>
      </div>
    </div>

    <!-- Batch action bar -->
    <div v-if="batchMode && selectedIds.length > 0" class="batch-actions">
      <span class="batch-count">{{ t('myCharacters.selected', { count: selectedIds.length }) }}</span>
      <el-button size="small" :icon="Download" @click="batchExport('json')">{{ t('myCharacters.exportJson') }}</el-button>
      <el-button size="small" :icon="Download" @click="batchExport('png')">{{ t('myCharacters.exportPng') }}</el-button>
      <el-button size="small" :icon="FolderAdd" @click="handleAddToCollection" :disabled="collections.length === 0">{{ t('myCharacters.addToCollection') }}</el-button>
      <el-button size="small" :icon="PriceTag" @click="showTagDialog = true">{{ t('myCharacters.manageTags') }}</el-button>
      <el-button size="small" type="danger" :icon="Delete" @click="batchDelete">{{ t('myCharacters.batchDelete') }}</el-button>
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
          :class="{ 'batch-selected': batchMode && selectedIds.includes(character.id) }"
        >
          <el-checkbox
            v-if="batchMode"
            class="batch-checkbox"
            :model-value="selectedIds.includes(character.id)"
            @change="toggleSelect(character.id)"
            @click.stop
          />
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
              {{ $t('market.startChat') }}
            </el-button>

            <el-button
              size="small"
              :icon="Edit"
              circle
              @click.stop="handleEdit(character)"
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
              :icon="CopyDocument"
              circle
              @click.stop="handleDuplicate(character)"
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

    </div>
    </div>

    <el-dialog v-model="showTagDialog" :title="t('myCharacters.manageTags')" width="480px">
      <el-form label-position="top">
        <el-form-item :label="t('myCharacters.addTags')">
          <el-select
            v-model="addTagsList"
            multiple
            filterable
            allow-create
            default-first-option
            :placeholder="t('myCharacters.tagsPlaceholder')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('myCharacters.removeTags')">
          <el-select
            v-model="removeTagsList"
            multiple
            filterable
            allow-create
            default-first-option
            :placeholder="t('myCharacters.tagsPlaceholder')"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTagDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="addTagsList.length === 0 && removeTagsList.length === 0" @click="handleBatchTags">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

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
.my-characters-layout {
  display: flex;
  gap: 0;
  min-height: 500px;
}

.my-characters-main {
  flex: 1;
  min-width: 0;
}

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

/* Batch mode */
.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: var(--color-primary-light-9, #ecf5ff);
  border-radius: 8px;
  margin-bottom: 8px;
}

.batch-count {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-primary);
  margin-right: auto;
}

.batch-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
}

.character-card-wrapper.batch-selected {
  outline: 2px solid var(--color-primary);
  border-radius: 16px;
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
  .my-characters-layout {
    flex-direction: column;
  }

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
