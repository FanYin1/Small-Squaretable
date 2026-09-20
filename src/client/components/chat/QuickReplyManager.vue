<template>
  <div class="quick-reply-manager">
    <div class="manager-header">
      <h3>{{ $t('quickReplies.title') }}</h3>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon> {{ $t('quickReplies.addReply') }}
      </el-button>
    </div>

    <el-alert
      v-if="replies.length === 0"
      type="info"
      :closable="false"
      show-icon
      class="empty-hint"
    >
      <template #title>
        {{ $t('quickReplies.noReplies') }}
      </template>
    </el-alert>

    <div v-else class="replies-list">
      <draggable
        v-model="replies"
        item-key="id"
        @end="handleReorder"
        handle=".drag-handle"
      >
        <template #item="{ element: reply }">
          <el-card class="reply-card" shadow="hover">
            <div class="reply-header">
              <el-icon class="drag-handle"><Rank /></el-icon>
              <el-switch
                v-model="reply.isEnabled"
                @change="handleToggle(reply)"
              />
              <span class="reply-label">{{ reply.label }}</span>
              <div class="reply-actions">
                <el-button text @click="handleEdit(reply)">
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-button text type="danger" @click="handleDelete(reply)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
            <div class="reply-message">{{ reply.message }}</div>
            <div v-if="reply.category" class="reply-category">
              <el-tag size="small">{{ reply.category }}</el-tag>
            </div>
          </el-card>
        </template>
      </draggable>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      :title="editingReply ? $t('quickReplies.editReply') : $t('quickReplies.addReply')"
      width="500px"
    >
      <el-form :model="formData" label-position="top">
        <el-form-item :label="$t('quickReplies.label')">
          <el-input
            v-model="formData.label"
            :placeholder="$t('quickReplies.labelPlaceholder')"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>

        <el-form-item :label="$t('quickReplies.message')">
          <el-input
            v-model="formData.message"
            type="textarea"
            :rows="4"
            :placeholder="$t('quickReplies.messagePlaceholder')"
          />
          <span class="hint">{{ $t('quickReplies.macroHint') }}</span>
        </el-form-item>

        <el-form-item :label="$t('quickReplies.category')">
          <el-input
            v-model="formData.category"
            :placeholder="$t('quickReplies.categoryPlaceholder')"
            maxlength="50"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCreateDialog = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleSave">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Edit, Delete, Rank } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import draggable from 'vuedraggable';
import {
  getQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  updateQuickReplyOrder,
  type QuickReply,
} from '@client/services/quick-reply.api';

const replies = ref<QuickReply[]>([]);
const showCreateDialog = ref(false);
const editingReply = ref<QuickReply | null>(null);
const formData = ref({
  label: '',
  message: '',
  category: '',
});

onMounted(async () => {
  await loadReplies();
});

async function loadReplies() {
  try {
    replies.value = await getQuickReplies();
  } catch (error) {
    ElMessage.error('Failed to load quick replies');
  }
}

function handleEdit(reply: QuickReply) {
  editingReply.value = reply;
  formData.value = {
    label: reply.label,
    message: reply.message,
    category: reply.category || '',
  };
  showCreateDialog.value = true;
}

async function handleSave() {
  if (!formData.value.label || !formData.value.message) {
    ElMessage.warning('Label and message are required');
    return;
  }

  try {
    if (editingReply.value) {
      await updateQuickReply(editingReply.value.id, {
        label: formData.value.label,
        message: formData.value.message,
        category: formData.value.category || undefined,
      });
      ElMessage.success('Quick reply updated');
    } else {
      await createQuickReply({
        label: formData.value.label,
        message: formData.value.message,
        category: formData.value.category || undefined,
        order: replies.value.length,
      });
      ElMessage.success('Quick reply created');
    }

    showCreateDialog.value = false;
    editingReply.value = null;
    formData.value = { label: '', message: '', category: '' };
    await loadReplies();
  } catch (error) {
    ElMessage.error('Failed to save quick reply');
  }
}

async function handleToggle(reply: QuickReply) {
  try {
    await updateQuickReply(reply.id, { isEnabled: reply.isEnabled });
  } catch (error) {
    ElMessage.error('Failed to update quick reply');
    reply.isEnabled = !reply.isEnabled;
  }
}

async function handleDelete(reply: QuickReply) {
  try {
    await ElMessageBox.confirm(
      'Are you sure you want to delete this quick reply?',
      'Confirm Delete',
      { type: 'warning' }
    );

    await deleteQuickReply(reply.id);
    ElMessage.success('Quick reply deleted');
    await loadReplies();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('Failed to delete quick reply');
    }
  }
}

async function handleReorder() {
  const updates = replies.value.map((reply, index) => ({
    id: reply.id,
    order: index,
  }));

  try {
    await updateQuickReplyOrder({ updates });
  } catch (error) {
    ElMessage.error('Failed to update order');
    await loadReplies();
  }
}
</script>

<style scoped lang="scss">
.quick-reply-manager {
  padding: 20px;

  .manager-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
  }

  .empty-hint {
    margin-bottom: 20px;
  }

  .replies-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .reply-card {
    cursor: move;

    .reply-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;

      .drag-handle {
        cursor: grab;
        color: var(--el-text-color-secondary);

        &:active {
          cursor: grabbing;
        }
      }

      .reply-label {
        flex: 1;
        font-weight: 500;
      }

      .reply-actions {
        display: flex;
        gap: 4px;
      }
    }

    .reply-message {
      color: var(--el-text-color-secondary);
      font-size: 14px;
      margin-bottom: 8px;
      white-space: pre-wrap;
    }

    .reply-category {
      margin-top: 8px;
    }
  }

  .hint {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 4px;
    display: block;
  }
}
</style>
