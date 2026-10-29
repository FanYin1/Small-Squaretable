<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps<{ modelValue: boolean; inline?: boolean; title: string; busy?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; closed: [] }>();
const heading = ref<HTMLElement>();
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) });
watch(() => [props.inline, props.modelValue], async () => {
  if (!props.inline || !props.modelValue) return;
  await nextTick();
  if (props.inline && props.modelValue) heading.value?.focus({ preventScroll: true });
}, { immediate: true });
</script>

<template>
  <section v-if="inline && visible" class="story-identity-page">
    <div class="identity-preview"><slot name="preview" /></div>
    <div class="identity-form">
      <h1 ref="heading" tabindex="-1">{{ title }}</h1>
      <slot />
      <div class="identity-actions"><slot name="footer" /></div>
    </div>
  </section>
  <el-dialog v-else-if="!inline" v-model="visible" :title="title" width="min(500px, calc(100vw - 32px))"
    :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" @closed="emit('closed')">
    <slot />
    <template #footer><slot name="footer" /></template>
  </el-dialog>
</template>

<style scoped lang="scss">
.story-identity-page { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 440px); align-items: start; gap: 56px; }
.identity-preview, .identity-form { min-width: 0; }
.identity-form { padding: 28px; border: 1px solid var(--border-default); border-radius: 12px; background: var(--bg-surface); }
h1 { font: 500 28px/1.5 var(--font-display); margin: 0 0 24px; }
h1:focus { outline: none; }
.identity-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.identity-actions :deep(.el-button) { margin: 0; white-space: normal; height: auto; }
@include below(md) { .story-identity-page { grid-template-columns: minmax(0, 1fr); gap: 28px; } .identity-form { padding: 20px; } }
</style>
