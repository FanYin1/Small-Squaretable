<template>
  <div class="chat-window">
    <div class="chat-header" v-if="currentChat">
      <div class="chat-info">
        <!-- Group chat: stacked avatars + character count -->
        <template v-if="isGroupChat">
          <div class="stacked-avatars">
            <el-avatar
              v-for="(char, idx) in chatStore.chatCharacters.slice(0, 3)"
              :key="char.id"
              :size="32"
              :src="char.avatar"
              :style="{ marginLeft: idx > 0 ? '-10px' : '0', zIndex: 3 - idx }"
              class="stacked-avatar"
            >{{ char.name?.[0]?.toUpperCase() || '?' }}</el-avatar>
          </div>
          <div class="chat-details">
            <h3 class="chat-title">{{ currentChat.title || currentChat.characterName }}</h3>
            <span class="chat-subtitle">{{ t('groupChat.characters', { count: chatStore.chatCharacters.length }) }}</span>
          </div>
        </template>
        <!-- Single chat: original display -->
        <template v-else>
          <div class="chat-details">
            <h3 class="chat-title">{{ currentChat.characterName }}</h3>
            <span class="chat-subtitle">{{ emotionEmoji }} {{ intelligenceStore.emotionLabel }}</span>
          </div>
        </template>
      </div>
      <div class="chat-actions">
        <el-tooltip v-if="isGroupChat" :content="t('groupChat.manageCharacters')" placement="bottom">
          <el-button size="small" @click="showManageDialog = true">{{ t('groupChat.manageCharacters') }}</el-button>
        </el-tooltip>
        <el-tooltip :content="t('chat.memory')" placement="bottom">
          <el-button
            size="small"
            @click="openIntelligenceTab('memory')"
          >{{ t('chat.memory') }}</el-button>
        </el-tooltip>
        <el-tooltip :content="t('chat.debug')" placement="bottom">
          <el-badge :value="intelligenceStore.debugEventCount" :hidden="intelligenceStore.debugEventCount === 0" :max="99">
            <el-button
              size="small"
              @click="openIntelligenceTab('debug')"
            >{{ t('chat.debug') }}</el-button>
          </el-badge>
        </el-tooltip>
        <el-tooltip v-if="currentChat?.characterId" :content="t('character.growth')" placement="bottom">
          <el-button
            size="small"
            @click="showGrowthPanel = true"
          >{{ t('character.growth') }}</el-button>
        </el-tooltip>
        <el-tooltip :content="t('chat.pinnedMessages')" placement="bottom">
          <el-button
            size="small"
            @click="showPinnedDrawer = true"
          >{{ t('chat.pinnedMessages') }}</el-button>
        </el-tooltip>
        <el-select
          v-if="chatStore.availableModels.length > 0 && currentChat"
          :model-value="chatStore.currentModel"
          size="small"
          style="width: 180px"
          @change="handleModelChange"
        >
          <el-option
            v-for="m in chatStore.availableModels"
            :key="m.id"
            :label="m.id"
            :value="m.id"
          >
            <span>{{ m.id }}</span>
            <span style="float: right; color: var(--el-text-color-secondary); font-size: 12px">
              {{ formatContextWindow(m.contextWindow) }}
            </span>
          </el-option>
        </el-select>
        <el-dropdown trigger="click" @command="handleExportDropdown">
          <el-button text>
            <el-icon><Download /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="json">{{ t('chat.exportJson') }}</el-dropdown-item>
              <el-dropdown-item command="txt">{{ t('chat.exportTxt') }}</el-dropdown-item>
              <el-dropdown-item command="snapshot" divided>{{ t('share.createSnapshot') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown trigger="click" @command="handleMenuCommand">
          <el-button link :icon="More" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="search">{{ t('chat.searchMessages') }}</el-dropdown-item>
              <el-dropdown-item command="export-json">{{ t('chat.exportJson') }}</el-dropdown-item>
              <el-dropdown-item command="export-md">{{ t('chat.exportMarkdown') }}</el-dropdown-item>
              <el-dropdown-item command="export-txt">{{ t('chat.exportText') }}</el-dropdown-item>
              <el-dropdown-item command="rename" divided>{{ t('chat.renameTitle') }}</el-dropdown-item>
              <el-dropdown-item command="delete" divided>{{ t('chat.deleteTitle') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div v-if="showSearch" class="chat-search-bar">
      <el-input
        v-model="chatStore.searchQuery"
        :placeholder="t('chat.searchMessages')"
        clearable
        size="small"
        @input="handleSearchInput"
        @clear="chatStore.clearSearch()"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <span v-if="chatStore.searchResults.length" class="search-count">
        {{ chatStore.searchResults.length }} {{ t('chat.results') }}
      </span>
    </div>

    <div class="chat-messages" ref="messagesContainer" @scroll="handleScroll" aria-live="polite"
      @touchstart.passive="handleTouchStart"
      @touchmove.passive="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- Pull-to-refresh indicator -->
      <div class="pull-refresh-indicator" :class="{ active: pullRefreshState === 'ready', pulling: pullRefreshState === 'pulling', refreshing: pullRefreshState === 'refreshing' }" :style="{ transform: `translateY(${pullDistance}px)`, opacity: pullDistance > 0 ? 1 : 0 }">
        <div v-if="pullRefreshState === 'refreshing'" class="pull-refresh-spinner">
          <el-icon class="is-loading"><Loading /></el-icon>
        </div>
        <div v-else class="pull-refresh-arrow" :style="{ transform: pullRefreshState === 'ready' ? 'rotate(180deg)' : 'rotate(0deg)' }">
          &#8595;
        </div>
        <span class="pull-refresh-text">{{ pullRefreshText }}</span>
      </div>

      <div v-if="loading" class="loading-container">
        <el-skeleton :rows="5" animated />
      </div>

      <template v-else>
        <ExpressionSprite
          v-if="characterExpressions"
          :expressions="characterExpressions"
          :emotion-label="intelligenceStore.emotionLabel || 'neutral'"
        />

        <div v-if="messages.length === 0 && currentGreeting" class="greeting-container">
        <div class="message-bubble message-assistant">
          <div class="message-content">
            <MarkdownRenderer :content="currentGreeting" />
          </div>
        </div>
        <div v-if="hasAlternateGreetings" class="greeting-swipe">
          <button class="swipe-btn" :aria-label="t('chat.previousGreeting') || 'Previous greeting'" @click="prevGreeting" :disabled="greetingIndex <= 0">
            <span>&lt;</span>
          </button>
          <span class="swipe-indicator">{{ greetingIndex + 1 }} / {{ totalGreetings }}</span>
          <button class="swipe-btn" :aria-label="t('chat.nextGreeting') || 'Next greeting'" @click="nextGreeting" :disabled="greetingIndex >= totalGreetings - 1">
            <span>&gt;</span>
          </button>
        </div>
      </div>

      <div v-else-if="messages.length === 0" class="empty-state">
        <el-empty :description="t('chat.noMessages')" />
      </div>

      <div v-else class="messages-list">
        <div v-if="chatStore.loadingOlder" class="loading-older">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>{{ t('chat.loadingOlder') }}</span>
        </div>
        <div v-else-if="!chatStore.hasMoreMessages && messages.length > 0" class="no-more-messages">
          <span>{{ t('chat.noMoreMessages') }}</span>
        </div>

        <!-- Top spacer for virtual scroll -->
        <div :style="{ height: topSpacerHeight + 'px' }" aria-hidden="true" />

        <template v-for="(message, vIdx) in visibleMessages" :key="message.id">
          <DateDivider
            v-if="shouldShowDateDivider(visibleRange.start + vIdx)"
            :label="getDateLabel(message.createdAt)"
          />
          <div
            v-observe-height
            :data-message-id="String(message.id)"
            class="message-wrapper"
          >
            <MessageBubble
              :message="message"
              :character-avatar="getMessageCharacterAvatar(message)"
              :character-name="getMessageCharacterName(message)"
              :user-avatar="userStore.user?.avatar"
              :user-name="userStore.user?.name"
              :editing="editingMessageId === message.id"
              :voice-config="characterVoiceConfig"
              :branch-info="chatStore.getBranchInfo(Number(message.id))"
              @delete="handleDeleteMessage"
              @edit="handleEditMessage"
              @regenerate="handleRegenerateMessage"
              @save-edit="handleSaveEdit"
              @cancel-edit="handleCancelEdit"
              @rollback="handleRollback"
              @switch-branch="handleSwitchBranch"
              @reply="chatStore.setReplyTo($event)"
              @toggle-pin="handleTogglePin($event)"
            />
          </div>
        </template>

        <!-- Bottom spacer for virtual scroll -->
        <div :style="{ height: bottomSpacerHeight + 'px' }" aria-hidden="true" />

        <!-- Streaming message -->
        <div v-if="isStreaming" class="message-bubble message-assistant streaming">
          <div class="streaming-header" v-if="chatStore.streamingCharacterName">
            <el-avatar :size="28" :src="streamingCharacterAvatar">
              {{ chatStore.streamingCharacterName?.[0]?.toUpperCase() || '?' }}
            </el-avatar>
            <span class="streaming-author">{{ chatStore.streamingCharacterName }}</span>
          </div>
          <div class="message-content">
            <MarkdownRenderer :content="streamingMessage" />
            <span class="typing-cursor">|</span>
          </div>
        </div>

        <!-- Typing indicator -->
        <div v-else-if="sending && !isStreaming" class="typing-indicator" aria-live="assertive">
          <span class="typing-text">{{ t('chat.typing', { name: typingCharacterName }) }}</span>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
      </template>

      <div ref="messagesEnd"></div>

      <ScrollToBottom
        :visible="showScrollButton"
        @click="scrollToBottom(true)"
      />
    </div>

    <div class="chat-input-container">
      <!-- Remote user typing indicator -->
      <div v-if="remoteTypingNames.length > 0" class="remote-typing-indicator">
        <span class="remote-typing-dots"><span></span><span></span><span></span></span>
        <span class="remote-typing-text">{{ remoteTypingNames.join(', ') }} {{ remoteTypingNames.length === 1 ? 'is' : 'are' }} typing...</span>
      </div>
      <MessageInput
        :disabled="!currentChat"
        :sending="sending"
        :is-streaming="isStreaming"
        @send="handleSendMessage"
        @stop-generation="chatStore.abortGeneration()"
      />
    </div>

    <!-- Manage Characters Dialog (Group Chat) -->
    <el-dialog
      v-model="showManageDialog"
      :title="t('groupChat.manageCharacters')"
      width="480px"
      append-to-body
    >
      <div class="manage-characters-list">
        <div v-for="char in chatStore.chatCharacters" :key="char.id" class="manage-character-item">
          <el-avatar :size="36" :src="char.avatar">{{ char.name?.[0]?.toUpperCase() || '?' }}</el-avatar>
          <span class="manage-character-name">{{ char.name }}</span>
          <el-button
            v-if="chatStore.chatCharacters.length > 1"
            size="small"
            type="danger"
            text
            @click="handleRemoveCharacter(char.id)"
          >{{ t('groupChat.removeCharacter') }}</el-button>
        </div>
      </div>
      <div class="manage-add-section">
        <el-button size="small" @click="showAddCharacterDialog = true">{{ t('groupChat.addCharacter') }}</el-button>
      </div>
    </el-dialog>

    <!-- Add Character Dialog -->
    <el-dialog
      v-model="showAddCharacterDialog"
      :title="t('groupChat.addCharacter')"
      width="480px"
      append-to-body
    >
      <div class="add-character-search">
        <el-input v-model="addCharacterSearch" :placeholder="t('chat.searchCharacters')" clearable />
      </div>
      <div class="add-character-list">
        <div
          v-for="char in availableCharactersFiltered"
          :key="char.id"
          class="manage-character-item clickable"
          @click="handleAddCharacter(char.id)"
        >
          <el-avatar :size="36" :src="char.avatar">{{ char.name?.[0]?.toUpperCase() || '?' }}</el-avatar>
          <span class="manage-character-name">{{ char.name }}</span>
        </div>
        <div v-if="availableCharactersFiltered.length === 0" class="add-character-empty">
          {{ t('chat.noResults') || 'No characters found' }}
        </div>
      </div>
    </el-dialog>

    <!-- Growth Panel Dialog -->
    <el-dialog
      v-model="showGrowthPanel"
      :title="t('character.growth')"
      width="420px"
      append-to-body
      destroy-on-close
    >
      <GrowthPanel v-if="currentChat?.characterId" :character-id="currentChat.characterId" />
    </el-dialog>

    <!-- Intelligence Drawer -->
    <el-drawer
      v-model="showIntelligenceDrawer"
      :title="t('chat.intelligence')"
      direction="rtl"
      size="360px"
      :append-to-body="false"
      :modal="false"
      class="intelligence-drawer"
    >
      <el-tabs v-model="activeIntelligenceTab">
        <el-tab-pane :label="t('chat.emotion')" name="emotion">
          <EmotionIndicator />
        </el-tab-pane>
        <el-tab-pane :label="t('chat.memory')" name="memory">
          <MemoryPanel v-if="currentChat?.characterId" :character-id="currentChat.characterId" :chat-id="currentChat.id" />
        </el-tab-pane>
        <el-tab-pane :label="t('chat.debug')" name="debug">
          <IntelligenceDebugPanel :chat-id="currentChat?.id" :character-id="currentChat?.characterId" />
        </el-tab-pane>
      </el-tabs>
    </el-drawer>
    <!-- Pinned Messages Drawer -->
    <el-drawer v-model="showPinnedDrawer" :title="t('chat.pinnedMessages')" size="360px">
      <div v-if="chatStore.pinnedMessages.length === 0" class="empty-pinned">
        {{ t('chat.noPinnedMessages') }}
      </div>
      <div v-else class="pinned-list">
        <div v-for="msg in chatStore.pinnedMessages" :key="msg.id" class="pinned-item">
          <div class="pinned-role">{{ msg.role }}</div>
          <div class="pinned-content">{{ msg.content?.substring(0, 200) }}</div>
        </div>
      </div>
    </el-drawer>
    <!-- Snapshot Dialog -->
    <el-dialog v-model="showSnapshotDialog" :title="t('share.createSnapshot')" width="450px">
      <el-form label-position="top">
        <el-form-item :label="t('share.snapshotTitle')">
          <el-input v-model="snapshotTitle" :placeholder="t('share.snapshotTitle')" />
        </el-form-item>
        <el-form-item :label="t('share.snapshotExpiry')">
          <el-select v-model="snapshotExpiry" style="width: 100%">
            <el-option label="1 day" value="1d" />
            <el-option label="7 days" value="7d" />
            <el-option label="30 days" value="30d" />
            <el-option label="Never" value="never" />
          </el-select>
        </el-form-item>
      </el-form>
      <div v-if="snapshotLink" class="snapshot-result">
        <el-input :model-value="snapshotLink" readonly>
          <template #append>
            <el-button @click="copySnapshotLink">{{ t('share.copyLink') }}</el-button>
          </template>
        </el-input>
      </div>
      <template #footer>
        <el-button @click="showSnapshotDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creatingSnapshot" @click="createSnapshot" :disabled="!!snapshotLink">
          {{ t('share.createSnapshot') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox, ElMessage } from 'element-plus';
import { More, Loading, Search, Download } from '@element-plus/icons-vue';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';
import { useCharacterIntelligenceStore } from '@client/stores/characterIntelligence';
import { useDateTime } from '@client/composables';
import { chatApi } from '@client/services/chat.api';
import { exportApi } from '@client/services/export.api';
import { shareApi } from '@client/services/share.api';
import { characterApi } from '@client/services/character.api';
import { useTextToSpeech, type VoiceConfig } from '@client/composables/useTextToSpeech';
import MessageBubble from './MessageBubble.vue';
import MessageInput from './MessageInput.vue';
import ScrollToBottom from './ScrollToBottom.vue';
import DateDivider from './DateDivider.vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import ExpressionSprite from './ExpressionSprite.vue';
import EmotionIndicator from '@client/components/EmotionIndicator.vue';
import MemoryPanel from '@client/components/MemoryPanel.vue';
// Lazy-load heavy panels to break circular chunk deps and reduce initial chat bundle
const IntelligenceDebugPanel = defineAsyncComponent(() => import('@client/components/debug/IntelligenceDebugPanel.vue'));
const GrowthPanel = defineAsyncComponent(() => import('@client/components/character/GrowthPanel.vue'));
import { createLogger } from '@client/utils/logger';
import type { Chat, Message, MessageAttachment, Character } from '@client/types';

const logger = createLogger('ChatWindow');

interface Props {
  currentChat: Chat | null;
}

const props = defineProps<Props>();

const { t } = useI18n();
const chatStore = useChatStore();
const userStore = useUserStore();
const intelligenceStore = useCharacterIntelligenceStore();
const messagesContainer = ref<HTMLElement | null>(null);
const messagesEnd = ref<HTMLElement | null>(null);

const { formatRelativeTime } = useDateTime();
const showScrollButton = ref(false);
const editingMessageId = ref<string | null>(null);
const showSearch = ref(false);

// Group chat state
const isGroupChat = computed(() => chatStore.chatCharacters.length > 1);
const showManageDialog = ref(false);
const showAddCharacterDialog = ref(false);
const addCharacterSearch = ref('');
const availableCharacters = ref<Character[]>([]);
const showGrowthPanel = ref(false);
const showPinnedDrawer = ref(false);

// Build a lookup map for character info by ID
const characterMap = computed(() => {
  const map = new Map<string, Character>();
  for (const char of chatStore.chatCharacters) {
    map.set(char.id, char);
  }
  return map;
});

// Get character name for a message (group chat lookup or fallback to chat-level)
const getMessageCharacterName = (message: Message): string => {
  if (message.characterName) return message.characterName;
  if (message.characterId) {
    const char = characterMap.value.get(message.characterId);
    if (char) return char.name;
  }
  return props.currentChat?.characterName || '';
};

// Get character avatar for a message (group chat lookup or fallback to chat-level)
const getMessageCharacterAvatar = (message: Message): string | undefined => {
  if (message.characterId) {
    const char = characterMap.value.get(message.characterId);
    if (char) return char.avatar;
  }
  return props.currentChat?.characterAvatar;
};

// Streaming character avatar lookup
const streamingCharacterAvatar = computed(() => {
  if (chatStore.streamingCharacterId) {
    const char = characterMap.value.get(chatStore.streamingCharacterId);
    if (char) return char.avatar;
  }
  return props.currentChat?.characterAvatar;
});

// Typing indicator character name
const typingCharacterName = computed(() => {
  return chatStore.streamingCharacterName || props.currentChat?.characterName || '';
});

// Remote user typing indicator names
const remoteTypingNames = computed(() => {
  return Array.from(chatStore.typingUsers.values()).map(u => u.userName);
});

// Voice config from character's cardData extensions
const characterVoiceConfig = computed((): VoiceConfig | undefined => {
  const char = chatStore.currentCharacter;
  if (!char?.cardData?.extensions?.voice) return undefined;
  return char.cardData.extensions.voice as VoiceConfig;
});

// Expression sprites from character's cardData
const characterExpressions = computed(() => {
  const cardData = chatStore.currentCharacter?.cardData;
  // Check extensions.expressions first
  if (cardData?.extensions?.expressions) {
    return cardData.extensions.expressions as Record<string, string>;
  }
  // Fall back to V3 assets
  if (cardData?.assets && Array.isArray(cardData.assets)) {
    const expressionAssets = (cardData.assets as Array<{ type: string; uri: string; name: string }>)
      .filter((a) => a.type === 'expression');
    if (expressionAssets.length > 0) {
      const map: Record<string, string> = {};
      for (const asset of expressionAssets) {
        map[asset.name] = asset.uri;
      }
      return map;
    }
  }
  return null;
});

// Available characters for add dialog (exclude already in chat)
const availableCharactersFiltered = computed(() => {
  const existingIds = new Set(chatStore.chatCharacters.map(c => c.id));
  let chars = availableCharacters.value.filter(c => !existingIds.has(c.id));
  if (addCharacterSearch.value) {
    const q = addCharacterSearch.value.toLowerCase();
    chars = chars.filter(c => c.name.toLowerCase().includes(q));
  }
  return chars;
});

// Load available characters when add dialog opens
watch(showAddCharacterDialog, async (open) => {
  if (open && availableCharacters.value.length === 0) {
    try {
      const res = await characterApi.getCharacters({ limit: 50 });
      availableCharacters.value = res.characters;
    } catch {
      availableCharacters.value = [];
    }
  }
});

const handleAddCharacter = async (characterId: string) => {
  if (!props.currentChat) return;
  try {
    await chatApi.addChatCharacter(props.currentChat.id, characterId);
    // Refresh chat characters
    const characters = await chatApi.getChatCharacters(props.currentChat.id);
    if (Array.isArray(characters)) {
      chatStore.chatCharacters = characters.map(c => ({
        id: c.id,
        name: c.name,
        avatar: c.avatarUrl,
        cardData: c.cardData as Character['cardData'],
        isPublic: false,
        createdAt: '',
      }));
    }
    showAddCharacterDialog.value = false;
  } catch (error) {
    logger.error('Failed to add character', error);
  }
};

const handleRemoveCharacter = async (characterId: string) => {
  if (!props.currentChat) return;
  try {
    await chatApi.removeChatCharacter(props.currentChat.id, characterId);
    chatStore.chatCharacters = chatStore.chatCharacters.filter(c => c.id !== characterId);
  } catch (error) {
    logger.error('Failed to remove character', error);
  }
};

const handleTogglePin = (payload: { messageId: string; isPinned: boolean }) => {
  if (!props.currentChat) return;
  chatStore.togglePin(props.currentChat.id, payload.messageId, payload.isPinned);
};

let scrollRafId: number | null = null;

const handleScroll = () => {
  if (!messagesContainer.value) return;

  if (scrollRafId !== null) {
    cancelAnimationFrame(scrollRafId);
  }

  scrollRafId = requestAnimationFrame(() => {
    if (!messagesContainer.value) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;

    currentScrollTop.value = scrollTop;

    // Show scroll-to-bottom button
    showScrollButton.value = scrollHeight - scrollTop - clientHeight > 200;

    // Load older messages when near top
    if (scrollTop < 100 && chatStore.hasMoreMessages && !chatStore.loadingOlder) {
      loadOlderMessages();
    }

    scrollRafId = null;
  });
};

const loadOlderMessages = async () => {
  if (!messagesContainer.value) return;

  const previousMessageCount = messages.value.length;

  await chatStore.fetchOlderMessages();
  await nextTick();

  // Preserve scroll position: offset by estimated height of newly prepended messages
  const newMessageCount = messages.value.length - previousMessageCount;
  if (newMessageCount > 0 && messagesContainer.value) {
    let addedHeight = 0;
    for (let i = 0; i < newMessageCount; i++) {
      addedHeight += getMsgHeight(messages.value[i].id);
    }
    messagesContainer.value.scrollTop = addedHeight;
    currentScrollTop.value = addedHeight;
  }
};

// Intelligence drawer state
const showIntelligenceDrawer = ref(false);
const activeIntelligenceTab = ref('emotion');

// Emotion emoji mapping
const EMOTION_EMOJI: Record<string, string> = {
  excited: '🤩', happy: '😊', loving: '🥰', calm: '😌',
  curious: '🤔', surprised: '😮', confused: '😕', bored: '😐',
  sad: '😢', fearful: '😨', angry: '😠', disgusted: '🤢', neutral: '😶',
};

const emotionEmoji = computed(() => EMOTION_EMOJI[intelligenceStore.emotionLabel] ?? '😶');

const messages = computed(() => chatStore.messages);
const loading = computed(() => chatStore.loading);
const sending = computed(() => chatStore.sending);
const isStreaming = computed(() => chatStore.isStreaming);
const streamingMessage = computed(() => chatStore.streamingMessage);

// ---------------------------------------------------------------------------
// Virtual scroll state
// ---------------------------------------------------------------------------
const ESTIMATED_HEIGHT = 100; // px per message (default estimate)
const BUFFER_COUNT = 5; // extra messages above/below viewport
const messageHeightsMap = new Map<string, number>(); // non-reactive for perf
const heightsVersion = ref(0); // bump to trigger recomputation
const currentScrollTop = ref(0);

let messageObserver: ResizeObserver | null = null;

// Custom directive: observe each message wrapper's height via ResizeObserver
const vObserveHeight = {
  mounted(el: HTMLElement) {
    messageObserver?.observe(el);
  },
  beforeUnmount(el: HTMLElement) {
    messageObserver?.unobserve(el);
  },
};

const getMsgHeight = (id: string | number): number => {
  return messageHeightsMap.get(String(id)) || ESTIMATED_HEIGHT;
};

const totalEstimatedHeight = computed(() => {
  heightsVersion.value; // reactive dependency
  let height = 0;
  for (const msg of messages.value) {
    height += getMsgHeight(msg.id);
  }
  return height;
});

const visibleRange = computed(() => {
  heightsVersion.value; // reactive dependency
  if (!messagesContainer.value || messages.value.length === 0) {
    return { start: 0, end: messages.value.length };
  }

  const containerHeight = messagesContainer.value.clientHeight;
  const scrollTop = currentScrollTop.value;
  const msgs = messages.value;

  // Find first visible message
  let accHeight = 0;
  let start = 0;
  for (let i = 0; i < msgs.length; i++) {
    const h = getMsgHeight(msgs[i].id);
    if (accHeight + h >= scrollTop) {
      start = Math.max(0, i - BUFFER_COUNT);
      break;
    }
    accHeight += h;
    // If we reach the end without finding, show last messages
    if (i === msgs.length - 1) {
      start = Math.max(0, msgs.length - BUFFER_COUNT);
    }
  }

  // Find last visible message
  let end = start;
  let visibleHeight = 0;
  for (let i = start; i < msgs.length; i++) {
    const h = getMsgHeight(msgs[i].id);
    visibleHeight += h;
    end = i + 1;
    if (visibleHeight > containerHeight + BUFFER_COUNT * ESTIMATED_HEIGHT * 2) break;
  }

  return { start, end: Math.min(end + BUFFER_COUNT, msgs.length) };
});

const visibleMessages = computed(() => {
  const { start, end } = visibleRange.value;
  return messages.value.slice(start, end);
});

const topSpacerHeight = computed(() => {
  heightsVersion.value; // reactive dependency
  const { start } = visibleRange.value;
  let height = 0;
  for (let i = 0; i < start; i++) {
    height += getMsgHeight(messages.value[i].id);
  }
  return height;
});

const bottomSpacerHeight = computed(() => {
  heightsVersion.value; // reactive dependency
  const { end } = visibleRange.value;
  let height = 0;
  for (let i = end; i < messages.value.length; i++) {
    height += getMsgHeight(messages.value[i].id);
  }
  return height;
});

// Greeting swipe state
const greetingIndex = ref(0);

const allGreetings = computed<string[]>(() => {
  const character = chatStore.currentCharacter;
  if (!character) return [];
  const cardData = character.cardData || {};
  const greetings: string[] = [];
  if (cardData.first_mes) {
    greetings.push(cardData.first_mes);
  }
  if (cardData.alternate_greetings && Array.isArray(cardData.alternate_greetings)) {
    greetings.push(...cardData.alternate_greetings);
  }
  return greetings;
});

const totalGreetings = computed(() => allGreetings.value.length);

const hasAlternateGreetings = computed(() => totalGreetings.value > 1);

const currentGreeting = computed(() => {
  if (allGreetings.value.length === 0) return '';
  const idx = Math.min(greetingIndex.value, allGreetings.value.length - 1);
  return allGreetings.value[idx] || '';
});

const prevGreeting = () => {
  if (greetingIndex.value > 0) {
    greetingIndex.value--;
  }
};

const nextGreeting = () => {
  if (greetingIndex.value < totalGreetings.value - 1) {
    greetingIndex.value++;
  }
};

const getDateLabel = (dateStr: string): string => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return t('time.today');
  if (date.toDateString() === yesterday.toDateString()) return t('time.yesterday');
  return date.toLocaleDateString();
};

const shouldShowDateDivider = (index: number): boolean => {
  if (index === 0) return true;
  const current = new Date(messages.value[index].createdAt);
  const previous = new Date(messages.value[index - 1].createdAt);
  return current.toDateString() !== previous.toDateString();
};

const scrollToBottom = (smooth = true) => {
  // Ensure the last messages are in the visible range before scrolling
  currentScrollTop.value = totalEstimatedHeight.value;

  nextTick(() => {
    if (messagesContainer.value) {
      const container = messagesContainer.value;
      if (smooth) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        container.scrollTop = container.scrollHeight;
      }
      currentScrollTop.value = container.scrollTop;
    }
  });
};

const handleSendMessage = async (content: string, attachments?: MessageAttachment[]) => {
  try {
    // Persist the selected greeting as the first assistant message before sending
    if (messages.value.length === 0 && currentGreeting.value) {
      await persistGreeting();
    }
    await chatStore.sendMessage(content, attachments);
    scrollToBottom();
  } catch (error: unknown) {
    logger.error('Failed to send message', error);
  }
};

async function persistGreeting() {
  if (messages.value.length > 0) return;
  if (!currentGreeting.value) return;
  const chatId = chatStore.currentChatId;
  if (!chatId) return;
  await chatStore.addGreetingMessage(chatId, currentGreeting.value);
}

const handleMenuCommand = async (command: string) => {
  if (!props.currentChat) return;
  if (command === 'search') {
    showSearch.value = !showSearch.value;
    if (!showSearch.value) {
      chatStore.clearSearch();
    }
  } else if (command === 'export-json') {
    await handleExport('json');
  } else if (command === 'export-md') {
    await handleExport('markdown');
  } else if (command === 'export-txt') {
    await handleExport('txt');
  } else if (command === 'rename') {
    try {
      const { value } = await ElMessageBox.prompt(t('chat.renamePrompt'), t('chat.renameTitle'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        inputValue: props.currentChat.title || props.currentChat.characterName,
      });
      if (value?.trim()) {
        await chatStore.renameChat(props.currentChat.id, value.trim());
      }
    } catch { /* cancelled */ }
  } else if (command === 'delete') {
    try {
      await ElMessageBox.confirm(t('chat.deleteConfirm'), t('chat.deleteTitle'), {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      });
      await chatStore.deleteChat(props.currentChat.id);
    } catch { /* cancelled */ }
  }
};

const handleExport = async (format: 'json' | 'markdown' | 'txt') => {
  if (!props.currentChat) return;
  try {
    const blob = await chatApi.exportChat(props.currentChat.id, format);
    const ext = format === 'markdown' ? 'md' : format;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${props.currentChat.id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    ElMessage.error(t('chat.exportFailed'));
  }
};

const exportChatDirect = async (format: 'json' | 'txt') => {
  if (!props.currentChat?.id) return;
  try {
    const blob = format === 'json'
      ? await exportApi.exportChatJson(props.currentChat.id)
      : await exportApi.exportChatTxt(props.currentChat.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.currentChat.title || 'chat'}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    ElMessage.error(t('chat.exportFailed'));
  }
};

// Snapshot state
const showSnapshotDialog = ref(false);
const snapshotTitle = ref('');
const snapshotExpiry = ref('7d');
const snapshotLink = ref('');
const creatingSnapshot = ref(false);

const handleExportDropdown = async (command: string) => {
  if (command === 'snapshot') {
    snapshotTitle.value = '';
    snapshotExpiry.value = '7d';
    snapshotLink.value = '';
    showSnapshotDialog.value = true;
  } else {
    await exportChatDirect(command as 'json' | 'txt');
  }
};

const createSnapshot = async () => {
  if (!props.currentChat) return;
  creatingSnapshot.value = true;
  try {
    const expiresAt = snapshotExpiry.value !== 'never'
      ? new Date(Date.now() + { '1d': 86400000, '7d': 604800000, '30d': 2592000000 }[snapshotExpiry.value]!).toISOString()
      : undefined;
    const res = await shareApi.createSnapshot(props.currentChat.id, {
      title: snapshotTitle.value || undefined,
      expiresAt,
    });
    snapshotLink.value = `${window.location.origin}/share/snapshot/${res.shareToken}`;
    ElMessage.success(t('share.snapshotCreated'));
  } catch {
    ElMessage.error('Failed to create snapshot');
  } finally {
    creatingSnapshot.value = false;
  }
};

const copySnapshotLink = async () => {
  try {
    await navigator.clipboard.writeText(snapshotLink.value);
    ElMessage.success(t('share.linkCopied'));
  } catch {
    ElMessage.error('Failed to copy');
  }
};

let searchTimer: ReturnType<typeof setTimeout>;
const handleSearchInput = (value: string) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    chatStore.searchMessages(value);
  }, 300);
};

const handleRollback = async (messageId: string) => {
  try {
    await ElMessageBox.confirm(
      t('chat.rollbackConfirm'),
      t('common.confirm'),
      { type: 'warning' }
    );
    const count = await chatStore.rollbackToMessage(messageId);
    ElMessage.success(t('chat.rollbackSuccess', { count }));
  } catch {
    // User cancelled or error
  }
};

const handleDeleteMessage = async (messageId: string) => {
  try {
    await ElMessageBox.confirm(
      t('chat.deleteMessageConfirm'),
      t('chat.deleteMessage'),
      {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );
    await chatStore.deleteMessage(messageId);
  } catch { /* cancelled */ }
};

// Edit message handlers
const handleEditMessage = (messageId: string) => {
  editingMessageId.value = messageId;
};

const handleSaveEdit = async (messageId: string, content: string) => {
  try {
    await chatStore.editMessage(messageId, content);
    editingMessageId.value = null;
  } catch (error: unknown) {
    logger.error('Failed to edit message', error);
  }
};

const handleCancelEdit = () => {
  editingMessageId.value = null;
};

const handleRegenerateMessage = async (messageId: string) => {
  try {
    await chatStore.regenerateMessage(messageId);
    scrollToBottom();
  } catch (error: unknown) {
    logger.error('Failed to regenerate message', error);
  }
};

const handleSwitchBranch = async (messageId: number, direction: 'prev' | 'next') => {
  try {
    await chatStore.switchBranch(messageId, direction);
  } catch (error: unknown) {
    logger.error('Failed to switch branch', error);
  }
};

const openIntelligenceTab = (tab: string) => {
  activeIntelligenceTab.value = tab;
  showIntelligenceDrawer.value = true;
  intelligenceStore.resetDebugEventCount();
};

function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return `${tokens}`;
}

const handleModelChange = async (model: string) => {
  try {
    await chatStore.switchModel(model);
  } catch (error: unknown) {
    logger.error('Failed to switch model', error);
  }
};

// Watch for chat changes to fetch intelligence data
watch(() => props.currentChat, async (newChat, oldChat) => {
  // Reset greeting index when switching chats
  greetingIndex.value = 0;

  if (newChat && newChat.characterId) {
    // Fetch memories and emotion for the new chat session
    try {
      await intelligenceStore.fetchMemories(newChat.characterId, newChat.id);
      await intelligenceStore.fetchEmotion(newChat.characterId, newChat.id);
    } catch (error) {
      logger.error('Failed to fetch intelligence data', error);
    }
  }
  // Fetch pinned messages for the new chat
  if (newChat) {
    chatStore.fetchPinnedMessages(newChat.id);
  }
  // Scroll to bottom when chat changes
  scrollToBottom(false);
}, { immediate: true });

// Watch for new messages and scroll to bottom + pre-fetch branches
watch(messages, (newMessages) => {
  scrollToBottom();
  // Pre-fetch branch info for messages that have parentMessageId (potential siblings)
  if (newMessages.length > 0) {
    for (const msg of newMessages) {
      if (msg.parentMessageId != null) {
        const msgId = Number(msg.id);
        if (!chatStore.getBranchInfo(msgId)) {
          chatStore.fetchBranches(msgId);
        }
      }
    }
  }
}, { deep: true });

// Watch for streaming updates
watch(streamingMessage, () => {
  scrollToBottom();
});

// Pull-to-refresh state
const pullRefreshState = ref<'idle' | 'pulling' | 'ready' | 'refreshing'>('idle');
const pullDistance = ref(0);
const PULL_THRESHOLD = 60;
let touchStartY = 0;
let touchStartScrollTop = 0;

const pullRefreshText = computed(() => {
  switch (pullRefreshState.value) {
    case 'pulling': return t('common.loading');
    case 'ready': return t('common.refresh');
    case 'refreshing': return t('common.loading');
    default: return '';
  }
});

const handleTouchStart = (e: TouchEvent) => {
  if (!messagesContainer.value) return;
  touchStartY = e.touches[0].clientY;
  touchStartScrollTop = messagesContainer.value.scrollTop;
};

const handleTouchMove = (e: TouchEvent) => {
  if (!messagesContainer.value) return;
  if (pullRefreshState.value === 'refreshing') return;

  const touchY = e.touches[0].clientY;
  const diff = touchY - touchStartY;

  // Only activate pull-to-refresh when scrolled to top
  if (touchStartScrollTop <= 0 && diff > 0) {
    // Apply resistance factor for natural feel
    const distance = Math.min(diff * 0.4, 120);
    pullDistance.value = distance;

    if (distance >= PULL_THRESHOLD) {
      pullRefreshState.value = 'ready';
    } else if (distance > 0) {
      pullRefreshState.value = 'pulling';
    }
  }
};

const handleTouchEnd = async () => {
  if (pullRefreshState.value === 'refreshing') return;

  if (pullRefreshState.value === 'ready') {
    pullRefreshState.value = 'refreshing';
    pullDistance.value = PULL_THRESHOLD;

    try {
      // Load older messages
      if (props.currentChat) {
        await chatStore.fetchOlderMessages();
        logger.info('Pull-to-refresh: loaded messages');
      }
    } catch (error: unknown) {
      logger.error('Pull-to-refresh failed', error);
    } finally {
      pullRefreshState.value = 'idle';
      pullDistance.value = 0;
    }
  } else {
    pullRefreshState.value = 'idle';
    pullDistance.value = 0;
  }
};

// Auto-scroll on mount + set up ResizeObserver for virtual scroll
onMounted(() => {
  messageObserver = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      const msgId = el.dataset.messageId;
      if (msgId) {
        const newHeight = entry.contentRect.height;
        if (messageHeightsMap.get(msgId) !== newHeight) {
          messageHeightsMap.set(msgId, newHeight);
          changed = true;
        }
      }
    }
    if (changed) {
      heightsVersion.value++;
    }
  });

  scrollToBottom(false);
  chatStore.fetchModels();
});

