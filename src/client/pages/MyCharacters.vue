<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('MyCharacters');
import { Plus, Delete, Upload, Download, Search, FolderAdd, PriceTag } from '@element-plus/icons-vue';
import { api } from '@client/services/api';
import { characterApi } from '@client/services/character.api';
import { characterCollectionApi } from '@client/services/character-collection.api';
import { exportApi, type CharacterBatchImportResult } from '@client/services/export.api';
import { useFeatureGate } from '@client/composables/useFeatureGate';
import { useToast } from '@client/composables/useToast';
import ExplorationLayout from '@client/components/layout/ExplorationLayout.vue';
import PrivateStoryCard from '@client/components/character/PrivateStoryCard.vue';
import CharacterPublishForm from '@client/components/character/CharacterPublishForm.vue';
import ModerationStatusBadge from '@client/components/character/ModerationStatusBadge.vue';
import CollectionSidebar from '@client/components/character/CollectionSidebar.vue';
import { downloadCharacterJson } from '@client/utils/sillytavern';
import type { Character, CharacterCollection } from '@client/types';

const { t, te } = useI18n();
const { hasFeature, featureError, retryFeatures } = useFeatureGate();
const toast = useToast();
const router = useRouter();

// State
const characters = ref<Character[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const loadTimedOut = ref(false);
const retryAppend = ref(false);
const nextPage = ref<number | null>(null);
let listVersion = 0;
let listController: AbortController | null = null;
onUnmounted(() => { listVersion += 1; listController?.abort(); });
const activeTab = ref<'private' | 'published'>('private');
const searchQuery = ref('');

// Collections
const collections = ref<CharacterCollection[]>([]);
const activeCollection = ref<string | null>(null);

// Batch mode
const batchMode = ref(false);
const selectedIds = ref<string[]>([]);
const importInput = ref<HTMLInputElement | null>(null);
const importResult = ref<CharacterBatchImportResult | null>(null);
const importing = ref(false);

function importErrorMessage(error: { code?: string; error: string }) {
  const key = `myCharacters.importErrors.${error.code}`;
  return error.code && te(key) ? t(key) : error.error;
}

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
  if (!input.files?.length || importing.value) return;
  importing.value = true;
  importResult.value = null;
  try {
    const result = await exportApi.batchImportCharacters(Array.from(input.files));
    importResult.value = result;
    if (result.failed.length === 0) toast.success(t('myCharacters.batchImportSuccess', { count: result.imported.length }));
    if (result.imported.length > 0) await fetchCharacters();
  } catch (e: any) {
    toast.error(t('myCharacters.importFailed'), { message: e.message || t('common.retry') });
  } finally {
    importing.value = false;
    input.value = '';
  }
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

async function fetchCharacters(append = false) {
  const page = append ? nextPage.value : 1;
  if (!page) return;
  const requestedVersion = ++listVersion;
  listController?.abort();
  const controller = new AbortController();
  listController = controller;
  let timedOut = false;
  let cancelRead!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancelRead = () => reject(new Error('Character list read cancelled'));
    controller.signal.addEventListener('abort', cancelRead, { once: true });
  });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  loading.value = true;
  loadFailed.value = false;
  loadTimedOut.value = false;
  retryAppend.value = append;
  if (!append) { characters.value = []; nextPage.value = null; }
  try {
    if (activeCollection.value) {
      const result = await Promise.race([characterCollectionApi.getCollectionCharacters(activeCollection.value, { signal: controller.signal }), cancelled]);
      if (requestedVersion !== listVersion) return;
      characters.value = result;
      nextPage.value = null;
    } else {
      const result = await Promise.race([characterApi.getCharacters({ page, limit: 50 }, { signal: controller.signal }), cancelled]);
      if (requestedVersion !== listVersion) return;
      characters.value = append ? [...new Map([...characters.value, ...result.characters].map(character => [character.id, character])).values()] : result.characters;
      nextPage.value = result.pagination?.hasNext ? page + 1 : null;
    }
  } catch (error) {
    if (requestedVersion !== listVersion) return;
    loadFailed.value = true;
    loadTimedOut.value = timedOut;
    logger.error('Failed to fetch characters', error);
    toast.error(t('myCharacters.loadFailed'), { message: t(timedOut ? 'myCharacters.loadListTimedOut' : 'myCharacters.loadListFailed') });
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', cancelRead);
    if (listController === controller) listController = null;
    if (requestedVersion === listVersion) loading.value = false;
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

function handleManage(command: string, character: Character) {
  if (command === 'publish') handlePublish(character);
  else if (command === 'unpublish') void handleUnpublish(character);
  else if (command === 'export') handleExport(character);
  else if (command === 'duplicate') void handleDuplicate(character);
  else if (command === 'delete') void handleDelete(character);
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
  router.push({ name: 'Chat', query: { characterId: character.id, storyEntry: 'quick' } });
}

</script>

<template>
  <ExplorationLayout>
    <header class="library-intro">
      <div>
        <p class="library-eyebrow">{{ t('privateLibrary.eyebrow') }}</p>
        <h1>{{ t('privateLibrary.heading') }}</h1>
        <p class="library-description">{{ t('privateLibrary.description') }}</p>
      </div>
      <div class="library-entry-actions">
        <input ref="importInput" type="file" multiple accept=".json,.png,.jpg,.jpeg,.webp" hidden @change="handleBatchImport" />
        <el-button type="primary" :icon="Upload" :loading="importing" @click="importInput?.click()">{{ t('privateLibrary.import') }}</el-button>
        <el-button :icon="Plus" @click="handleCreateNew">{{ t('privateLibrary.create') }}</el-button>
      </div>
    </header>
    <section v-if="importResult" class="import-result" role="status" aria-live="polite" data-testid="import-result">
      <h2>{{ t('myCharacters.batchImportResult', { imported: importResult.imported.length, failed: importResult.failed.length }) }}</h2>
      <p>{{ t('myCharacters.importScope') }}</p>
      <ul v-if="importResult.failed.length">
        <li v-for="(failure, index) in importResult.failed" :key="index">
          <strong>{{ failure.filename }}</strong> — {{ importErrorMessage(failure) }}
        </li>
      </ul>
      <el-button @click="importResult = null">{{ t('common.close') }}</el-button>
    </section>
    <div class="library-search-row">
      <div class="search-combo"><el-input v-model="searchQuery" :aria-label="t('myCharacters.searchPlaceholder')" :placeholder="t('myCharacters.searchPlaceholder')" :prefix-icon="Search" clearable @keyup.enter="handleSearch" /></div>
      <details class="library-tools">
        <summary>{{ t('privateLibrary.tools') }}</summary>
        <nav class="story-shortcuts" :aria-label="t('storyShell.authorTools')">
          <RouterLink :to="{ name: 'WorldBooks' }">{{ t('nav.worldBooks') }}</RouterLink>
          <RouterLink :to="{ name: 'PresetManager' }">{{ t('storyShell.presets') }}</RouterLink>
          <RouterLink :to="{ name: 'CharacterTemplates' }">{{ t('storyShell.templates') }}</RouterLink>
        </nav>
      </details>
    </div>
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
      </div>
    </div>
    <p class="library-privacy">{{ t('privateLibrary.privacy') }} <span v-if="nextPage">{{ t('privateLibrary.loadedCounts') }}</span></p>

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
      <p v-if="featureError" role="alert">{{ t('subscription.statusLoadFailed') }} <el-button @click="retryFeatures">{{ t('credits.refresh') }}</el-button></p>
      <p v-if="loadFailed" role="alert" data-testid="library-load-error">{{ t(loadTimedOut ? 'myCharacters.loadListTimedOut' : 'myCharacters.loadListFailed') }} <el-button :disabled="loading" @click="fetchCharacters(retryAppend)">{{ t('myCharacters.retryLoad') }}</el-button></p>
      <p v-if="nextPage" role="status">{{ t('myCharacters.partialList') }} <el-button :disabled="loading" @click="fetchCharacters(true)">{{ t('myCharacters.loadMore') }}</el-button></p>
      <section v-if="!loading && !loadFailed && displayCharacters.length === 0" class="library-empty" role="status" :data-type="searchQuery.trim() ? 'no-results' : 'no-data'">
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" aria-hidden="true"><path d="M30 14C22 8 12 9 6 12V45C14 42 22 43 30 48M30 14C38 8 48 9 54 12V45C46 42 38 43 30 48M30 14V48" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>
        <h2>{{ t(searchQuery.trim() ? 'market.empty.noResults' : activeTab === 'private' ? 'privateLibrary.emptyTitle' : 'privateLibrary.publishedEmptyTitle') }}</h2>
        <p>{{ t(searchQuery.trim() ? 'market.empty.noResultsDesc' : activeTab === 'private' ? 'privateLibrary.emptyDescription' : 'privateLibrary.publishedEmptyDescription') }}</p>
        <div v-if="searchQuery.trim()" class="library-empty-actions">
          <el-button @click="handleClearFilters">{{ t('market.empty.clearFilters') }}</el-button>
          <el-button @click="handleBrowseAll">{{ t('market.empty.browseAll') }}</el-button>
        </div>
        <div v-else class="library-empty-actions">
          <el-button type="primary" :disabled="importing" @click="importInput?.click()">{{ t('privateLibrary.import') }}</el-button>
          <el-button @click="handleCreateNew">{{ t('privateLibrary.create') }}</el-button>
        </div>
      </section>

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
            :aria-label="t('privateLibrary.selection', { name: character.name })"
            :model-value="selectedIds.includes(character.id)"
            @change="toggleSelect(character.id)"
            @click.stop
          />
          <PrivateStoryCard
            :character="character"
            :can-publish="hasFeature('character_share')"
            @view="handleCardClick(character.id)"
            @enter="handleStartChat(character)"
            @edit="handleEdit(character)"
            @manage="handleManage($event, character)"
          >
            <template v-if="character.isPublic" #status>
              <ModerationStatusBadge :status="character.moderationStatus" :category="character.violationCategory" :note="character.moderationNote" />
            </template>
          </PrivateStoryCard>
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
  </ExplorationLayout>
</template>

<style scoped lang="scss">
.library-intro { display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 8px 0 32px; }
.library-eyebrow { margin: 0 0 16px; color: var(--accent-text); font-size: 11px; letter-spacing: .12em; }
.library-intro h1 { margin: 0 0 14px; color: var(--text-primary); font: 500 clamp(30px, 4vw, 42px)/1.3 var(--font-display); }
.library-description { margin: 0; color: var(--text-secondary); font-size: 14px; line-height: 1.8; }
.library-entry-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
.library-entry-actions :deep(.el-button) { margin: 0; min-height: 44px; }
.library-search-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 20px 0; border-top: 1px solid var(--border-default); }
.library-tools { font-size: 13px; color: var(--text-secondary); }
.library-tools summary { padding: 10px 4px; min-height: 44px; cursor: pointer; }
.library-tools summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.story-shortcuts { display: flex; flex-wrap: wrap; gap: 12px; padding-block: 8px; }
.story-shortcuts a { display: inline-flex; align-items: center; min-height: 44px; color: var(--text-secondary); }
.library-privacy { margin: 4px 0 24px; color: var(--text-secondary); font-size: 12px; line-height: 1.8; }
.library-privacy span { display: block; }
.library-empty { display: flex; flex-direction: column; align-items: center; padding: 56px 20px; border: 1px dashed var(--border-default); border-radius: 14px; text-align: center; color: var(--text-secondary); }
.library-empty svg { color: var(--accent-text); margin-bottom: 24px; }
.library-empty h2 { margin: 0 0 12px; font: 500 24px/1.4 var(--font-display); color: var(--text-primary); }
.library-empty p { max-width: 400px; font-size: 14px; line-height: 1.8; }
.library-empty-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 16px; }
.library-empty-actions :deep(.el-button) { min-height: 44px; margin: 0; }
.import-result {
  padding: 1rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface);
  overflow-wrap: anywhere;

  h2 { font-size: 1rem; }
  p { color: var(--text-secondary); }
  ul { padding-inline-start: 1.25rem; }
  li { margin-block: 0.5rem; }
}

