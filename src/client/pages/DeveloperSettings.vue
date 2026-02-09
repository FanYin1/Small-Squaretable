<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Delete, Edit, Key, CopyDocument, Warning } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useDeveloperStore } from '@client/stores/developer';
import { useDateTime } from '@client/composables';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import type { ApiKeyInfo, ApiKeyCreatedResponse } from '@/types/apiKey';

const { t } = useI18n();
const developerStore = useDeveloperStore();
const { formatRelativeTime } = useDateTime();

// Create dialog
const showCreateDialog = ref(false);
const createForm = ref({
  name: '',
  scopes: [] as string[],
  rateLimitPerMinute: 60,
  hasExpiry: false,
  expiresAt: '',
});

// Edit dialog
const showEditDialog = ref(false);
const editForm = ref({
  id: '',
  name: '',
  scopes: [] as string[],
  rateLimitPerMinute: 60,
});

// Newly created key display
const newlyCreatedKey = ref<ApiKeyCreatedResponse | null>(null);

// --- Actions ---
function openCreateDialog() {
  createForm.value = {
    name: '',
    scopes: [],
    rateLimitPerMinute: 60,
    hasExpiry: false,
    expiresAt: '',
  };
  newlyCreatedKey.value = null;
  showCreateDialog.value = true;
}

async function handleCreate() {
  if (!createForm.value.name || createForm.value.scopes.length === 0) return;
  const input = {
    name: createForm.value.name,
    scopes: createForm.value.scopes,
    rateLimitPerMinute: createForm.value.rateLimitPerMinute,
    ...(createForm.value.hasExpiry && createForm.value.expiresAt
      ? { expiresAt: new Date(createForm.value.expiresAt).toISOString() }
      : {}),
  };
  const result = await developerStore.createApiKey(input);
  if (result) {
    newlyCreatedKey.value = result;
    ElMessage.success(t('developer.createSuccess'));
  }
}

function openEditDialog(key: ApiKeyInfo) {
  editForm.value = {
    id: key.id,
    name: key.name,
    scopes: [...key.scopes],
    rateLimitPerMinute: key.rateLimitPerMinute,
  };
  showEditDialog.value = true;
}

async function handleEdit() {
  const ok = await developerStore.updateApiKey(editForm.value.id, {
    name: editForm.value.name,
    scopes: editForm.value.scopes,
    rateLimitPerMinute: editForm.value.rateLimitPerMinute,
  });
  if (ok) {
    ElMessage.success(t('developer.updateSuccess'));
    showEditDialog.value = false;
  }
}

async function handleToggleActive(key: ApiKeyInfo) {
  const ok = await developerStore.updateApiKey(key.id, { isActive: !key.isActive });
  if (ok) {
    ElMessage.success(t('developer.updateSuccess'));
  }
}

async function handleDelete(key: ApiKeyInfo) {
  try {
    await ElMessageBox.confirm(t('developer.deleteConfirm'), t('common.delete'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    });
    const ok = await developerStore.deleteApiKey(key.id);
    if (ok) {
      ElMessage.success(t('developer.deleteSuccess'));
    }
  } catch {
    // cancelled
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(t('developer.keyCopied'));
  } catch {
    ElMessage.error('Failed to copy');
  }
}

function closeCreateDialog() {
  showCreateDialog.value = false;
  newlyCreatedKey.value = null;
}