// Handle scroll on window resize
const handleResize = () => {
  scrollToBottom(false);
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  messageObserver?.disconnect();
  messageObserver = null;
  if (scrollRafId !== null) {
    cancelAnimationFrame(scrollRafId);
  }
});
</script>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--surface-card);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-default);
  background-color: var(--surface-card);
  flex-shrink: 0;
}

.chat-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-details {
  display: flex;
  flex-direction: column;
}

.chat-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.chat-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
}

.chat-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px;
  border-bottom: 1px solid var(--chat-divider);
}

.search-count {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  position: relative;
  will-change: transform;
}

.loading-container {
  padding: 24px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.greeting-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 0 16px;
}

.greeting-container .message-bubble {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  max-width: 80%;
  animation: fadeIn 0.3s ease-in;
}

.greeting-container .message-assistant {
  align-self: flex-start;
}

.greeting-container .message-content {
  padding: 12px 16px;
  border-radius: 12px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  background-color: var(--bg-surface);
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}

.greeting-container .markdown-content {
  line-height: 1.6;
}

.greeting-container .markdown-content :deep(p) {
  margin: 0 0 8px 0;
}

.greeting-container .markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.greeting-swipe {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.swipe-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-primary);
  transition: background-color 0.2s, border-color 0.2s;
}

