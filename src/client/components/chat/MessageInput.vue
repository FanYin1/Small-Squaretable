<template>
  <div class="message-input">
    <div class="input-wrapper">
      <button class="attach-btn" type="button" aria-label="Attach file">
        <el-icon :size="20"><Upload /></el-icon>
      </button>
      <button
        v-if="audioRecorder.isSupported.value && !audioRecorder.isRecording.value && !isUploading"
        class="mic-btn"
        type="button"
        :disabled="disabled || sending"
        :aria-label="t('voice.record')"
        @click="handleStartRecording"
      >
        <el-icon :size="20"><Microphone /></el-icon>
      </button>

      <button
        v-if="stt.isSupported.value && !audioRecorder.isRecording.value && !isUploading"
        class="stt-btn"
        :class="{ 'stt-active': stt.isListening.value }"
        type="button"
        :disabled="disabled || sending"
        :aria-label="stt.isListening.value ? t('voice.listening') : t('voice.speechToText')"
        @click="toggleStt"
      >
        <el-icon :size="20"><Headset /></el-icon>
      </button>

      <!-- Recording indicator (replaces text input while recording) -->
      <div v-if="audioRecorder.isRecording.value" class="recording-indicator">
        <span class="recording-dot" />
        <span class="recording-label">{{ t('voice.recording') }}</span>
        <span class="recording-duration">{{ formattedDuration }}</span>
      </div>

      <!-- Uploading spinner -->
      <div v-else-if="isUploading" class="uploading-indicator">
        <el-icon class="is-loading" :size="18"><Loading /></el-icon>
        <span class="uploading-label">{{ t('voice.uploading') }}</span>
      </div>

      <!-- Normal text input -->
      <el-input
        v-else
        v-model="inputValue"
        type="textarea"
        :placeholder="computedPlaceholder"
        :autosize="{ minRows: 1, maxRows: 5 }"
        :maxlength="maxLength"
        :disabled="disabled || sending"
        @keydown="handleKeyDown"
        @input="handleTypingInput"
        class="input-textarea"
        resize="none"
      />

      <!-- Recording action buttons -->
      <template v-if="audioRecorder.isRecording.value">
        <button
          class="cancel-recording-btn"
          type="button"
          :aria-label="t('common.cancel')"
          @click="handleCancelRecording"
        >
          <el-icon :size="18"><Close /></el-icon>
        </button>
        <button
          class="send-recording-btn"
          type="button"
          :aria-label="t('common.send')"
          @click="handleSendRecording"
        >
          <el-icon :size="18"><Check /></el-icon>
        </button>
      </template>

      <!-- Stop generation button -->
      <button
        v-else-if="!isUploading && props.isStreaming"
        class="stop-btn"
        type="button"
        @click="emit('stopGeneration')"
        :aria-label="t('chat.stopGeneration')"
      >
        <el-icon :size="18"><VideoPause /></el-icon>
      </button>

      <!-- Normal send button -->
      <button
        v-else-if="!isUploading"
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
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Position, Upload, Microphone, Close, Check, Loading, Headset, VideoPause } from '@element-plus/icons-vue';
import { useAudioRecorder } from '@client/composables/useAudioRecorder';
import { useSpeechToText } from '@client/composables/useSpeechToText';
import { uploadApi } from '@client/services/upload.api';
import { useToast } from '@client/composables/useToast';
import { useChatStore } from '@client/stores/chat';
import type { MessageAttachment } from '@client/types';

interface Props {
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  sending?: boolean;
  isStreaming?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  maxLength: 4000,
  disabled: false,
  sending: false,
  isStreaming: false,
});

const emit = defineEmits<{
  (e: 'send', content: string, attachments?: MessageAttachment[]): void;
  (e: 'stopGeneration'): void;
}>();

const { t } = useI18n();
const toast = useToast();
const chatStore = useChatStore();
const audioRecorder = useAudioRecorder();
const stt = useSpeechToText();
const inputValue = ref('');
const isUploading = ref(false);

// Debounced typing indicator
let typingTimeout: ReturnType<typeof setTimeout> | null = null;
let isCurrentlyTyping = false;

function handleTypingInput() {
  if (!isCurrentlyTyping) {
    isCurrentlyTyping = true;
    chatStore.sendTypingStart();
  }
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isCurrentlyTyping = false;
    chatStore.sendTypingStop();
  }, 2000);
}

function stopTypingIndicator() {
  if (isCurrentlyTyping) {
    isCurrentlyTyping = false;
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = null;
    chatStore.sendTypingStop();
  }
}

const computedPlaceholder = computed(() => {
  if (stt.isListening.value && stt.interimTranscript.value) {
    return stt.interimTranscript.value;
  }
  return props.placeholder || t('chat.inputPlaceholder');
});

// Append final STT transcript to input
watch(() => stt.transcript.value, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal) {
    inputValue.value += newVal;
    stt.clearTranscript();
  }
});

const toggleStt = () => {
  if (stt.isListening.value) {
    stt.stopListening();
  } else {
    stt.startListening();
    if (stt.error.value) {
      toast.error(stt.error.value);
    }
  }
};

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

const formattedDuration = computed(() => {
  const mins = Math.floor(audioRecorder.duration.value / 60);
  const secs = audioRecorder.duration.value % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
});

const handleSend = () => {
  if (!canSend.value) return;

  stopTypingIndicator();
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

const handleStartRecording = async () => {
  await audioRecorder.startRecording();
  if (audioRecorder.error.value) {
    toast.error(audioRecorder.error.value);
  }
};

const handleCancelRecording = () => {
  audioRecorder.cancelRecording();
};

const handleSendRecording = async () => {
  try {
    const blob = await audioRecorder.stopRecording();
    isUploading.value = true;

    const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
    const result = await uploadApi.uploadAudio(file);

    const attachment: MessageAttachment = {
      id: crypto.randomUUID(),
      type: 'audio',
      url: result.url,
      name: file.name,
      size: file.size,
    };

    emit('send', '', [attachment]);
  } catch (err) {
    toast.error(t('chat.uploadFailed'));
  } finally {
    isUploading.value = false;
  }
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

.attach-btn,
.mic-btn,
.stt-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  transition: color 0.2s, background-color 0.2s;
}

.stt-btn.stt-active {
  color: var(--accent-purple);
  background-color: color-mix(in srgb, var(--accent-purple) 12%, transparent);
}

.mic-btn:disabled,
.stt-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

.recording-indicator {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  min-height: 33px;
}

.recording-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  flex-shrink: 0;
  animation: pulse-dot 1s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.recording-label {
  font-size: 14px;
  color: #ef4444;
}

.recording-duration {
  font-size: 14px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.uploading-indicator {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  min-height: 33px;
  color: var(--text-tertiary);
}

.uploading-label {
  font-size: 14px;
}

.cancel-recording-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--surface-hover, #f3f4f6);
  color: var(--text-secondary);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-recording-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #ef4444;
  color: white;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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

.stop-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #ef4444;
  color: white;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse-stop 1.5s ease-in-out infinite;
}

@keyframes pulse-stop {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.input-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 8px;
}

@media (max-width: 768px) {
  .message-input {
    padding: 8px 12px;
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  }
  .input-wrapper {
    padding: 6px 8px;
    border-radius: 20px;
  }
}
</style>