.my-characters-layout {
  display: flex;
  gap: 24px;
  min-height: 500px;
}

.my-characters-main {
  flex: 1;
  min-width: 0;
}

.search-combo {
  width: 100%;
  max-width: 420px;
}

.search-combo :deep(.el-input) {
  flex: 1;
}

.search-combo :deep(.el-input__wrapper) {
  min-height: 44px;
  border-radius: 8px;
  background: var(--bg-surface);
  box-shadow: 0 0 0 1px var(--border-default);
}

.search-combo :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px var(--accent);
}

/* 标签栏 */
.tabs-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 0 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-default);
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
  background: var(--accent);
  height: 3px;
}

.character-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 0 20px;
  height: 44px;
  line-height: 44px;
}

.character-tabs :deep(.el-tabs__item:hover) {
  color: var(--accent-text);
}

.character-tabs :deep(.el-tabs__item.is-active) {
  color: var(--accent-text);
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
  background: var(--bg-subtle);
  color: var(--accent-text);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.character-tabs :deep(.el-tabs__item.is-active) .tab-count {
  background: var(--accent);
  color: var(--accent-on);
}

.tabs-actions {
  display: flex;
  gap: 12px;
}

.tabs-actions :deep(.el-button) {
  border-radius: 8px;
  min-height: 44px;
}

/* Batch mode */
.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: var(--bg-subtle);
  border-radius: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.batch-count {
  font-size: 14px;
  font-weight: 500;
  color: var(--accent-text);
  margin-right: auto;
}
.batch-actions :deep(.el-button) { min-height: 44px; margin: 0; }

.batch-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  background: var(--bg-surface);
  padding: 6px;
  border-radius: 6px;
}