.swipe-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--border-default);
}

.swipe-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.swipe-indicator {
  font-size: 12px;
  color: var(--text-secondary);
}

.messages-list {
  display: flex;
  flex-direction: column;
}

.message-wrapper {
  contain: content;
}

.streaming {
  animation: pulse 1.5s ease-in-out infinite;
}

.streaming .message-content {
  position: relative;
}

.typing-cursor {
  display: inline-block;
  margin-left: 2px;
  animation: blink 1s step-end infinite;
  font-weight: bold;
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background-color: var(--bg-surface);
  border-radius: 12px;
  width: fit-content;
  margin-bottom: 16px;
}

.typing-text {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-right: 8px;
}

.typing-dot {
  width: 8px;
  height: 8px;
  background-color: var(--text-secondary);
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.7;
  }
  30% {
    transform: translateY(-10px);
    opacity: 1;
  }
}

.chat-input-container {
  flex-shrink: 0;
}

.remote-typing-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}

.remote-typing-dots {
  display: flex;
  gap: 3px;
}

.remote-typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-text-color-placeholder, #a8abb2);
  animation: remote-typing-bounce 1.4s infinite ease-in-out;
}

.remote-typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.remote-typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes remote-typing-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* Scrollbar styling */
.chat-messages::-webkit-scrollbar {
  width: 8px;
}

