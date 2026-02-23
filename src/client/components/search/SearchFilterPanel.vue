<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface SearchFilters {
  type: string;
  dateRange: [Date, Date] | null;
  category: string;
  tags: string[];
}

const props = defineProps<{
  modelValue: SearchFilters;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: SearchFilters): void;
}>();

const filters = computed({
  get: () => props.modelValue,
  set: (val: SearchFilters) => emit('update:modelValue', val),
});

function updateField<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}

const typeOptions = [
  { value: 'all', label: () => t('search.tab.all') },
  { value: 'characters', label: () => t('search.tab.characters') },
  { value: 'messages', label: () => t('search.tab.messages') },
  { value: 'worldbooks', label: () => t('search.tab.worldbooks') },
];

const categoryOptions = [
  { value: '', label: () => t('search.filters.allCategories') },
  { value: 'anime', label: 'Anime' },
  { value: 'game', label: 'Game' },
  { value: 'movie', label: 'Movie' },
  { value: 'original', label: 'Original' },
  { value: 'other', label: 'Other' },
];
</script>

<template>
  <div class="search-filter-panel">
    <!-- Type filter -->
    <div class="filter-group">
      <div class="filter-label">{{ t('search.filters.type') }}</div>
      <el-radio-group
        :model-value="filters.type"
        @update:model-value="updateField('type', $event as string)"
        size="small"
      >
        <el-radio-button
          v-for="opt in typeOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label() }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <!-- Date range filter -->
    <div class="filter-group">
      <div class="filter-label">{{ t('search.filters.dateRange') }}</div>
      <el-date-picker
        :model-value="filters.dateRange"
        @update:model-value="updateField('dateRange', $event as [Date, Date] | null)"
        type="daterange"
        size="small"
        style="width: 100%"
        :start-placeholder="t('search.filters.startDate')"
        :end-placeholder="t('search.filters.endDate')"
        value-format="YYYY-MM-DD"
        clearable
      />
    </div>

    <!-- Category filter -->
    <div class="filter-group">
      <div class="filter-label">{{ t('search.filters.category') }}</div>
      <el-select
        :model-value="filters.category"
        @update:model-value="updateField('category', $event as string)"
        size="small"
        style="width: 100%"
        clearable
      >
        <el-option
          v-for="opt in categoryOptions"
          :key="opt.value"
          :value="opt.value"
          :label="typeof opt.label === 'function' ? opt.label() : opt.label"
        />
      </el-select>
    </div>

    <!-- Tags filter -->
    <div class="filter-group">
      <div class="filter-label">{{ t('search.filters.tags') }}</div>
      <el-select
        :model-value="filters.tags"
        @update:model-value="updateField('tags', $event as string[])"
        size="small"
        style="width: 100%"
        multiple
        filterable
        allow-create
        default-first-option
        :placeholder="t('search.filters.tagsPlaceholder')"
      />
    </div>
  </div>
</template>

<style scoped>
.search-filter-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
  background: var(--el-bg-color, #fff);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular, #606266);
}

.search-filter-panel :deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
}

.search-filter-panel :deep(.el-radio-button__inner) {
  padding: 6px 12px;
}
</style>
