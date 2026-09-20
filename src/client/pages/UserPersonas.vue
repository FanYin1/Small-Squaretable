<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Edit, Delete, Search, Star, StarFilled, InfoFilled } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { useToast } from '@client/composables/useToast';
import { userPersonaApi, type UserPersona, type CreatePersonaInput, type UpdatePersonaInput } from '@client/services/user-persona.api';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';

const { t } = useI18n();
const toast = useToast();

const personas = ref<UserPersona[]>([]);
const loading = ref(false);
const searchQuery = ref('');

// Dialog state
const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingId = ref<string | null>(null);
const form = ref<CreatePersonaInput>({
  name: '',
  description: '',
  avatarUrl: '',
  metadata: {},
  isDefault: false,
});
const submitting = ref(false);

// Metadata editor state
const metadataKey = ref('');
const metadataValue = ref('');

// Detail dialog
const detailDialogVisible = ref(false);
const detailPersona = ref<UserPersona | null>(null);

onMounted(() => fetchPersonas());

async function fetchPersonas() {
  loading.value = true;
  try {
    personas.value = await userPersonaApi.list();
  } catch {
    toast.error(t('personas.loadFailed'));
  } finally {
    loading.value = false;
  }
}

const filteredPersonas = computed(() => {
  if (!searchQuery.value) return personas.value;
  const q = searchQuery.value.toLowerCase();
  return personas.value.filter(p => p.name.toLowerCase().includes(q));
});

function openCreate() {
  dialogMode.value = 'create';
  editingId.value = null;
  form.value = {
    name: '',
    description: '',
    avatarUrl: '',
    metadata: {},
    isDefault: false,
  };
  dialogVisible.value = true;
}

function openEdit(persona: UserPersona) {
  dialogMode.value = 'edit';
  editingId.value = persona.id;
  form.value = {
    name: persona.name,
    description: persona.description || '',
    avatarUrl: persona.avatarUrl || '',
    metadata: { ...persona.metadata } || {},
    isDefault: persona.isDefault,
  };
  dialogVisible.value = true;
}

function openDetail(persona: UserPersona) {
  detailPersona.value = persona;
  detailDialogVisible.value = true;
}

// Metadata management
function addMetadata() {
  if (!metadataKey.value.trim() || !metadataValue.value.trim()) {
    toast.error(t('personas.metadataRequired'));
    return;
  }
  if (!form.value.metadata) {
    form.value.metadata = {};
  }
  form.value.metadata[metadataKey.value.trim()] = metadataValue.value.trim();
  metadataKey.value = '';
  metadataValue.value = '';
}

function removeMetadata(key: string) {
  if (form.value.metadata) {
    delete form.value.metadata[key];
  }
}

const metadataEntries = computed(() => {
  if (!form.value.metadata) return [];
  return Object.entries(form.value.metadata);
});

