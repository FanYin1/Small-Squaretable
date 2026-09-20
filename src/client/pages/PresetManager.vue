<template>
  <div class="preset-manager">
    <div class="header">
      <h2>{{ t('presetManager.title') }}</h2>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        {{ t('presetManager.createPreset') }}
      </el-button>
    </div>

    <!-- Filter Tabs -->
    <el-tabs v-model="activeTab" @tab-change="loadPresets">
      <el-tab-pane :label="t('presetManager.allPresets')" name="all" />
      <el-tab-pane :label="t('presetManager.globalPresets')" name="global" />
      <el-tab-pane :label="t('presetManager.characterPresets')" name="character" />
    </el-tabs>

    <!-- Presets List -->
    <div v-loading="loading" class="presets-list">
      <el-empty v-if="!loading && presets.length === 0" :description="t('presetManager.noPresets')" />

      <div v-for="preset in presets" :key="preset.id" class="preset-card">
        <div class="preset-header">
          <div class="preset-title">
            <h3>{{ preset.name }}</h3>
            <el-tag v-if="preset.isGlobal" size="small" type="info">
              {{ t('presetManager.global') }}
            </el-tag>
          </div>
          <div class="preset-actions">
            <el-button size="small" @click="editPreset(preset)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button size="small" type="danger" @click="deletePreset(preset)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>

        <p v-if="preset.description" class="preset-description">
          {{ preset.description }}
        </p>

        <div class="preset-stats">
          <el-tag size="small">
            {{ t('presetManager.usedCount', { count: preset.useCount }) }}
          </el-tag>
          <span class="preset-date">
            {{ t('presetManager.created') }}: {{ formatDate(preset.createdAt) }}
          </span>
        </div>

        <div class="preset-parameters">
          <el-collapse>
            <el-collapse-item :title="t('presetManager.viewParameters')" :name="preset.id">
              <pre class="parameter-preview">{{ JSON.stringify(preset.preset, null, 2) }}</pre>
            </el-collapse-item>
          </el-collapse>
        </div>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      :title="editingPreset ? t('presetManager.editPreset') : t('presetManager.createPreset')"
      width="600px"
    >
      <el-form :model="presetForm" label-width="140px">
        <el-form-item :label="t('presetManager.presetName')" required>
          <el-input v-model="presetForm.name" :placeholder="t('presetManager.presetNamePlaceholder')" />
        </el-form-item>

        <el-form-item :label="t('presetManager.description')">
          <el-input
            v-model="presetForm.description"
            type="textarea"
            :rows="3"
            :placeholder="t('presetManager.descriptionPlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="t('presetManager.scope')">
          <el-radio-group v-model="presetForm.isGlobal">
            <el-radio :label="true">{{ t('presetManager.globalPreset') }}</el-radio>
            <el-radio :label="false">{{ t('presetManager.characterPreset') }}</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-divider>{{ t('presetManager.parameters') }}</el-divider>

        <el-form-item :label="t('presetManager.personality')">
          <el-input
            v-model="presetForm.preset.personality"
            type="textarea"
            :rows="3"
            :placeholder="t('presetManager.personalityPlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="t('presetManager.scenario')">
          <el-input
            v-model="presetForm.preset.scenario"
            type="textarea"
            :rows="3"
            :placeholder="t('presetManager.scenarioPlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="t('presetManager.systemPrompt')">
          <el-input
            v-model="presetForm.preset.system_prompt"
            type="textarea"
            :rows="4"
            :placeholder="t('presetManager.systemPromptPlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="t('presetManager.postHistory')">
          <el-input
            v-model="presetForm.preset.post_history_instructions"
            type="textarea"
            :rows="3"
            :placeholder="t('presetManager.postHistoryPlaceholder')"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="savePreset">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete } from '@element-plus/icons-vue';
import { api } from '@/client/services/api';

const { t } = useI18n();

// State
const loading = ref(false);
const saving = ref(false);
const presets = ref<any[]>([]);
const activeTab = ref('all');
const showCreateDialog = ref(false);
const editingPreset = ref<any>(null);

// Form
const presetForm = ref({
  name: '',
  description: '',
  isGlobal: true,
  preset: {
    personality: '',
    scenario: '',
    system_prompt: '',
    post_history_instructions: '',
  },
});

// Load presets
async function loadPresets() {
  loading.value = true;
  try {
    const response = await api.get('/presets');
    let allPresets = response.data.data || [];

    // Filter based on active tab
    if (activeTab.value === 'global') {
      allPresets = allPresets.filter((p: any) => p.isGlobal);
    } else if (activeTab.value === 'character') {
      allPresets = allPresets.filter((p: any) => !p.isGlobal);
    }

    presets.value = allPresets;
  } catch (error) {
    console.error('Failed to load presets:', error);
    ElMessage.error(t('presetManager.loadFailed'));
  } finally {
    loading.value = false;
  }
}

// Edit preset
function editPreset(preset: any) {
  editingPreset.value = preset;
  presetForm.value = {
    name: preset.name,
    description: preset.description || '',
    isGlobal: preset.isGlobal,
    preset: { ...preset.preset },
  };
  showCreateDialog.value = true;
}

// Save preset
async function savePreset() {
  if (!presetForm.value.name) {
    ElMessage.warning(t('presetManager.nameRequired'));
    return;
  }

  saving.value = true;
  try {
    if (editingPreset.value) {
      // Update existing preset
      await api.patch(`/presets/${editingPreset.value.id}`, presetForm.value);
      ElMessage.success(t('presetManager.updateSuccess'));
    } else {
      // Create new preset
      await api.post('/presets', presetForm.value);
      ElMessage.success(t('presetManager.createSuccess'));
    }

    showCreateDialog.value = false;
    editingPreset.value = null;
    resetForm();
    await loadPresets();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || t('presetManager.saveFailed'));
  } finally {
    saving.value = false;
  }
}

// Delete preset
async function deletePreset(preset: any) {
  try {
    await ElMessageBox.confirm(
      t('presetManager.deleteConfirm', { name: preset.name }),
      t('presetManager.deleteTitle'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );

    await api.delete(`/presets/${preset.id}`);
    ElMessage.success(t('presetManager.deleteSuccess'));
    await loadPresets();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || t('presetManager.deleteFailed'));
    }
  }
}

// Reset form
function resetForm() {
  presetForm.value = {
    name: '',
    description: '',
    isGlobal: true,
    preset: {
      personality: '',
      scenario: '',
      system_prompt: '',
      post_history_instructions: '',
    },
  };
}

// Format date
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString();
}

onMounted(() => {
  loadPresets();
});
</script>

<style scoped>
.preset-manager {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.presets-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.preset-card {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 16px;
  background: var(--el-bg-color);
  transition: box-shadow 0.2s;
}

.preset-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.preset-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.preset-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-title h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.preset-actions {
  display: flex;
  gap: 4px;
}

.preset-description {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  margin-bottom: 12px;
  line-height: 1.5;
}

.preset-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
}

.preset-date {
  color: var(--el-text-color-secondary);
}

.preset-parameters {
  margin-top: 12px;
}

.parameter-preview {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
}

:deep(.el-collapse-item__header) {
  font-size: 13px;
  padding: 8px 0;
}

:deep(.el-collapse-item__content) {
  padding: 0;
}
</style>
