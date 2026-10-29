<template>
  <button class="scroll-to-bottom" v-if="visible" type="button" :aria-label="label || t('chat.scrollToBottom')" @click="$emit('click')">
    <span aria-hidden="true">↓</span>
    <span>{{ label || t('chat.scrollToBottom') }}</span>
  </button>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
defineProps<{ visible?: boolean; label?: string }>();
defineEmits(['click']);
const { t } = useI18n();
</script>

<style scoped>
.scroll-to-bottom {
  position: sticky;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  min-height: 44px;
  margin: 0 auto;
  padding: 8px 16px;
  border: 1px solid var(--border-default);
  border-radius: 24px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}

.scroll-to-bottom:hover {
  background: var(--bg-subtle);
}

.scroll-to-bottom:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
</style>
