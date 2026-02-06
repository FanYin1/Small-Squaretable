<!-- src/client/components/MemoryPanel.vue -->
<template>
  <div class="memory-panel">
    <div class="memory-panel__header">
      <span class="memory-panel__title">角色记忆</span>
      <span class="memory-panel__count">{{ memoryCount }} 条</span>
    </div>

    <!-- Type Filter -->
    <div class="memory-panel__filters">
      <el-radio-group v-model="selectedType" size="small">
        <el-radio-button label="">全部</el-radio-button>
        <el-radio-button label="fact">事实</el-radio-button>
        <el-radio-button label="preference">偏好</el-radio-button>
        <el-radio-button label="relationship">关系</el-radio-button>
        <el-radio-button label="event">事件</el-radio-button>
      </el-radio-group>
    </div>

    <!-- Memory List -->
    <div class="memory-panel__list" v-loading="isLoading">
      <div v-if="filteredMemories.length === 0" class="memory-panel__empty">
        <el-empty description="暂无记忆" :image-size="60" />
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
          <span>重要度: {{ formatImportance(memory.importance) }}</span>
          <span>访问: {{ memory.accessCount }}次</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="memory-panel__actions">
      <el-popconfirm
        title="确定要清除所有记忆吗？"
        confirm-button-text="确定"
        cancel-button-text="取消"
        @confirm="handleClearAll"
      >
        <template #reference>
          <el-button type="danger" size="small" :disabled="memoryCount === 0">
            清除全部
          </el-button>
        </template>
      </el-popconfirm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Delete } from '@element-plus/icons-vue';
import { useCharacterIntelligenceStore } from '../stores/characterIntelligence';
import { storeToRefs } from 'pinia';
import { useToast } from '../composables/useToast';
import type { MemoryType } from '../../types/intelligence';

const props = defineProps<{
  characterId: string;
  chatId?: string;
}>();

const store = useCharacterIntelligenceStore();
const { memories, isLoading } = storeToRefs(store);
const { success: showSuccess, error: showError } = useToast();

const selectedType = ref<MemoryType | ''>('');

const memoryCount = computed(() => memories.value.length);

const filteredMemories = computed(() => {
  if (!selectedType.value) return memories.value;
  return memories.value.filter(m => m.type === selectedType.value);
});

const TYPE_CONFIG: Record<MemoryType, { label: string; tagType: 'primary' | 'success' | 'warning' | 'danger' }> = {
  fact: { label: '事实', tagType: 'primary' },
  preference: { label: '偏好', tagType: 'success' },
  relationship: { label: '关系', tagType: 'warning' },
  event: { label: '事件', tagType: 'danger' },
};

function getTypeLabel(type: MemoryType): string {
  return TYPE_CONFIG[type]?.label ?? type;
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
    showSuccess('记忆已删除');
  } catch (e) {
    showError('删除失败');
  }
}

async function handleClearAll() {
  try {
    await store.clearAllMemories(props.characterId, props.chatId);
    showSuccess('所有记忆已清除');
  } catch (e) {
    showError('清除失败');
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
