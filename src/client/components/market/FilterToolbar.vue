<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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

const categories = computed(() => [
  { label: t('market.filters.all'), value: '' },
  { label: t('market.filters.assistant'), value: 'assistant' },
  { label: t('market.filters.entertainment'), value: 'entertainment' },
  { label: t('market.filters.education'), value: 'education' },
  { label: t('market.filters.game'), value: 'game' },
  { label: t('market.filters.historical'), value: 'historical' },
  { label: t('market.filters.modern'), value: 'modern' },
]);

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

const sortOptions = computed(() => [
  { label: t('market.filters.hot'), value: 'popular' },
  { label: t('market.filters.latest'), value: 'newest' },
  { label: t('market.filters.topRated'), value: 'rating' },
  { label: t('market.filters.relevance'), value: 'relevance' },
]);

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
      <label class="filter-label">{{ $t('market.filters.category') }}</label>
      <el-select
        popper-class="im-select-popper"
        :model-value="selectedCategory"
        :placeholder="$t('market.filters.selectCategory')"
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
      <label class="filter-label">{{ $t('market.filters.tags') }}</label>
      <el-select
        popper-class="im-select-popper"
        :model-value="selectedTags"
        :placeholder="$t('market.filters.selectTags')"
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
        {{ $t('market.filters.showNsfw') }}
      </el-checkbox>
    </div>

    <div class="filter-item">
      <label class="filter-label">{{ $t('market.filters.sort') }}</label>
      <el-select
        popper-class="im-select-popper"
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
/* 取值改走令牌：原先硬编码 white / #E5E7EB / #4B5563 在深色表面上会整块发白。
   该组件只被 Market 使用，改动范围可控。 */
.filter-toolbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 20px 24px;
  background: var(--bg-surface);
  border-radius: 12px;
  /* 深色下阴影不可见，分隔完全交给边框承担 */
  border: 1px solid var(--border-default);
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
  color: var(--text-secondary);
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