.character-card-wrapper.batch-selected {
  outline: 2px solid var(--accent);
  border-radius: 16px;
}

/* 角色区域 */
.characters-section {
  flex: 1;
  min-height: 400px;
}

.characters-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

/* 角色卡片包装器 */
.character-card-wrapper {
  position: relative;
  min-width: 0;
}

/* 平板端适配 (3列) */
@include between(md, lg) {
  .characters-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
}

/* 移动端适配 (1列) */
@include below(lg) {
  .library-intro { align-items: flex-start; flex-direction: column; gap: 20px; }
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

}

/* 小屏手机适配 (1列) */
@include below(sm) {
  .library-intro { gap: 12px; padding: 0 0 20px; }
  .library-eyebrow { display: none; }
  .library-intro h1 { margin-bottom: 8px; }
  .library-search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 12px 0; }
  .library-tools summary { padding-inline: 0; font-size: 12px; }
  .story-shortcuts { flex-direction: column; gap: 0; }
  .library-entry-actions { width: 100%; }
  .library-entry-actions :deep(.el-button) { flex: 1; }
  .my-characters-layout { gap: 12px; }
  .tabs-section { flex-direction: row; align-items: center; gap: 8px; padding-bottom: 8px; margin-bottom: 10px; }
  .tabs-actions { width: auto; flex-shrink: 0; }
  .tabs-actions .el-button { flex: unset; }
  .character-tabs { min-width: 0; }
  .character-tabs :deep(.el-tabs__item) { font-size: 13px; padding: 0 10px; }
  .library-privacy { margin-bottom: 16px; }
  .characters-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 小平板端适配 */
@include between(md, lg) {
  .tabs-section {
    padding: 12px 16px;
  }
}
</style>