onMounted(() => {
  developerStore.fetchApiKeys();
  developerStore.fetchScopes();
});
</script>
<template>
  <DashboardLayout>
    <template #title>{{ t('developer.title') }}</template>
    <template #actions>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">
        {{ t('developer.createKey') }}
      </el-button>
    </template>

    <div v-loading="developerStore.loading" class="developer-settings">
      <!-- Empty state -->
      <div v-if="!developerStore.loading && developerStore.apiKeys.length === 0" class="empty-state">
        <el-icon :size="64" color="var(--text-tertiary)"><Key /></el-icon>
        <h3>{{ t('developer.noKeys') }}</h3>
        <p>{{ t('developer.noKeysDesc') }}</p>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">
          {{ t('developer.createKey') }}
        </el-button>
      </div>

      <!-- Key list -->
      <div v-else class="key-list">
        <div v-for="key in developerStore.apiKeys" :key="key.id" class="key-card">
          <div class="key-header">
            <div class="key-name-row">
              <h3 class="key-name">{{ key.name }}</h3>
              <el-tag :type="key.isActive ? 'success' : 'info'" size="small">
                {{ key.isActive ? t('developer.active') : t('developer.inactive') }}
              </el-tag>
            </div>
            <code class="key-hint">{{ key.keyHint }}</code>
          </div>
          <div class="key-scopes">
            <el-tag v-for="scope in key.scopes" :key="scope" size="small" type="info" class="scope-tag">
              {{ scope }}
            </el-tag>
          </div>

          <div class="key-meta">
            <div class="meta-item">
              <span class="meta-label">{{ t('developer.created') }}</span>
              <span class="meta-value">{{ formatRelativeTime(key.createdAt) }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ t('developer.lastUsed') }}</span>
              <span class="meta-value">{{ key.lastUsedAt ? formatRelativeTime(key.lastUsedAt) : t('developer.never') }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ t('developer.requests') }}</span>
              <span class="meta-value">{{ key.requestCount }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ t('developer.rateLimit') }}</span>
              <span class="meta-value">{{ key.rateLimitPerMinute }} {{ t('developer.rateLimitUnit') }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ t('developer.expiresAt') }}</span>
              <span class="meta-value">{{ key.expiresAt ? formatRelativeTime(key.expiresAt) : t('developer.noExpiry') }}</span>
            </div>
          </div>

          <div class="key-actions">
            <el-switch
              :model-value="key.isActive"
              :active-text="t('developer.active')"
              :inactive-text="t('developer.inactive')"
              @change="handleToggleActive(key)"
            />
            <el-button text :icon="Edit" @click="openEditDialog(key)">
              {{ t('common.edit') }}
            </el-button>
            <el-button text type="danger" :icon="Delete" @click="handleDelete(key)">
              {{ t('common.delete') }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
    <!-- Create Key Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      :title="t('developer.createKey')"
      width="560px"
      :close-on-click-modal="false"
      @close="closeCreateDialog"
    >
      <!-- Show newly created key -->
      <div v-if="newlyCreatedKey" class="created-key-display">
        <el-alert type="warning" :closable="false" show-icon>
          <template #title>
            <div class="key-warning-title">
              <el-icon><Warning /></el-icon>
              <span>{{ t('developer.keyWarning') }}</span>
            </div>
          </template>
          <div class="full-key-display">
            <code class="full-key">{{ newlyCreatedKey.key }}</code>
            <el-button type="primary" size="small" :icon="CopyDocument" @click="copyToClipboard(newlyCreatedKey!.key)">
              {{ t('developer.copyKey') }}
            </el-button>
          </div>
        </el-alert>
      </div>

      <!-- Create form -->
      <el-form v-else label-position="top">
        <el-form-item :label="t('developer.keyName')">
          <el-input v-model="createForm.name" :placeholder="t('developer.keyNamePlaceholder')" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('developer.scopes')">
          <el-checkbox-group v-model="createForm.scopes">
            <el-checkbox
              v-for="scope in developerStore.availableScopes"
              :key="scope"
              :label="scope"
              :value="scope"
            >
              {{ scope }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item :label="`${t('developer.rateLimit')} (${t('developer.rateLimitUnit')})`">
          <el-input-number v-model="createForm.rateLimitPerMinute" :min="1" :max="1000" :step="10" />
        </el-form-item>
        <el-form-item :label="t('developer.expiresAt')">
          <el-switch v-model="createForm.hasExpiry" :inactive-text="t('developer.noExpiry')" />
          <el-date-picker
            v-if="createForm.hasExpiry"
            v-model="createForm.expiresAt"
            type="datetime"
            style="margin-top: 8px; width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeCreateDialog">{{ t('common.close') }}</el-button>
        <el-button v-if="!newlyCreatedKey" type="primary" :disabled="!createForm.name || createForm.scopes.length === 0" @click="handleCreate">
          {{ t('developer.createKey') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Edit Key Dialog -->
    <el-dialog v-model="showEditDialog" :title="t('common.edit')" width="560px">
      <el-form label-position="top">
        <el-form-item :label="t('developer.keyName')">
          <el-input v-model="editForm.name" :placeholder="t('developer.keyNamePlaceholder')" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('developer.scopes')">
          <el-checkbox-group v-model="editForm.scopes">
            <el-checkbox
              v-for="scope in developerStore.availableScopes"
              :key="scope"
              :label="scope"
              :value="scope"
            >
              {{ scope }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item :label="`${t('developer.rateLimit')} (${t('developer.rateLimitUnit')})`">
          <el-input-number v-model="editForm.rateLimitPerMinute" :min="1" :max="1000" :step="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!editForm.name || editForm.scopes.length === 0" @click="handleEdit">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </DashboardLayout>
</template>
<style scoped>
.developer-settings {
  max-width: 960px;
  margin: 0 auto;
  min-height: 300px;
  animation: fadeIn var(--duration-slow) var(--ease-out) both;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-state h3 {
  margin: 16px 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-state p {
  margin: 0 0 24px;
  font-size: 14px;
  color: var(--text-secondary);
}

.key-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.key-card {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid var(--border-default);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--text-primary) 8%, transparent);
  transition: border-color 0.2s;
}

.key-card:hover {
  border-color: var(--accent-purple);
}

.key-header {
  margin-bottom: 12px;
}

.key-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.key-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}
.key-hint {
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-base);
  padding: 2px 8px;
  border-radius: 4px;
}

.key-scopes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.scope-tag {
  font-size: 12px;
}

.key-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--border-default);
  border-bottom: 1px solid var(--border-default);
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.meta-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.key-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.created-key-display {
  margin-bottom: 16px;
}

.key-warning-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.full-key-display {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.full-key {
  flex: 1;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  background: var(--bg-base);
  padding: 8px 12px;
  border-radius: 6px;
  word-break: break-all;
  color: var(--text-primary);
}

/* Mobile */
@media (max-width: 767px) {
  .key-card {
    padding: 16px;
  }

  .key-meta {
    gap: 12px;
  }

  .key-actions {
    flex-wrap: wrap;
  }

  .full-key-display {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
