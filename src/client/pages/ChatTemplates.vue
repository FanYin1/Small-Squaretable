<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import { useChatTemplateStore } from '@client/stores/chatTemplate';
import { chatTemplateApi } from '@client/services/chat-template.api';

const { t } = useI18n();
const templateStore = useChatTemplateStore();
const showDialog = ref(false);
const editingId = ref<string | null>(null);

const form = ref({
  name: '',
  description: '',
  systemPrompt: '',
  firstMessage: '',
  tags: [] as string[],
  isPublic: false,
});

function openCreate() {
  editingId.value = null;
  form.value = { name: '', description: '', systemPrompt: '', firstMessage: '', tags: [], isPublic: false };
  showDialog.value = true;
}

function openEdit(template: any) {
  editingId.value = template.id;
  form.value = {
    name: template.name,
    description: template.description || '',
    systemPrompt: template.systemPrompt || '',
    firstMessage: template.firstMessage || '',
    tags: template.tags || [],
    isPublic: template.isPublic || false,
  };
  showDialog.value = true;
}

async function handleSave() {
  if (!form.value.name.trim()) return;
  try {
    if (editingId.value) {
      await chatTemplateApi.updateTemplate(editingId.value, form.value);
      ElMessage.success(t('chatTemplates.updateSuccess'));
    } else {
      await templateStore.createTemplate(form.value);
      ElMessage.success(t('chatTemplates.createSuccess'));
    }
    showDialog.value = false;
    await templateStore.fetchTemplates();
  } catch {
    ElMessage.error(t('common.retry'));
  }
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm(t('chatTemplates.deleteConfirm'));
    await templateStore.deleteTemplate(id);
    ElMessage.success(t('chatTemplates.deleteSuccess'));
  } catch {
    // User cancelled
  }
}

onMounted(() => {
  templateStore.fetchTemplates();
});
</script>

<template>
  <DashboardLayout>
    <template #title>{{ t('chatTemplates.title') }}</template>
    <template #actions>
      <el-button type="primary" @click="openCreate">{{ t('chatTemplates.create') }}</el-button>
    </template>

    <div class="chat-templates-page">
      <div v-if="templateStore.loading" class="loading">
        <el-skeleton :rows="3" animated />
      </div>

      <div v-else-if="templateStore.ownTemplates.length === 0" class="empty">
        <el-empty :description="t('chatTemplates.empty')" />
      </div>

      <div v-else class="template-list">
        <div v-for="tpl in templateStore.ownTemplates" :key="tpl.id" class="template-card">
          <div class="template-info">
            <div class="template-name">{{ tpl.name }}</div>
            <div class="template-desc">{{ tpl.description || '' }}</div>
            <div v-if="tpl.tags?.length" class="template-tags">
              <el-tag v-for="tag in tpl.tags" :key="tag" size="small">{{ tag }}</el-tag>
            </div>
          </div>
          <div class="template-actions">
            <el-button text @click="openEdit(tpl)">{{ t('common.edit') }}</el-button>
            <el-button text type="danger" @click="handleDelete(tpl.id)">{{ t('common.delete') }}</el-button>
          </div>
        </div>
      </div>

      <el-dialog
        v-model="showDialog"
        :title="editingId ? t('chatTemplates.edit') : t('chatTemplates.create')"
        width="600px"
      >
        <el-form label-position="top">
          <el-form-item :label="t('chatTemplates.name')">
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item :label="t('chatTemplates.description')">
            <el-input v-model="form.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item :label="t('chatTemplates.systemPrompt')">
            <el-input v-model="form.systemPrompt" type="textarea" :rows="4" />
          </el-form-item>
          <el-form-item :label="t('chatTemplates.firstMessage')">
            <el-input v-model="form.firstMessage" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item :label="t('chatTemplates.isPublic')">
            <el-switch v-model="form.isPublic" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleSave">{{ t('common.save') }}</el-button>
        </template>
      </el-dialog>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.chat-templates-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.template-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px;
  background: var(--bg-color, #fff);
  border: 1px solid var(--border-color, #e4e7ed);
  border-radius: 12px;
  transition: box-shadow 0.2s ease;
}

.template-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.template-info {
  flex: 1;
  min-width: 0;
}

.template-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.template-desc {
  font-size: 14px;
  color: var(--text-color-secondary, #909399);
  margin-bottom: 8px;
}

.template-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.template-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 16px;
}

.loading,
.empty {
  padding: 40px 0;
}

@media (max-width: 767px) {
  .chat-templates-page {
    padding: 16px;
  }

  .template-card {
    flex-direction: column;
    gap: 12px;
  }

  .template-actions {
    margin-left: 0;
  }
}
</style>
