<template>
  <div class="message-input">
    <div v-if="chatStore.replyingTo" class="reply-preview">
      <div class="reply-preview-content">
        <span class="reply-preview-label">{{ t('chat.replyingTo') }}:</span>
        {{ chatStore.replyingTo.content?.substring(0, 80) }}{{ (chatStore.replyingTo.content?.length ?? 0) > 80 ? '...' : '' }}
      </div>
      <el-button link size="small" @click="chatStore.setReplyTo(null)">
        <el-icon><CloseBold /></el-icon>
      </el-button>
    </div>
    <div class="input-wrapper">
      <!-- @mention autocomplete popup -->
      <div v-if="showMentionPopup && filteredMentionCharacters.length > 0" class="mention-popup">
        <div
          v-for="char in filteredMentionCharacters"
          :key="char.id"
          class="mention-item"
          @mousedown.prevent="selectMention(char)"
        >
          <el-avatar :size="24" :src="char.avatar">{{ char.name?.[0]?.toUpperCase() || '?' }}</el-avatar>
          <span class="mention-name">{{ char.name }}</span>
        </div>
      </div>
      <!-- TODO: File attachment button (pending feature implementation) -->
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
      <template v-else-if="!isUploading">
        <span v-if="isNearLimit" class="char-count" :class="{ 'char-count--over': inputValue.length >= maxLength }">
          {{ maxLength - inputValue.length }}
        </span>
        <button
          class="send-btn"
          type="button"
          :disabled="!canSend"
          @click="handleSend"
          :aria-label="sending ? t('common.sending') : t('common.send')"
        >
          <el-icon :size="18"><Position /></el-icon>
        </button>
      </template>
    </div>

    <!-- Quick Replies -->
    <div v-if="enabledQuickReplies.length > 0" class="quick-replies">
      <el-button
        v-for="reply in enabledQuickReplies"
        :key="reply.id"
        size="small"
        @click="handleQuickReply(reply)"
      >
        {{ reply.label }}
      </el-button>
    </div>

    <div class="input-hint">
      {{ t('chat.inputHint') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Position, Microphone, Close, CloseBold, Check, Loading, Headset, VideoPause } from '@element-plus/icons-vue';
import { useAudioRecorder } from '@client/composables/useAudioRecorder';
import { useSpeechToText } from '@client/composables/useSpeechToText';
import { uploadApi } from '@client/services/upload.api';
import { useToast } from '@client/composables/useToast';
import { useChatStore } from '@client/stores/chat';
import { getEnabledQuickReplies, type QuickReply } from '@client/services/quick-reply.api';
import type { MessageAttachment } from '@client/types';

interface Props {
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  sending?: boolean;
  isStreaming?: boolean;
  characters?: Array<{ id: string; name: string; avatar?: string }>;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  maxLength: 4000,
  disabled: false,
  sending: false,
  isStreaming: false,
  characters: () => [],
});

const emit = defineEmits<{
  (e: 'send', content: string, attachments?: MessageAttachment[], mentionedCharacterIds?: string[]): void;
  (e: 'stopGeneration'): void;
}>();

const { t } = useI18n();
const toast = useToast();
const chatStore = useChatStore();
const audioRecorder = useAudioRecorder();
const stt = useSpeechToText();
const inputValue = ref('');
const isUploading = ref(false);
const enabledQuickReplies = ref<QuickReply[]>([]);

// Load quick replies on mount
onMounted(async () => {
  try {
    enabledQuickReplies.value = await getEnabledQuickReplies();
  } catch (error) {
    // Silently fail - quick replies are optional
  }
});

// Handle quick reply click
function handleQuickReply(reply: QuickReply) {
  // Apply macro replacements
  let message = reply.message;

  // Get character name from chat store
  const characterName = chatStore.currentChat?.characterName || 'Character';
  const userName = 'User'; // TODO: Get from user store

  // Replace {{char}} and {{user}} macros
  message = message.replace(/\{\{char\}\}/gi, characterName);
  message = message.replace(/\{\{user\}\}/gi, userName);

  // Set input value
  inputValue.value = message;
}

// @mention autocomplete state
const showMentionPopup = ref(false);
const mentionQuery = ref('');
const mentionStartIndex = ref(-1);

const filteredMentionCharacters = computed(() => {
  if (!mentionQuery.value) return props.characters;
  const q = mentionQuery.value.toLowerCase();
  return props.characters.filter(c => c.name.toLowerCase().includes(q));
});

function extractMentionedIds(text: string): string[] {
  const ids: string[] = [];
  const mentionPattern = /@(\S+)/g;
  let m;
  while ((m = mentionPattern.exec(text)) !== null) {
    const name = m[1];
    const char = props.characters.find(c => c.name === name);
    if (char) ids.push(char.id);
  }
  return ids;
}

function selectMention(character: { id: string; name: string }) {
  const before = inputValue.value.slice(0, mentionStartIndex.value);
  const after = inputValue.value.slice(mentionStartIndex.value + mentionQuery.value.length + 1); // +1 for @
  inputValue.value = `${before}@${character.name} ${after}`;
  showMentionPopup.value = false;
  mentionQuery.value = '';
  mentionStartIndex.value = -1;
}

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

  // Detect @mention trigger
  if (props.characters.length > 0) {
    const text = inputValue.value;
    const lastAt = text.lastIndexOf('@');
    if (lastAt >= 0) {
      const afterAt = text.slice(lastAt + 1);
      // Only show popup if no space after the query (still typing the name)
      if (!afterAt.includes(' ')) {
        mentionStartIndex.value = lastAt;
        mentionQuery.value = afterAt;
        showMentionPopup.value = true;
        return;
      }
    }
    showMentionPopup.value = false;
  }
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
  showMentionPopup.value = false;
  const content = inputValue.value.trim();
  if (content) {
    const mentionedIds = extractMentionedIds(content);
    emit('send', content, undefined, mentionedIds.length > 0 ? mentionedIds : undefined);
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
  max-width: 720px;
  margin: 0 auto;
  padding: 12px 20px;
}

.reply-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--bg-subtle, #fafafa);
  border-left: 3px solid var(--accent, #D97706);
  border-radius: 4px;
  margin-bottom: 8px;
  font-size: 13px;
}

.reply-preview-content {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary, #909399);
}

.reply-preview-label {
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  border-radius: 24px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  padding: 8px 16px;
  gap: 8px;
  transition: border-color 0.2s;
  position: relative;
}

.mention-popup {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 4px;
  z-index: 100;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.mention-item:hover {
  background: var(--surface-hover);
}

.mention-name {
  font-size: 14px;
  color: var(--text-primary);
}

.input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.1);
}

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
  color: var(--accent-text);
  background-color: color-mix(in srgb, var(--accent) 12%, transparent);
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
  background: var(--color-danger);
  flex-shrink: 0;
  animation: pulse-dot 1s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.recording-label {
  font-size: 14px;
  color: var(--color-danger-text);
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
  background: var(--color-danger);
  color: var(--text-inverse);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.char-count {
  font-size: 12px;
  color: var(--el-color-warning, #e6a23c);
  flex-shrink: 0;
  align-self: center;
  font-variant-numeric: tabular-nums;
}

.char-count--over {
  color: var(--color-danger, #f56c6c);
  font-weight: 600;
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--text-inverse);
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
  background: var(--color-danger);
  color: var(--text-inverse);
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

.quick-replies {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding: 0 4px;
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
