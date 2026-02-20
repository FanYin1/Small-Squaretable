<template>
  <div class="message-input">
    <div class="input-wrapper">
      <button class="attach-btn" type="button" aria-label="Attach file">
        <el-icon :size="20"><Upload /></el-icon>
      </button>
      <el-input
        v-model="inputValue"
        type="textarea"
        :placeholder="computedPlaceholder"
        :autosize="{ minRows: 1, maxRows: 5 }"
        :maxlength="maxLength"
        :disabled="disabled || sending"
        @keydown="handleKeyDown"
        class="input-textarea"
        resize="none"
      />
      <button
        class="send-btn"
        type="button"
        :disabled="!canSend"
        @click="handleSend"
        :aria-label="sending ? t('common.sending') : t('common.send')"
      >
        <el-icon :size="18"><Position /></el-icon>
      </button>
    </div>
    <div class="input-hint">
      {{ t('chat.inputHint') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Position, Upload } from '@element-plus/icons-vue';

interface Props {
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  sending?: boolean;
}

interface Emits {
  (e: 'send', content: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  maxLength: 4000,
  disabled: false,
  sending: false,
});

const emit = defineEmits<Emits>();

const { t } = useI18n();
const inputValue = ref('');

const computedPlaceholder = computed(() => {
  return props.placeholder || t('chat.inputPlaceholder');
});

const canSend = computed(() => {
  return inputValue.value.trim().length > 0 && !props.sending && !props.disabled;
});

const isNearLimit = computed(() => {
  return inputValue.value.length > props.maxLength * 0.9;
});

const estimatedTokens = computed(() => {
  const text = inputValue.value;
  if (!text) return 0;
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const asciiCount = text.length - cjkCount;
  return Math.ceil(cjkCount * 1.5 + asciiCount * 0.25);
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
  max-width: 900px;
  margin: 0 auto;
  padding: 16px 24px;
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  border-radius: 24px;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  padding: 8px 16px;
  gap: 8px;
  transition: border-color 0.2s;
}

.input-wrapper:focus-within {
  border-color: var(--accent-purple);
}

.attach-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 8px;
  flex-shrink: 0;
}

.input-textarea {
  flex: 1;
  min-width: 0;
}

.input-textarea :deep(.el-textarea__inner) {
  font-size: 14px;
  line-height: 1.5;
  padding: 6px 0;
  border: none;
  background: transparent;
  box-shadow: none;
  resize: none;
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-purple);
  color: white;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.input-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 8px;
}
</style>
