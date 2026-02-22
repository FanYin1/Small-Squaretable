<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Plus, ArrowLeft, Search, Delete, Edit, Check, Download, Upload } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { useToast } from '@client/composables/useToast';
import { useWorldBookStore } from '@client/stores/worldbook';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import type { WorldBookEntry, CreateEntryInput } from '@client/services/worldbook.api';
import { worldbookApi } from '@client/services/worldbook.api';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const toast = useToast();
const store = useWorldBookStore();

const worldbookId = computed(() => route.params.id as string);

// Header inline edit
const editingName = ref(false);
const nameInput = ref('');

// Search / filter
const searchQuery = ref('');

// Expanded entry editor
const expandedEntryId = ref<string | null>(null);

// New entry form
const showNewEntry = ref(false);

// Entry form state
interface EntrySettings {
  keys: string[];
  keysSecondary: string[];
  selectiveLogic: number;
  comment: string;
  depth: number;
  order: number;
  constant: boolean;
  probability: number;
  sticky: number;
  cooldown: number;
  delay: number;
  caseSensitive: boolean;
  matchWholeWords: boolean;
  preventRecursion: boolean;
  excludeRecursion: boolean;
}

interface EntryForm {
  keyword: string;
  content: string;
  position: number;
  priority: number;
  isEnabled: boolean;
  settings: EntrySettings;
}

const defaultSettings = (): EntrySettings => ({
  keys: [], keysSecondary: [], selectiveLogic: 0, comment: '', depth: 4, order: 100,
  constant: false, probability: 100, sticky: 0, cooldown: 0, delay: 0,
  caseSensitive: false, matchWholeWords: false, preventRecursion: false, excludeRecursion: false,
});

const defaultEntryForm = (): EntryForm => ({
  keyword: '', content: '', position: 0, priority: 10, isEnabled: true, settings: defaultSettings(),
});

const newEntryForm = ref<EntryForm>(defaultEntryForm());
const editForms = ref<Record<string, EntryForm>>({});
const newKeywordInput = ref('');
const newSecKeywordInput = ref('');
const editKeywordInput = ref('');
const editSecKeywordInput = ref('');

const positionOptions = [
  { value: 0, label: () => t('worldBookEditor.pos0') },
  { value: 1, label: () => t('worldBookEditor.pos1') },
  { value: 2, label: () => t('worldBookEditor.pos2') },
  { value: 3, label: () => t('worldBookEditor.pos3') },
  { value: 4, label: () => t('worldBookEditor.pos4') },
  { value: 5, label: () => t('worldBookEditor.pos5') },
  { value: 6, label: () => t('worldBookEditor.pos6') },
];

const selectiveLogicOptions = [
  { value: 0, label: () => t('worldBookEditor.logicAndAny') },
  { value: 1, label: () => t('worldBookEditor.logicAndAll') },
  { value: 2, label: () => t('worldBookEditor.logicNotAny') },
  { value: 3, label: () => t('worldBookEditor.logicNotAll') },
];

// Computed
const filteredEntries = computed(() => {
  if (!searchQuery.value) return store.entries;
  const q = searchQuery.value.toLowerCase();
  return store.entries.filter((e) => {
    const s = e.settings as Partial<EntrySettings> | undefined;
    const keys = s?.keys || [];
    const comment = s?.comment || '';
    return e.keyword.toLowerCase().includes(q) || e.content.toLowerCase().includes(q) ||
      comment.toLowerCase().includes(q) || keys.some((k) => k.toLowerCase().includes(q));
  });
});

