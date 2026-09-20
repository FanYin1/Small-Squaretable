<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Plus, Edit, Delete, Search, Upload } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { useToast } from '@client/composables/useToast';
import { worldbookApi } from '@client/services/worldbook.api';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';

const router = useRouter();
const { t } = useI18n();
const toast = useToast();

interface WorldBook {
  id: string;
  name: string;
  description: string | null;
  scope: 'global' | 'character' | 'persona' | 'chat';
  isEnabled: boolean;
  entriesCount?: number;
  createdAt: string;
}

const worldbooks = ref<WorldBook[]>([]);
const loading = ref(false);
const searchQuery = ref('');

// Dialog state
const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingId = ref<string | null>(null);
const form = ref({ name: '', scope: 'global' as WorldBook['scope'], description: '' });
const submitting = ref(false);

const scopeOptions = [
  { value: 'global', label: () => t('worldBooks.scopeGlobal') },
  { value: 'persona', label: () => t('worldBooks.scopePersona') },
  { value: 'character', label: () => t('worldBooks.scopeCharacter') },
  { value: 'chat', label: () => t('worldBooks.scopeChat') },
];

onMounted(() => fetchWorldBooks());

async function fetchWorldBooks() {
  loading.value = true;
  try {
    const data = await worldbookApi.list();
    worldbooks.value = Array.isArray(data) ? (data as WorldBook[]) : [];
  } catch {
    toast.error(t('worldBooks.loadFailed'));
  } finally {
    loading.value = false;
  }
}

const filteredBooks = computed(() => {
  if (!searchQuery.value) return worldbooks.value;
  const q = searchQuery.value.toLowerCase();
  return worldbooks.value.filter(b => b.name.toLowerCase().includes(q));
});

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function scopeTagType(scope: string) {
  const map: Record<string, string> = { global: '', character: 'success', persona: 'warning', chat: 'info' };
  return map[scope] || '';
}

function openCreate() {
  dialogMode.value = 'create';
  editingId.value = null;
  form.value = { name: '', scope: 'global', description: '' };
  dialogVisible.value = true;
}

function openEdit(book: WorldBook) {
  dialogMode.value = 'edit';
  editingId.value = book.id;
  form.value = { name: book.name, scope: book.scope, description: book.description || '' };
  dialogVisible.value = true;
}

function openDetail(book: WorldBook) {
  router.push({ name: 'WorldBookDetail', params: { id: book.id } });
}

async function handleSubmit() {
  if (!form.value.name.trim()) {
    toast.error(t('worldBooks.nameRequired'));
    return;
  }
  submitting.value = true;
  try {
    if (dialogMode.value === 'create') {
      await worldbookApi.create(form.value);
      toast.success(t('worldBooks.created'));
    } else {
      await worldbookApi.update(editingId.value!, form.value);
      toast.success(t('common.save'));
    }
    dialogVisible.value = false;
    await fetchWorldBooks();
  } catch {
    toast.error(t('worldBooks.createFailed'));
  } finally {
    submitting.value = false;
  }
}

async function toggleEnabled(book: WorldBook) {
  try {
    await worldbookApi.update(book.id, { isEnabled: book.isEnabled });
    toast.success(book.isEnabled ? t('worldBooks.enabled') : t('worldBooks.disabled'));
  } catch {
    book.isEnabled = !book.isEnabled;
    toast.error(t('worldBooks.operationFailed'));
  }
}

async function handleDelete(book: WorldBook) {
  try {
    await ElMessageBox.confirm(
      t('worldBooks.deleteConfirm', { name: book.name }),
      t('worldBooks.deleteTitle'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    );
    await worldbookApi.delete(book.id);
    toast.success(t('worldBooks.deleted'));
    await fetchWorldBooks();
  } catch (e) {
    if (e !== 'cancel') toast.error(t('worldBooks.deleteFailed'));
  }
}

const importFileRef = ref<HTMLInputElement | null>(null);

function triggerImportFile() {
  importFileRef.value?.click();
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const result = await worldbookApi.importFile(data);
    toast.success(t('worldBooks.importSuccess', { count: (result as any)?.imported ?? 0 }));
    await fetchWorldBooks();
  } catch {
    toast.error(t('worldBooks.importFailed'));
  } finally {
    input.value = '';
  }
}
</script>

<template>
  <DashboardLayout>
    <template #title>{{ t('worldBooks.title') }}</template>
    <template #subtitle>{{ t('worldBooks.subtitle') }}</template>
    <template #actions>
      <el-button :icon="Upload" @click="triggerImportFile">
        {{ t('worldBooks.importFile') }}
      </el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">
        {{ t('worldBooks.createNew') }}
      </el-button>
      <input
        ref="importFileRef"
        type="file"
        accept=".json"
        style="display: none"
        @change="handleImportFile"
      />
    </template>

    <div class="worldbooks-page">
      <div class="toolbar">
        <el-input
          v-model="searchQuery"
          :placeholder="t('common.search')"
          :prefix-icon="Search"
          clearable
          class="search-input"
        />
      </div>

      <el-table
        v-loading="loading"
        :data="filteredBooks"
        stripe
        class="worldbooks-table"
        :empty-text="t('worldBooks.empty')"
      >
        <el-table-column prop="name" :label="t('worldBooks.name')" min-width="180">
          <template #default="{ row }">
            <el-link type="primary" underline="never" @click="openDetail(row)">
              {{ row.name }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column :label="t('worldBookEditor.entryCount')" width="100" align="center">
          <template #default="{ row }">
            {{ row.entriesCount ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="scope" :label="t('worldBooks.scope')" width="120">
          <template #default="{ row }">
            <el-tag :type="scopeTagType(row.scope)" size="small">
              {{ t(`worldBooks.scope${capitalize(row.scope)}`) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('mfa.enabled')" width="100" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.isEnabled" @change="toggleEnabled(row)" />
          </template>
        </el-table-column>
        <el-table-column :label="t('common.edit')" width="120" align="center">
          <template #default="{ row }">
            <el-button text :icon="Edit" @click="openEdit(row)" />
            <el-button text :icon="Delete" type="danger" @click="handleDelete(row)" />
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? t('worldBooks.createWorldBook') : t('common.edit')"
      width="480px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('worldBooks.name')" required>
          <el-input v-model="form.name" :placeholder="t('worldBooks.enterName')" />
        </el-form-item>
        <el-form-item :label="t('worldBooks.scope')">
          <el-select v-model="form.scope" style="width: 100%">
            <el-option
              v-for="opt in scopeOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label()"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('worldBooks.descriptionLabel')">
          <el-input v-model="form.description" type="textarea" :rows="3" :placeholder="t('worldBooks.enterDescription')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ dialogMode === 'create' ? t('common.create') : t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </DashboardLayout>
</template>

<style scoped>
.worldbooks-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.toolbar {
  display: flex;
  gap: 12px;
}

.search-input {
  max-width: 320px;
}

.worldbooks-table {
  border-radius: 8px;
  overflow: hidden;
}

.worldbooks-table :deep(.el-link) {
  font-weight: 500;
}

@media (max-width: 640px) {
  .search-input {
    max-width: 100%;
  }
}
</style>
