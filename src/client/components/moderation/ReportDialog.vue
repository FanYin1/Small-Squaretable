<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { reportApi } from '@client/services/report.api';
import {
  VIOLATION_CATEGORIES,
  REPORT_REASON_MAX_LENGTH,
  type ViolationCategory,
  type ReportTargetType,
} from '@/types/moderation';

const props = defineProps<{
  modelValue: boolean;
  targetType: ReportTargetType;
  targetId: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submitted: [];
}>();

const { t } = useI18n();

// 空串表示未选择：分类是必填的，不给默认值，否则用户会误提交 'other'
const category = ref<ViolationCategory | ''>('');
const reason = ref('');
const submitting = ref(false);

// 每次打开都清空，否则上一次的选择会留在表单里
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      category.value = '';
      reason.value = '';
    }
  },
);

async function submit() {
  if (!category.value) {
    ElMessage.warning(t('report.categoryRequired'));
    return;
  }
  const trimmed = reason.value.trim();
  if (!trimmed) {
    ElMessage.warning(t('report.reasonRequired'));
    return;
  }

  submitting.value = true;
  try {
    await reportApi.submitReport({
      targetType: props.targetType,
      targetId: props.targetId,
      category: category.value,
      reason: trimmed,
    });
    ElMessage.success(t('report.submitSuccess'));
    emit('submitted');
    emit('update:modelValue', false);
  } catch (error: unknown) {
    // 失败时不关闭、不清空：举报有频率限制，重试时不该让用户重写理由
    ElMessage.error(error instanceof Error ? error.message : t('report.submitFailed'));
  } finally {
    submitting.value = false;
  }
}

function close() {
  emit('update:modelValue', false);
}

defineExpose({ category, reason, submitting, submit });
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('report.title')"
    width="480px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="report-hint">{{ t('report.hint') }}</p>

    <el-form label-position="top">
      <el-form-item :label="t('report.category')">
        <el-radio-group v-model="category" class="category-group">
          <el-radio
            v-for="item in VIOLATION_CATEGORIES"
            :key="item"
            :value="item"
            class="category-option"
          >
            {{ t(`report.categories.${item}`) }}
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="t('report.reason')">
        <el-input
          v-model="reason"
          type="textarea"
          :rows="4"
          :maxlength="REPORT_REASON_MAX_LENGTH"
          show-word-limit
          :placeholder="t('report.reasonPlaceholder')"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="close">{{ t('common.cancel') }}</el-button>
      <el-button
        type="danger"
        :loading="submitting"
        :disabled="!category || !reason.trim()"
        @click="submit"
      >
        {{ t('report.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.report-hint {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.category-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.category-option {
  margin-right: 0;
}
</style>
