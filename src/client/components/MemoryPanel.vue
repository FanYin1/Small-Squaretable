<!-- src/client/components/MemoryPanel.vue -->
<template>
  <div class="memory-panel">
    <div class="memory-panel__header">
      <span class="memory-panel__title">{{ $t('memory.title') }}</span>
      <span class="memory-panel__count">{{ memoryCount }} {{ $t('memory.count') }}</span>
    </div>

    <!-- Type Filter -->
    <div class="memory-panel__filters">
      <el-radio-group v-model="selectedType" size="small">
        <el-radio-button label="">{{ $t('memory.filterAll') }}</el-radio-button>
        <el-radio-button label="fact">{{ $t('memory.typeFact') }}</el-radio-button>
        <el-radio-button label="preference">{{ $t('memory.typePreference') }}</el-radio-button>
        <el-radio-button label="relationship">{{ $t('memory.typeRelationship') }}</el-radio-button>
        <el-radio-button label="event">{{ $t('memory.typeEvent') }}</el-radio-button>
      </el-radio-group>
    </div>

    <!-- Memory List -->
    <div class="memory-panel__list" v-loading="isLoading">
      <div v-if="filteredMemories.length === 0" class="memory-panel__empty">
        <el-empty :description="$t('memory.empty')" :image-size="60" />
      </div>

      <div
        v-for="memory in filteredMemories"
        :key="memory.id"
        class="memory-panel__item"
      >
        <div class="memory-panel__item-header">
          <el-tag :type="getTypeTagType(memory.type)" size="small">
            {{ getTypeLabel(memory.type) }}
          </el-tag>
          <el-button
            type="danger"
            :icon="Delete"
            size="small"
            circle
            @click="handleDelete(memory.id)"
          />
        </div>
        <div class="memory-panel__item-content">
          {{ memory.content }}
        </div>
        <div class="memory-panel__item-meta">
          <span>{{ $t('memory.importance') }} {{ formatImportance(memory.importance) }}</span>
          <span>{{ $t('memory.accessCount', { n: memory.accessCount }) }}</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="memory-panel__actions">
      <el-popconfirm
        :title="$t('memory.clearConfirm')"
        :confirm-button-text="$t('common.confirm')"
        :cancel-button-text="$t('common.cancel')"
        @confirm="handleClearAll"
      >
        <template #reference>
          <el-button type="danger" size="small" :disabled="memoryCount === 0">
            {{ $t('memory.clearAll') }}
          </el-button>
        </template>
      </el-popconfirm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Delete } from '@element-plus/icons-vue';
import { useCharacterIntelligenceStore } from '../stores/characterIntelligence';
import { storeToRefs } from 'pinia';
import { useToast } from '../composables/useToast';
import type { MemoryType } from '../../types/intelligence';

const props = defineProps<{
  characterId: string;
  chatId?: string;
}>();

const { t } = useI18n();
const store = useCharacterIntelligenceStore();
const { memories, isLoading } = storeToRefs(store);
const { success: showSuccess, error: showError } = useToast();

const selectedType = ref<MemoryType | ''>('');

const memoryCount = computed(() => memories.value.length);

const filteredMemories = computed(() => {
  if (!selectedType.value) return memories.value;
  return memories.value.filter(m => m.type === selectedType.value);
});

const TYPE_CONFIG: Record<MemoryType, { labelKey: string; tagType: 'primary' | 'success' | 'warning' | 'danger' }> = {
  fact: { labelKey: 'memory.typeFact', tagType: 'primary' },
  preference: { labelKey: 'memory.typePreference', tagType: 'success' },
  relationship: { labelKey: 'memory.typeRelationship', tagType: 'warning' },
  event: { labelKey: 'memory.typeEvent', tagType: 'danger' },
};

function getTypeLabel(type: MemoryType): string {
  return TYPE_CONFIG[type] ? t(TYPE_CONFIG[type].labelKey) : type;
}

function getTypeTagType(type: MemoryType): 'primary' | 'success' | 'warning' | 'danger' {
  return TYPE_CONFIG[type]?.tagType ?? 'primary';
}

function formatImportance(importance: number | string | null): string {
  const value = typeof importance === 'string' ? parseFloat(importance) : importance;
  return value ? (value * 100).toFixed(0) + '%' : '50%';
}

async function handleDelete(memoryId: string) {
  try {
    await store.deleteMemory(props.characterId, memoryId, props.chatId);
    showSuccess(t('memory.deleteSuccess'));
  } catch (e) {
    showError(t('memory.deleteError'));
  }
}

async function handleClearAll() {
  try {
    await store.clearAllMemories(props.characterId, props.chatId);
    showSuccess(t('memory.clearSuccess'));
  } catch (e) {
    showError(t('memory.clearError'));
  }
}
</script>

<style scoped>
.memory-panel {
  background: var(--el-bg-color);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
}

.memory-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.memory-panel__title {
  font-weight: 600;
  font-size: 14px;
}

.memory-panel__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.memory-panel__filters {
  display: flex;
  overflow-x: auto;
}

.memory-panel__list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 100px;
}

.memory-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.memory-panel__item {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 8px;
}

.memory-panel__item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.memory-panel__item-content {
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 6px;
}

.memory-panel__item-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.memory-panel__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
