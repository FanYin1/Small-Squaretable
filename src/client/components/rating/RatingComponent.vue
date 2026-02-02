<script setup lang="ts">
import { computed } from 'vue';
import { ElRate } from 'element-plus';

interface Props {
  modelValue: number;
  readonly?: boolean;
  disabled?: boolean;
  allowHalf?: boolean;
  allowClear?: boolean;
  showScore?: boolean;
  showCount?: boolean;
  showText?: boolean;
  count?: number;
  text?: string;
  texts?: string[];
  colors?: string[];
  size?: 'small' | 'default' | 'large';
  max?: number;
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  disabled: false,
  allowHalf: true,
  allowClear: false,
  showScore: false,
  showCount: false,
  showText: false,
  size: 'default',
  max: 5,
  colors: () => ['#F7BA2A', '#F7BA2A', '#F7BA2A'],
});

const emit = defineEmits<{
  'update:modelValue': [value: number];
  change: [value: number];
}>();

const displayValue = computed(() => {
  return props.modelValue.toFixed(1);
});

function handleChange(value: number) {
  if (!props.disabled) {
    emit('update:modelValue', value);
    emit('change', value);
  }
}
</script>

<template>
  <div class="rating-component">
    <ElRate
      :model-value="modelValue"
      :disabled="disabled || readonly"
      :allow-half="allowHalf"
      :clearable="allowClear"
      :show-text="showText"
      :texts="texts"
      :colors="colors"
      :size="size"
      :max="max"
      @update:model-value="handleChange"
    />

    <span v-if="showScore" class="rating-score">
      {{ displayValue }}
    </span>

    <span v-if="showCount && count !== undefined" class="rating-count">
      ({{ count }})
    </span>

    <span v-if="text" class="rating-text">
      {{ text }}
    </span>
  </div>
</template>

<style scoped>
.rating-component {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.rating-score {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.rating-count {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.rating-text {
  font-size: 14px;
  color: var(--el-text-color-regular);
}
</style>