function scopeTagType(scope: string) {
  const map: Record<string, string> = { global: '', character: 'success', persona: 'warning', chat: 'info' };
  return map[scope] || '';
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function getPositionLabel(pos: number): string { return t(`worldBookEditor.pos${pos}`); }

function getEntryKeywords(entry: WorldBookEntry): string[] {
  const s = entry.settings as Partial<EntrySettings> | undefined;
  return s?.keys?.length ? s.keys : entry.keyword ? entry.keyword.split(',').map((k) => k.trim()).filter(Boolean) : [];
}

function getEntryComment(entry: WorldBookEntry): string {
  return (entry.settings as Partial<EntrySettings>)?.comment || '';
}

function truncate(content: string, max = 100): string {
  return content.length > max ? content.slice(0, max) + '...' : content;
}

function entryToForm(entry: WorldBookEntry): EntryForm {
  const s = entry.settings as Partial<EntrySettings> | undefined;
  const keys = s?.keys || (entry.keyword ? entry.keyword.split(',').map((k) => k.trim()).filter(Boolean) : []);
  return {
    keyword: entry.keyword, content: entry.content, position: entry.position,
    priority: entry.priority, isEnabled: entry.isEnabled,
    settings: { ...defaultSettings(), ...s, keys, keysSecondary: s?.keysSecondary || [] },
  };
}

function formToInput(form: EntryForm): CreateEntryInput & { isEnabled: boolean } {
  return {
    keyword: form.settings.keys.join(', '), content: form.content, position: form.position,
    priority: form.priority, isEnabled: form.isEnabled, settings: { ...form.settings },
  };
}

// Keyword helpers
function addKw(form: EntryForm, val: string, target: 'keys' | 'keysSecondary') {
  const v = val.trim();
  if (v && !form.settings[target].includes(v)) form.settings[target].push(v);
}

function removeKw(form: EntryForm, idx: number, target: 'keys' | 'keysSecondary') {
  form.settings[target].splice(idx, 1);
}

// Lifecycle
onMounted(async () => {
  await Promise.all([store.fetchWorldBook(worldbookId.value), store.fetchEntries(worldbookId.value)]);
  if (store.currentWorldBook) nameInput.value = store.currentWorldBook.name;
});

watch(() => store.currentWorldBook?.name, (name) => { if (name) nameInput.value = name; });

function goBack() { router.push({ name: 'WorldBooks' }); }

async function saveName() {
  if (!nameInput.value.trim()) { toast.error(t('worldBooks.nameRequired')); return; }
  try {
    await store.updateWorldBook(worldbookId.value, { name: nameInput.value.trim() });
    editingName.value = false;
    toast.success(t('common.save'));
  } catch { toast.error(t('worldBooks.operationFailed')); }
}

async function toggleWbEnabled(val: boolean) {
  try {
    await store.updateWorldBook(worldbookId.value, { isEnabled: val });
    toast.success(val ? t('worldBooks.enabled') : t('worldBooks.disabled'));
  } catch { toast.error(t('worldBooks.operationFailed')); }
}

function openNewEntry() {
  showNewEntry.value = true;
  newEntryForm.value = defaultEntryForm();
  expandedEntryId.value = null;
}

async function saveNewEntry() {
  const f = newEntryForm.value;
  if (!f.settings.constant && f.settings.keys.length === 0) { toast.error(t('worldBookEditor.keywordRequired')); return; }
  if (!f.content.trim()) { toast.error(t('worldBookEditor.contentRequired')); return; }
  try {
    await store.createEntry(worldbookId.value, formToInput(f));
    toast.success(t('worldBookEditor.entryCreated'));
    showNewEntry.value = false;
    newEntryForm.value = defaultEntryForm();
  } catch { toast.error(t('worldBookEditor.saveFailed')); }
}

function toggleEditEntry(entry: WorldBookEntry) {
  if (expandedEntryId.value === entry.id) { expandedEntryId.value = null; delete editForms.value[entry.id]; return; }
  showNewEntry.value = false;
  expandedEntryId.value = entry.id;
  editForms.value[entry.id] = entryToForm(entry);
}

async function saveEditEntry(entryId: string) {
  const f = editForms.value[entryId];
  if (!f) return;
  if (!f.settings.constant && f.settings.keys.length === 0) { toast.error(t('worldBookEditor.keywordRequired')); return; }
  if (!f.content.trim()) { toast.error(t('worldBookEditor.contentRequired')); return; }
  try {
    await store.updateEntry(worldbookId.value, entryId, formToInput(f));
    toast.success(t('worldBookEditor.entryUpdated'));
    expandedEntryId.value = null;
    delete editForms.value[entryId];
  } catch { toast.error(t('worldBookEditor.saveFailed')); }
}

async function toggleEntryEnabled(entry: WorldBookEntry) {
  try { await store.updateEntry(worldbookId.value, entry.id, { isEnabled: entry.isEnabled }); }
  catch { entry.isEnabled = !entry.isEnabled; toast.error(t('worldBookEditor.operationFailed')); }
}

async function handleDeleteEntry(entry: WorldBookEntry) {
  try {
    await ElMessageBox.confirm(t('worldBookEditor.deleteConfirm'), t('worldBookEditor.deleteTitle'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' });
    await store.deleteEntry(worldbookId.value, entry.id);
    toast.success(t('worldBookEditor.entryDeleted'));
    if (expandedEntryId.value === entry.id) expandedEntryId.value = null;
  } catch (e) { if (e !== 'cancel') toast.error(t('worldBookEditor.deleteFailed')); }
}

// Import / Export
const importFileInput = ref<HTMLInputElement | null>(null);

async function handleExport() {
  try {
    const data = await worldbookApi.exportWorldBook(worldbookId.value);
    const name = store.currentWorldBook?.name || 'worldbook';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('worldBookEditor.exportSuccess', 'Export successful'));
  } catch {
    toast.error(t('worldBookEditor.exportFailed', 'Export failed'));
  }
}

function triggerImport() {
  importFileInput.value?.click();
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await worldbookApi.importEntries(worldbookId.value, data);
    await store.fetchEntries(worldbookId.value);
    toast.success(t('worldBookEditor.importSuccess', 'Import successful'));
  } catch {
    toast.error(t('worldBookEditor.importFailed', 'Import failed'));
  } finally {
    input.value = '';
  }
}
</script>

<template>
  <DashboardLayout>
    <template #title>
      <div class="header-title">
        <el-button text :icon="ArrowLeft" @click="goBack" />
        <template v-if="!editingName">
          <span class="wb-name" @dblclick="editingName = true">
            {{ store.currentWorldBook?.name || t('common.loading') }}
          </span>
          <el-button text :icon="Edit" size="small" @click="editingName = true" />
        </template>
        <template v-else>
          <el-input v-model="nameInput" size="small" class="name-edit-input"
            @keyup.enter="saveName" @keyup.escape="editingName = false" />
          <el-button text :icon="Check" size="small" @click="saveName" />
        </template>
        <el-tag v-if="store.currentWorldBook" :type="scopeTagType(store.currentWorldBook.scope)"
          size="small" class="scope-tag">
          {{ t(`worldBooks.scope${capitalize(store.currentWorldBook.scope)}`) }}
        </el-tag>
        <el-switch v-if="store.currentWorldBook" :model-value="store.currentWorldBook.isEnabled"
          @change="toggleWbEnabled($event as boolean)" style="margin-left: 8px" />
      </div>
    </template>
    <template #actions>
      <el-button :icon="Upload" @click="triggerImport">
        {{ t('worldBookEditor.import', 'Import') }}
      </el-button>
      <el-button :icon="Download" @click="handleExport">
        {{ t('worldBookEditor.export', 'Export') }}
      </el-button>
      <el-button type="primary" :icon="Plus" @click="openNewEntry">
        {{ t('worldBookEditor.addEntry') }}
      </el-button>
      <input ref="importFileInput" type="file" accept=".json" style="display: none"
        @change="handleImportFile" />
    </template>

    <div class="worldbook-detail" v-loading="store.loading">
      <div class="toolbar">
        <el-input v-model="searchQuery" :placeholder="t('worldBookEditor.searchEntries')"
          :prefix-icon="Search" clearable class="search-input" />
        <span class="entry-count">{{ filteredEntries.length }} {{ t('worldBookEditor.entryCount') }}</span>
      </div>

      <!-- New Entry Form -->
      <el-card v-if="showNewEntry" class="editor-card" shadow="hover">
        <template #header>
          <div class="editor-header">
            <span>{{ t('worldBookEditor.addEntry') }}</span>
            <div>
              <el-button size="small" @click="showNewEntry = false">{{ t('common.cancel') }}</el-button>
              <el-button type="primary" size="small" @click="saveNewEntry">{{ t('common.save') }}</el-button>
            </div>
          </div>
        </template>
        <!-- Inline form fields for new entry -->
        <el-form label-position="top" class="entry-form">
          <!-- FORM_TRIGGER_NEW -->
          <div class="form-section">
            <h4>{{ t('worldBookEditor.primaryKeys') }}</h4>
            <div class="keyword-tags">
              <el-tag v-for="(kw, ki) in newEntryForm.settings.keys" :key="ki" closable size="small"
                @close="removeKw(newEntryForm, ki, 'keys')">{{ kw }}</el-tag>
              <el-input v-model="newKeywordInput" size="small" class="keyword-input"
                :placeholder="t('worldBookEditor.keywordHint')"
                @keyup.enter="addKw(newEntryForm, newKeywordInput, 'keys'); newKeywordInput = ''" />
            </div>
          </div>
          <div class="form-section">
            <h4>{{ t('worldBookEditor.secondaryKeys') }}</h4>
            <div class="keyword-tags">
              <el-tag v-for="(kw, ki) in newEntryForm.settings.keysSecondary" :key="ki" closable size="small"
                @close="removeKw(newEntryForm, ki, 'keysSecondary')">{{ kw }}</el-tag>
              <el-input v-model="newSecKeywordInput" size="small" class="keyword-input"
                :placeholder="t('worldBookEditor.secondaryKeysOptional')"
                @keyup.enter="addKw(newEntryForm, newSecKeywordInput, 'keysSecondary'); newSecKeywordInput = ''" />
            </div>
            <el-form-item :label="t('worldBookEditor.triggerMode')" style="margin-top: 8px">
              <el-select v-model="newEntryForm.settings.selectiveLogic" style="width: 100%">
                <el-option v-for="opt in selectiveLogicOptions" :key="opt.value"
                  :value="opt.value" :label="opt.label()" />
              </el-select>
            </el-form-item>
          </div>
          <!-- FORM_CONTENT_NEW -->
          <div class="form-section">
            <el-form-item :label="t('worldBookEditor.comment')">
              <el-input v-model="newEntryForm.settings.comment"
                :placeholder="t('worldBookEditor.commentPlaceholder')" />
            </el-form-item>
            <el-form-item :label="t('worldBookEditor.content')">
              <el-input v-model="newEntryForm.content" type="textarea" :rows="5"
                :placeholder="t('worldBookEditor.contentPlaceholder')" />
            </el-form-item>
          </div>
          <div class="form-section">
            <h4>{{ t('worldBookEditor.injectionSettings') }}</h4>
            <el-form-item :label="t('worldBookEditor.position')">
              <el-select v-model="newEntryForm.position" style="width: 100%">
                <el-option v-for="opt in positionOptions" :key="opt.value"
                  :value="opt.value" :label="opt.label()" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="newEntryForm.position === 4" :label="t('worldBookEditor.depth')">
              <el-input-number v-model="newEntryForm.settings.depth" :min="0" :max="999" />
            </el-form-item>
            <el-form-item :label="t('worldBookEditor.priority')">
              <el-input-number v-model="newEntryForm.priority" :min="0" :max="999" />
            </el-form-item>
            <el-form-item label="Insertion Order">
              <el-input-number v-model="newEntryForm.settings.order" :min="0" :max="9999" />
            </el-form-item>
          </div>
          <div class="form-section">
            <h4>{{ t('worldBookEditor.timingControl') }}</h4>
            <el-form-item :label="t('worldBookEditor.constantEntry')">
              <el-switch v-model="newEntryForm.settings.constant" />
            </el-form-item>
            <el-form-item :label="t('worldBookEditor.probability')">
              <el-slider v-model="newEntryForm.settings.probability" :min="0" :max="100" show-input />
            </el-form-item>
            <el-form-item :label="t('worldBookEditor.sticky')">
              <el-input-number v-model="newEntryForm.settings.sticky" :min="0" :max="999" />
            </el-form-item>
            <el-form-item :label="t('worldBookEditor.cooldown')">
              <el-input-number v-model="newEntryForm.settings.cooldown" :min="0" :max="999" />
            </el-form-item>
            <el-form-item :label="t('worldBookEditor.delay')">
              <el-input-number v-model="newEntryForm.settings.delay" :min="0" :max="999" />
            </el-form-item>
          </div>
          <div class="form-section">
            <h4>{{ t('worldBookEditor.matchOptions') }}</h4>
            <el-form-item :label="t('worldBookEditor.caseSensitive')">
              <el-switch v-model="newEntryForm.settings.caseSensitive" />
            </el-form-item>
            <el-form-item :label="t('worldBookEditor.matchWholeWords')">
              <el-switch v-model="newEntryForm.settings.matchWholeWords" />
            </el-form-item>
          </div>
          <div class="form-section">
            <h4>{{ t('worldBookEditor.recursionControl') }}</h4>
            <el-form-item :label="t('worldBookEditor.preventRecursionLabel')">
              <el-switch v-model="newEntryForm.settings.preventRecursion" />
            </el-form-item>
            <el-form-item :label="t('worldBookEditor.excludeRecursionLabel')">
              <el-switch v-model="newEntryForm.settings.excludeRecursion" />
            </el-form-item>
          </div>
        </el-form>
      </el-card>

      <!-- Empty state -->
      <div v-if="filteredEntries.length === 0 && !store.entriesLoading && !showNewEntry" class="empty-state">
        <p>{{ t('worldBookEditor.noEntries') }}</p>
        <el-button type="primary" :icon="Plus" @click="openNewEntry">
          {{ t('worldBookEditor.addFirstEntry') }}
        </el-button>
      </div>

      <!-- Entry list -->
      <div class="entry-list" v-loading="store.entriesLoading">
        <el-card v-for="entry in filteredEntries" :key="entry.id" class="entry-card" shadow="hover">
          <!-- Summary row -->
          <div class="entry-summary" v-if="expandedEntryId !== entry.id">
            <div class="entry-keywords">
              <el-tag v-for="(kw, ki) in getEntryKeywords(entry)" :key="ki" size="small"
                class="keyword-tag">{{ kw }}</el-tag>
              <span v-if="getEntryKeywords(entry).length === 0" class="unnamed">
                {{ getEntryComment(entry) || t('worldBookEditor.unnamed') }}
              </span>
            </div>
            <div class="entry-meta">
              <span class="content-preview">{{ truncate(entry.content) }}</span>
              <el-tag size="small" type="info">{{ getPositionLabel(entry.position) }}</el-tag>
              <el-tag size="small" type="warning">P{{ entry.priority }}</el-tag>
              <el-switch v-model="entry.isEnabled" size="small" @change="toggleEntryEnabled(entry)" />
              <el-button text :icon="Edit" size="small" @click="toggleEditEntry(entry)" />
              <el-button text :icon="Delete" size="small" type="danger" @click="handleDeleteEntry(entry)" />
            </div>
          </div>

          <!-- Inline editor -->
          <div v-if="expandedEntryId === entry.id && editForms[entry.id]" class="entry-editor-inline">
            <div class="editor-header">
              <span>{{ t('worldBookEditor.editEntry') }}</span>
              <div>
                <el-button size="small" @click="toggleEditEntry(entry)">{{ t('common.cancel') }}</el-button>
                <el-button type="primary" size="small" @click="saveEditEntry(entry.id)">{{ t('common.save') }}</el-button>
              </div>
            </div>
            <el-form label-position="top" class="entry-form">
              <div class="form-section">
                <h4>{{ t('worldBookEditor.primaryKeys') }}</h4>
                <div class="keyword-tags">
                  <el-tag v-for="(kw, ki) in editForms[entry.id].settings.keys" :key="ki" closable size="small"
                    @close="removeKw(editForms[entry.id], ki, 'keys')">{{ kw }}</el-tag>
                  <el-input v-model="editKeywordInput" size="small" class="keyword-input"
                    :placeholder="t('worldBookEditor.keywordHint')"
                    @keyup.enter="addKw(editForms[entry.id], editKeywordInput, 'keys'); editKeywordInput = ''" />
                </div>
              </div>
              <div class="form-section">
                <h4>{{ t('worldBookEditor.secondaryKeys') }}</h4>
                <div class="keyword-tags">
                  <el-tag v-for="(kw, ki) in editForms[entry.id].settings.keysSecondary" :key="ki" closable size="small"
                    @close="removeKw(editForms[entry.id], ki, 'keysSecondary')">{{ kw }}</el-tag>
                  <el-input v-model="editSecKeywordInput" size="small" class="keyword-input"
                    :placeholder="t('worldBookEditor.secondaryKeysOptional')"
                    @keyup.enter="addKw(editForms[entry.id], editSecKeywordInput, 'keysSecondary'); editSecKeywordInput = ''" />
                </div>
                <el-form-item :label="t('worldBookEditor.triggerMode')" style="margin-top: 8px">
                  <el-select v-model="editForms[entry.id].settings.selectiveLogic" style="width: 100%">
                    <el-option v-for="opt in selectiveLogicOptions" :key="opt.value"
                      :value="opt.value" :label="opt.label()" />
                  </el-select>
                </el-form-item>
              </div>
              <div class="form-section">
                <el-form-item :label="t('worldBookEditor.comment')">
                  <el-input v-model="editForms[entry.id].settings.comment"
                    :placeholder="t('worldBookEditor.commentPlaceholder')" />
                </el-form-item>
                <el-form-item :label="t('worldBookEditor.content')">
                  <el-input v-model="editForms[entry.id].content" type="textarea" :rows="5"
                    :placeholder="t('worldBookEditor.contentPlaceholder')" />
                </el-form-item>
              </div>
              <div class="form-section">
                <h4>{{ t('worldBookEditor.injectionSettings') }}</h4>
                <el-form-item :label="t('worldBookEditor.position')">
                  <el-select v-model="editForms[entry.id].position" style="width: 100%">
                    <el-option v-for="opt in positionOptions" :key="opt.value"
                      :value="opt.value" :label="opt.label()" />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="editForms[entry.id].position === 4" :label="t('worldBookEditor.depth')">
                  <el-input-number v-model="editForms[entry.id].settings.depth" :min="0" :max="999" />
                </el-form-item>
                <el-form-item :label="t('worldBookEditor.priority')">
                  <el-input-number v-model="editForms[entry.id].priority" :min="0" :max="999" />
                </el-form-item>
                <el-form-item label="Insertion Order">
                  <el-input-number v-model="editForms[entry.id].settings.order" :min="0" :max="9999" />
                </el-form-item>
              </div>
              <div class="form-section">
                <h4>{{ t('worldBookEditor.timingControl') }}</h4>
                <el-form-item :label="t('worldBookEditor.constantEntry')">
                  <el-switch v-model="editForms[entry.id].settings.constant" />
                </el-form-item>
                <el-form-item :label="t('worldBookEditor.probability')">
                  <el-slider v-model="editForms[entry.id].settings.probability" :min="0" :max="100" show-input />
                </el-form-item>
                <el-form-item :label="t('worldBookEditor.sticky')">
                  <el-input-number v-model="editForms[entry.id].settings.sticky" :min="0" :max="999" />
                </el-form-item>
                <el-form-item :label="t('worldBookEditor.cooldown')">
                  <el-input-number v-model="editForms[entry.id].settings.cooldown" :min="0" :max="999" />
                </el-form-item>
                <el-form-item :label="t('worldBookEditor.delay')">
                  <el-input-number v-model="editForms[entry.id].settings.delay" :min="0" :max="999" />
                </el-form-item>
              </div>
              <div class="form-section">
                <h4>{{ t('worldBookEditor.matchOptions') }}</h4>
                <el-form-item :label="t('worldBookEditor.caseSensitive')">
                  <el-switch v-model="editForms[entry.id].settings.caseSensitive" />
                </el-form-item>
                <el-form-item :label="t('worldBookEditor.matchWholeWords')">
                  <el-switch v-model="editForms[entry.id].settings.matchWholeWords" />
                </el-form-item>
              </div>
              <div class="form-section">
                <h4>{{ t('worldBookEditor.recursionControl') }}</h4>
                <el-form-item :label="t('worldBookEditor.preventRecursionLabel')">
                  <el-switch v-model="editForms[entry.id].settings.preventRecursion" />
                </el-form-item>
                <el-form-item :label="t('worldBookEditor.excludeRecursionLabel')">
                  <el-switch v-model="editForms[entry.id].settings.excludeRecursion" />
                </el-form-item>
              </div>
            </el-form>
          </div>
        </el-card>
      </div>
    </div>
  </DashboardLayout>
</template>
<style scoped>
.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.wb-name {
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
}

.name-edit-input {
  max-width: 240px;
}

.scope-tag {
  margin-left: 4px;
}

.worldbook-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  max-width: 320px;
}

.entry-count {
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
}

.editor-card {
  border: 2px solid var(--el-color-primary-light-5);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.entry-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-section {
  padding: 8px 0;
  border-bottom: 1px solid var(--border-default);
}

.form-section:last-child {
  border-bottom: none;
}

.form-section h4 {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.keyword-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.keyword-input {
  max-width: 220px;
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entry-card {
  transition: all 0.2s ease;
}

.entry-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entry-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.keyword-tag {
  font-size: 12px;
}

.unnamed {
  color: var(--text-secondary);
  font-style: italic;
  font-size: 13px;
}

.entry-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.content-preview {
  flex: 1;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-editor-inline {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-secondary);
}

@media (max-width: 640px) {
  .search-input {
    max-width: 100%;
  }

  .entry-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .keyword-input {
    max-width: 100%;
  }
}
</style>
