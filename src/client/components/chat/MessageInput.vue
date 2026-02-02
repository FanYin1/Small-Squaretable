<template>
  <div class="message-input">
    <el-input
      v-model="inputValue"
      type="textarea"
      :placeholder="placeholder"
      :rows="rows"
      :maxlength="maxLength"
      :disabled="disabled || sending"
      @keydown="handleKeyDown"
      class="input-textarea"
      resize="none"
    />
    <div class="input-footer">
      <span class="char-count" :class="{ 'char-count-warning': isNearLimit }">
        {{ inputValue.length }} / {{ maxLength }}
      </span>
      <el-button
        type="primary"
        :disabled="!canSend"
        :loading="sending"
        @click="handleSend"
        :icon="Position"
      >
        {{ sending ? 'Sending...' : 'Send' }}
      </el-button>
    </div>
    <div class="input-hint">
      Press <kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for new line
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Position } from '@element-plus/icons-vue';

interface Props {
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
  sending?: boolean;
}

interface Emits {
  (e: 'send', content: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Type your message...',
  maxLength: 4000,
  rows: 3,
  disabled: false,
  sending: false,
});

const emit = defineEmits<Emits>();

const inputValue = ref('');

const canSend = computed(() => {
  return inputValue.value.trim().length > 0 && !props.sending && !props.disabled;
});

const isNearLimit = computed(() => {
  return inputValue.value.length > props.maxLength * 0.9;
});

const handleSend = () => {
  if (!canSend.value) return;

  const content = inputValue.value.trim();
  if (content) {
    emit('send', content);
    inputValue.value = '';
  }
};

const handleKeyDown = (event: KeyboardEvent) => {
  // Enter without Shift = send message
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
  // Shift + Enter = new line (default behavior)
};
</script>

<style scoped>
.message-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background-color: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color);
}

.input-textarea {
  width: 100%;
}

.input-textarea :deep(.el-textarea__inner) {
  font-size: 14px;
  line-height: 1.5;
  padding: 12px;
}

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.char-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: color 0.3s;
}

.char-count-warning {
  color: var(--el-color-warning);
  font-weight: 500;
}

.input-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  font-size: 11px;
  line-height: 1;
  color: var(--el-text-color-regular);
  background-color: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  box-shadow: 0 1px 0 var(--el-border-color);
  font-family: 'Courier New', monospace;
}
</style>
