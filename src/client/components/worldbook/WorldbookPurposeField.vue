<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { worldbookPurposeSchema } from '../../../types/story-diagnostics';

const purpose = defineModel<string>();
const { t } = useI18n();
const unknownPurpose = computed(() => purpose.value && !worldbookPurposeSchema.safeParse(purpose.value).success);
</script>

<template>
  <el-form-item :label="t('worldBookEditor.purpose')">
    <el-select v-model="purpose" :aria-label="t('worldBookEditor.purpose')" clearable :placeholder="t('worldBookEditor.purposeUnset')" style="width: 100%">
      <el-option v-if="unknownPurpose" :value="purpose" :label="t('worldBookEditor.purposeUnknown', { value: purpose })" />
      <el-option v-for="value in worldbookPurposeSchema.options" :key="value" :value="value" :label="t(`worldBookEditor.purpose_${value}`)" />
    </el-select>
    <p class="purpose-hint">{{ t('worldBookEditor.purposeHint') }}</p>
  </el-form-item>
</template>

<style scoped>
.purpose-hint { color: var(--text-secondary); font-size: 12px; line-height: 1.6; margin: 6px 0 0; }
</style>
