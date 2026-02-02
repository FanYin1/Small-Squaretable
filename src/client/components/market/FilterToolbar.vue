<script setup lang="ts">
import { ref, computed } from 'vue';

interface Props {
  selectedCategory: string;
  selectedTags: string[];
  showNsfw: boolean;
  sortBy: string;
}

interface Emits {
  (e: 'update:selectedCategory', value: string): void;
  (e: 'update:selectedTags', value: string[]): void;
  (e: 'update:showNsfw', value: boolean): void;
  (e: 'update:sortBy', value: string): void;
  (e: 'change'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const categories = [
  { label: '全部', value: '' },
  { label: '助手', value: 'assistant' },
  { label: '娱乐', value: 'entertainment' },
  { label: '教育', value: 'education' },
  { label: '游戏', value: 'game' },
  { label: '历史', value: 'historical' },
  { label: '现代', value: 'modern' },
];

const availableTags = [
  'Fantasy',
  'Sci-Fi',
  'Anime',
  'Game',
  'Historical',
  'Modern',
  'Romance',
  'Adventure',
  'Horror',
  'Comedy',
  'Drama',
  'Action',
];

const sortOptions = [
  { label: 'Hot', value: 'popular' },
  { label: 'Latest', value: 'newest' },
  { label: 'Top Rated', value: 'rating' },
  { label: 'Relevance', value: 'relevance' },
];

const handleCategoryChange = (value: string) => {
  emit('update:selectedCategory', value);
  emit('change');
};

const handleTagsChange = (value: string[]) => {
  emit('update:selectedTags', value);
  emit('change');
};

const handleNsfwChange = (value: boolean) => {
  emit('update:showNsfw', value);
  emit('change');
};

const handleSortChange = (value: string) => {
  emit('update:sortBy', value);
  emit('change');
};
</script>

<template>
  <div class="filter-toolbar">
    <div class="filter-item">
      <label class="filter-label">分类</label>
      <el-select
        :model-value="selectedCategory"
        placeholder="选择分类"
        size="default"
        @update:model-value="handleCategoryChange"
      >
        <el-option
          v-for="cat in categories"
          :key="cat.value"
          :label="cat.label"
          :value="cat.value"
        />
      </el-select>
    </div>

    <div class="filter-item">
      <label class="filter-label">标签</label>
      <el-select
        :model-value="selectedTags"
        placeholder="选择标签"
        multiple
        collapse-tags
        collapse-tags-tooltip
        :max-collapse-tags="2"
        size="default"
        @update:model-value="handleTagsChange"
      >
        <el-option
          v-for="tag in availableTags"
          :key="tag"
          :label="tag"
          :value="tag"
        />
      </el-select>
    </div>

    <div class="filter-item">
      <el-checkbox
        :model-value="showNsfw"
        @update:model-value="handleNsfwChange"
      >
        显示 NSFW
      </el-checkbox>
    </div>

    <div class="filter-item">
      <label class="filter-label">排序</label>
      <el-select
        :model-value="sortBy"
        size="default"
        @update:model-value="handleSortChange"
      >
        <el-option
          v-for="option in sortOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
    </div>
  </div>
</template>

<style scoped>
.filter-toolbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 20px 24px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  border: 1px solid #E5E7EB;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 14px;
  font-weight: 500;
  color: #4B5563;
  white-space: nowrap;
}

.filter-item :deep(.el-select) {
  min-width: 140px;
}

.filter-item :deep(.el-checkbox) {
  font-size: 14px;
}

/* 移动端适配 */
@media (max-width: 767px) {
  .filter-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .filter-item {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .filter-item :deep(.el-select) {
    width: 100%;
  }
}
</style>