.chat-messages::-webkit-scrollbar-track {
  background: var(--border-subtle);
}

.chat-messages::-webkit-scrollbar-thumb {
  background: var(--surface-active);
  border-radius: 4px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

/* Pull-to-refresh styles */
.pull-refresh-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 0;
  overflow: visible;
  transition: opacity var(--duration-fast) var(--ease-out);
  pointer-events: none;
  flex-shrink: 0;
}

.pull-refresh-indicator.refreshing {
  transition: transform var(--duration-normal) var(--ease-out);
}

.pull-refresh-arrow {
  font-size: 18px;
  color: var(--text-secondary);
  transition: transform var(--duration-normal) var(--ease-out);
}

.pull-refresh-spinner {
  font-size: 18px;
  color: var(--accent-purple);
}

.pull-refresh-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.loading-older {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.no-more-messages {
  text-align: center;
  padding: 12px;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

/* Group chat header styles */
.stacked-avatars {
  display: flex;
  align-items: center;
  margin-right: 8px;
}

.stacked-avatar {
  border: 2px solid var(--surface-card);
  position: relative;
}

/* Streaming header for group chat */
.streaming-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.streaming-author {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
}

/* Manage characters dialog */
.manage-characters-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.manage-character-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 8px;
}

.manage-character-item.clickable {
  cursor: pointer;
}

.manage-character-item.clickable:hover {
  background: var(--surface-hover);
}

.manage-character-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.manage-add-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-default);
}

.add-character-search {
  margin-bottom: 12px;
}

.add-character-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.add-character-empty {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

@media (max-width: 768px) {
  .chat-header {
    padding: 8px 12px;
    gap: 8px;
  }
  .chat-header .chat-title {
    font-size: 14px;
  }
  .chat-actions {
    gap: 4px;
  }
  .chat-actions .el-select {
    width: 120px;
  }
  .chat-messages {
    padding: 12px;
  }
  .intelligence-drawer :deep(.el-drawer) {
    width: 100% !important;
  }
  .pull-refresh-indicator {
    font-size: 12px;
  }
}

.snapshot-result {
  margin-top: 16px;
}

.empty-pinned {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

.pinned-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pinned-item {
  padding: 12px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter, #fafafa);
  border: 1px solid var(--border-default);
}

.pinned-role {
  font-weight: 600;
  font-size: 12px;
  color: var(--el-color-primary, #409eff);
  margin-bottom: 4px;
  text-transform: capitalize;
}

.pinned-content {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
}
</style>