async function handleSubmit() {
  if (!form.value.name.trim()) {
    toast.error(t('personas.nameRequired'));
    return;
  }
  submitting.value = true;
  try {
    if (dialogMode.value === 'create') {
      await userPersonaApi.create(form.value);
      toast.success(t('personas.created'));
    } else if (editingId.value) {
      await userPersonaApi.update(editingId.value, form.value);
      toast.success(t('personas.updated'));
    }
    dialogVisible.value = false;
    await fetchPersonas();
  } catch (error: any) {
    toast.error(error.message || t('personas.saveFailed'));
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(persona: UserPersona) {
  try {
    await ElMessageBox.confirm(
      t('personas.deleteConfirm', { name: persona.name }),
      t('common.warning'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );
    await userPersonaApi.delete(persona.id);
    toast.success(t('personas.deleted'));
    await fetchPersonas();
  } catch (error: any) {
    if (error !== 'cancel') {
      toast.error(error.message || t('personas.deleteFailed'));
    }
  }
}

async function handleSetDefault(persona: UserPersona) {
  if (persona.isDefault) return;
  try {
    await userPersonaApi.setDefault(persona.id);
    toast.success(t('personas.defaultSet'));
    await fetchPersonas();
  } catch (error: any) {
    toast.error(error.message || t('personas.setDefaultFailed'));
  }
}

// Quick templates for common persona types
function applyTemplate(template: 'commander' | 'scientist' | 'pilot' | 'engineer') {
  const templates = {
    commander: {
      metadata: {
        age: '32',
        gender: '男性',
        rank: '上校',
        affiliation: '蔚蓝星域联邦',
        specialization: '战术指挥',
      }
    },
    scientist: {
      metadata: {
        age: '28',
        gender: '女性',
        rank: '研究员',
        affiliation: '星际科学院',
        specialization: '量子物理',
      }
    },
    pilot: {
      metadata: {
        age: '25',
        gender: '男性',
        rank: '中尉',
        affiliation: '星际舰队',
        specialization: '战斗机驾驶',
      }
    },
    engineer: {
      metadata: {
        age: '30',
        gender: '女性',
        rank: '工程师',
        affiliation: '技术部',
        specialization: '舰船维护',
      }
    }
  };

  form.value.metadata = { ...templates[template].metadata };
  toast.success(t('personas.templateApplied'));
}
</script>

<template>
  <DashboardLayout>
    <div class="personas-page">
      <div class="page-header">
        <div>
          <h1>{{ t('personas.title') }}</h1>
          <p class="subtitle">{{ t('personas.subtitle') }}</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="openCreate">
          {{ t('personas.create') }}
        </el-button>
      </div>

      <div class="toolbar">
        <el-input
          v-model="searchQuery"
          :placeholder="t('personas.searchPlaceholder')"
          :prefix-icon="Search"
          clearable
          style="max-width: 400px"
        />
      </div>

      <el-table
        v-loading="loading"
        :data="filteredPersonas"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="name" :label="t('personas.name')" min-width="200">
          <template #default="{ row }">
            <div class="persona-name">
              <el-avatar v-if="row.avatarUrl" :src="row.avatarUrl" :size="32" />
              <el-avatar v-else :size="32">{{ row.name[0] }}</el-avatar>
              <span>{{ row.name }}</span>
              <el-icon v-if="row.isDefault" color="#f59e0b" :size="16">
                <StarFilled />
              </el-icon>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="description" :label="t('personas.description')" min-width="300">
          <template #default="{ row }">
            <span class="description-text">{{ row.description || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('personas.metadata')" width="120">
          <template #default="{ row }">
            <el-tag v-if="Object.keys(row.metadata || {}).length > 0" type="info">
              {{ Object.keys(row.metadata).length }} {{ t('personas.fields') }}
            </el-tag>
            <span v-else class="text-secondary">-</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('common.actions')" width="280" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="info"
              :icon="InfoFilled"
              @click="openDetail(row)"
            >
              {{ t('common.detail') }}
            </el-button>
            <el-button
              v-if="!row.isDefault"
              link
              type="warning"
              :icon="Star"
              @click="handleSetDefault(row)"
            >
              {{ t('personas.setDefault') }}
            </el-button>
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">
              {{ t('common.edit') }}
            </el-button>
            <el-button link type="danger" :icon="Delete" @click="handleDelete(row)">
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Create/Edit Dialog -->
      <el-dialog
        v-model="dialogVisible"
        :title="dialogMode === 'create' ? t('personas.create') : t('personas.edit')"
        width="700px"
      >
        <el-form :model="form" label-width="120px">
          <el-form-item :label="t('personas.name')" required>
            <el-input
              v-model="form.name"
              :placeholder="t('personas.namePlaceholder')"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>

          <el-form-item :label="t('personas.description')">
            <el-input
              v-model="form.description"
              type="textarea"
              :placeholder="t('personas.descriptionPlaceholder')"
              :rows="4"
            />
          </el-form-item>

          <el-form-item :label="t('personas.avatarUrl')">
            <el-input
              v-model="form.avatarUrl"
              :placeholder="t('personas.avatarUrlPlaceholder')"
            />
            <div v-if="form.avatarUrl" class="avatar-preview">
              <el-avatar :src="form.avatarUrl" :size="64" />
            </div>
          </el-form-item>

          <el-form-item :label="t('personas.isDefault')">
            <el-switch v-model="form.isDefault" />
          </el-form-item>

          <el-divider>{{ t('personas.metadataSection') }}</el-divider>

          <!-- Quick Templates -->
          <el-form-item :label="t('personas.quickTemplate')">
            <el-button-group>
              <el-button size="small" @click="applyTemplate('commander')">
                {{ t('personas.templates.commander') }}
              </el-button>
              <el-button size="small" @click="applyTemplate('scientist')">
                {{ t('personas.templates.scientist') }}
              </el-button>
              <el-button size="small" @click="applyTemplate('pilot')">
                {{ t('personas.templates.pilot') }}
              </el-button>
              <el-button size="small" @click="applyTemplate('engineer')">
                {{ t('personas.templates.engineer') }}
              </el-button>
            </el-button-group>
          </el-form-item>

          <!-- Metadata Editor -->
          <el-form-item :label="t('personas.addMetadata')">
            <div class="metadata-input">
              <el-input
                v-model="metadataKey"
                :placeholder="t('personas.metadataKey')"
                style="width: 150px"
              />
              <el-input
                v-model="metadataValue"
                :placeholder="t('personas.metadataValue')"
                style="flex: 1"
              />
              <el-button type="primary" @click="addMetadata">
                {{ t('common.add') }}
              </el-button>
            </div>
          </el-form-item>

          <!-- Metadata List -->
          <el-form-item v-if="metadataEntries.length > 0" label=" ">
            <div class="metadata-list">
              <el-tag
                v-for="[key, value] in metadataEntries"
                :key="key"
                closable
                @close="removeMetadata(key)"
                class="metadata-tag"
              >
                <strong>{{ key }}:</strong> {{ value }}
              </el-tag>
            </div>
          </el-form-item>
        </el-form>

        <template #footer>
          <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ t('common.save') }}
          </el-button>
        </template>
      </el-dialog>

      <!-- Detail Dialog -->
      <el-dialog
        v-model="detailDialogVisible"
        :title="detailPersona?.name"
        width="600px"
      >
        <div v-if="detailPersona" class="persona-detail">
          <div class="detail-header">
            <el-avatar :src="detailPersona.avatarUrl" :size="80">
              {{ detailPersona.name[0] }}
            </el-avatar>
            <div class="detail-info">
              <h2>{{ detailPersona.name }}</h2>
              <el-tag v-if="detailPersona.isDefault" type="warning">
                {{ t('personas.defaultPersona') }}
              </el-tag>
            </div>
          </div>

          <el-divider />

          <div class="detail-section">
            <h3>{{ t('personas.description') }}</h3>
            <p class="description-full">
              {{ detailPersona.description || t('personas.noDescription') }}
            </p>
          </div>

          <el-divider />

          <div class="detail-section">
            <h3>{{ t('personas.metadata') }}</h3>
            <el-descriptions v-if="Object.keys(detailPersona.metadata || {}).length > 0" :column="2" border>
              <el-descriptions-item
                v-for="[key, value] in Object.entries(detailPersona.metadata)"
                :key="key"
                :label="key"
              >
                {{ value }}
              </el-descriptions-item>
            </el-descriptions>
            <p v-else class="text-secondary">{{ t('personas.noMetadata') }}</p>
          </div>

          <el-divider />

          <div class="detail-section">
            <h3>{{ t('personas.systemInfo') }}</h3>
            <el-descriptions :column="1" border>
              <el-descriptions-item :label="t('personas.createdAt')">
                {{ new Date(detailPersona.createdAt).toLocaleString() }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('personas.updatedAt')">
                {{ new Date(detailPersona.updatedAt).toLocaleString() }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <template #footer>
          <el-button @click="detailDialogVisible = false">{{ t('common.close') }}</el-button>
          <el-button type="primary" @click="openEdit(detailPersona!); detailDialogVisible = false">
            {{ t('common.edit') }}
          </el-button>
        </template>
      </el-dialog>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.personas-page {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
}

.subtitle {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.toolbar {
  margin-bottom: 16px;
}

.persona-name {
  display: flex;
  align-items: center;
  gap: 12px;
}

.description-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--el-text-color-secondary);
}

.text-secondary {
  color: var(--el-text-color-secondary);
}

.avatar-preview {
  margin-top: 12px;
}

.metadata-input {
  display: flex;
  gap: 8px;
  width: 100%;
}

.metadata-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.metadata-tag {
  font-size: 13px;
}

.persona-detail {
  padding: 8px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 20px;
}

.detail-info h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
}

.detail-section {
  margin-bottom: 16px;
}

.detail-section h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
}

.description-full {
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--el-text-color-regular);
}
</style>
