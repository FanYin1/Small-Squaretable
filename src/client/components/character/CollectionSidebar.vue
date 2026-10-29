<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import { Plus, Folder, MoreFilled } from '@element-plus/icons-vue';
import { characterCollectionApi } from '@client/services/character-collection.api';
import { useToast } from '@client/composables/useToast';
import type { CharacterCollection } from '@client/types';

defineProps<{
  activeCollection: string | null;
  collections: CharacterCollection[];
}>();

const emit = defineEmits<{
  (e: 'select', collectionId: string | null): void;
  (e: 'refresh'): void;
}>();

const { t } = useI18n();
const toast = useToast();

const showCreateDialog = ref(false);
const newName = ref('');
const newColor = ref('#a87536');
const newIsPublic = ref(false);

async function handleCreate() {
  if (!newName.value.trim()) return;
  try {
    await characterCollectionApi.createCollection({
      name: newName.value.trim(),
      color: newColor.value,
      isPublic: newIsPublic.value,
    });
    toast.success(t('common.createSuccess'));
    showCreateDialog.value = false;
    newName.value = '';
    newColor.value = '#a87536';
    newIsPublic.value = false;
    emit('refresh');
  } catch (e: any) {
    toast.error(t('common.createFailed'), { message: e.message || t('common.retry') });
  }
}

async function handleCommand(command: string, col: CharacterCollection) {
  if (command === 'rename') {
    try {
      const result = await ElMessageBox.prompt(t('collections.rename'), {
        inputValue: col.name,
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
      });
      const value = (result as { value: string }).value;
      if (value && value.trim()) {
        await characterCollectionApi.updateCollection(col.id, { name: value.trim() });
        toast.success(t('common.updateSuccess'));
        emit('refresh');
      }
    } catch (e: any) {
      if (e !== 'cancel') {
        toast.error(t('common.updateFailed'), { message: e.message || t('common.retry') });
      }
    }
  } else if (command === 'delete') {
    try {
      await ElMessageBox.confirm(
        t('collections.deleteConfirm'),
        t('collections.delete'),
        {
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
          type: 'warning',
        }
      );
      await characterCollectionApi.deleteCollection(col.id);
      toast.success(t('common.deleteSuccess'));
      emit('select', null);
      emit('refresh');
    } catch (e: any) {
      if (e !== 'cancel') {
        toast.error(t('common.deleteFailed'), { message: e.message || t('common.retry') });
      }
    }
  }
}
</script>

<template>
  <div class="collection-sidebar">
    <div class="collection-header">
      <span class="collection-title">{{ t('collections.title') }}</span>
      <el-button :icon="Plus" :aria-label="t('collections.create')" text @click="showCreateDialog = true" />
    </div>

    <div class="collection-list">
      <button
        type="button"
        class="collection-item"
        :class="{ active: !activeCollection }"
        :aria-pressed="!activeCollection"
        @click="emit('select', null)"
      >
        <el-icon><Folder /></el-icon>
        <span>{{ t('collections.all') }}</span>
      </button>

      <div
        v-for="col in collections"
        :key="col.id"
        class="collection-row"
        :class="{ active: activeCollection === col.id }"
      >
        <button type="button" class="collection-item" :aria-pressed="activeCollection === col.id" @click="emit('select', col.id)">
        <span class="color-dot" :style="{ backgroundColor: col.color || '#909399' }" />
        <span class="collection-name">{{ col.name }}</span>
        <el-tag v-if="col.isPublic" size="small" type="success" class="public-tag">{{ t('collections.publicCollection') }}</el-tag>
        <span class="item-count">{{ col.itemCount }}</span>
        </button>
        <el-dropdown trigger="click" @command="handleCommand($event, col)" size="small">
          <button type="button" class="more-icon" :aria-label="t('privateLibrary.manageNamed', { name: col.name })"><el-icon><MoreFilled /></el-icon></button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="rename">{{ t('collections.rename') }}</el-dropdown-item>
              <el-dropdown-item command="delete" divided>{{ t('collections.delete') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <el-dialog v-model="showCreateDialog" :title="t('collections.create')" width="400px">
      <el-form>
        <el-form-item :label="t('common.name')">
          <el-input v-model="newName" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('collections.changeColor')">
          <el-color-picker v-model="newColor" />
        </el-form-item>
        <el-form-item :label="t('collections.makePublic')">
          <el-switch v-model="newIsPublic" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleCreate" :disabled="!newName.trim()">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.collection-sidebar {
  width: 184px;
  min-width: 184px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.collection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 12px;
  border-bottom: 1px solid var(--border-default);
}

.collection-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.collection-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  overflow-y: auto;
}

.collection-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  min-height: 44px;
  min-width: 0;
  border: 0;
  background: transparent;
  text-align: start;
  font: inherit;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: background 0.15s ease;
}

.collection-item:hover {
  background: var(--bg-subtle);
}

.collection-item.active, .collection-row.active {
  background: var(--bg-subtle);
  color: var(--accent-text);
  font-weight: 500;
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.collection-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-count {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 20px;
  text-align: right;
}

.public-tag {
  flex-shrink: 0;
  margin-left: -4px;
}

.more-icon {
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
}

.collection-row { display: flex; align-items: center; border-radius: 8px; }
.collection-row > .collection-item { flex: 1; }
.collection-sidebar :deep(.el-button) { min-height: 44px; min-width: 44px; }

@include below(lg) {
  .collection-sidebar {
    width: 100%;
    min-width: unset;
    border-right: none;
    border-bottom: 1px solid var(--border-default);
    border-radius: 12px 12px 0 0;
    padding: 12px 0;
  }

  .collection-list {
    flex-direction: row;
    overflow-x: auto;
    gap: 4px;
  }

  .collection-item, .collection-row {
    white-space: nowrap;
    flex-shrink: 0;
  }
}

@include below(sm) {
  .collection-sidebar { flex-direction: row; align-items: center; gap: 8px; padding: 8px 0; }
  .collection-header { flex-shrink: 0; gap: 4px; padding: 0; border: 0; }
  .collection-title { font-size: 12px; }
  .collection-list { flex: 1; padding: 0; min-width: 0; }
}
</style>
