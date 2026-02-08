<template>
  <div class="message-input">
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
    <div class="input-footer">
      <span class="char-count" :class="{ 'char-count-warning': isNearLimit }">
        {{ inputValue.length }} / {{ maxLength }}
        <span v-if="inputValue.length > 0" class="token-estimate">~{{ estimatedTokens }} tokens</span>
      </span>
      <el-button
        type="primary"
        :disabled="!canSend"
        :loading="sending"
        @click="handleSend"
        :icon="Position"
      >
        {{ sending ? t('common.sending') : t('common.send') }}
      </el-button>
    </div>
    <div class="input-hint">
      {{ t('chat.inputHint') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Position } from '@element-plus/icons-vue';

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
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background-color: var(--surface-card);
  border-top: 1px solid var(--border-default);
}

.input-textarea {
  width: 100%;
}

.input-textarea :deep(.el-textarea__inner) {
  font-size: 14px;
  line-height: 1.5;
  padding: 12px;
  transition: height 0.15s ease;
}

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-footer :deep(.el-button--primary) {
  background: var(--accent-gradient);
  border: none;
  border-radius: 9999px;
  padding: 8px 20px;
  transition: all 0.2s ease;
}

.input-footer :deep(.el-button--primary:hover) {
  opacity: 0.9;
  transform: scale(1.02);
}

.input-footer :deep(.el-button--primary:active) {
  transform: scale(0.98);
}

.char-count {
  font-size: 12px;
  color: var(--text-secondary);
  transition: color 0.3s;
}

.char-count-warning {
  color: var(--color-warning);
  font-weight: 500;
}

.input-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
}

.token-estimate {
  margin-left: 8px;
  color: var(--text-tertiary);
  font-size: 11px;
}
</style>
