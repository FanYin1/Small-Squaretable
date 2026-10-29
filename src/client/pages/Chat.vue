<template>
  <component :is="route.params.chatId ? ExplorationPlayLayout : ExplorationLayout" :reading="Boolean(route.params.chatId)" @new-chat="handleNewChat" @select-chat="handleSelectChat">
    <section v-if="recoveryPending && !creatingChat && !showPersonaSelector" class="creation-recovery" aria-live="polite" :aria-label="t('personas.recoveryTitle')">
      <strong>{{ t('personas.recoveryTitle') }}</strong>
      <p>{{ recoveryMessage }}</p>
      <div class="creation-recovery-actions">
        <button v-if="creationUncertain || createdChatId" type="button" data-testid="review-story-entry" :disabled="recoveryChecking" @click="showPersonaSelector = true">{{ t('exploration.reviewEntry') }}</button>
        <button v-if="recoveryPending.chatId && recoveryStatus !== 'deleted'" type="button" :disabled="recoveryChecking" @click="resumeRecoveredStory">{{ t('personas.openOriginalStory') }}</button>
        <button type="button" :disabled="recoveryChecking" @click="checkRecovery">{{ recoveryChecking ? t('common.loading') : t('personas.checkCreationResult') }}</button>
        <button v-if="recoveryStatus === 'deleted'" type="button" :disabled="recoveryChecking" @click="dismissDeletedRequest">{{ t('personas.closeCreationRequest') }}</button>
      </div>
    </section>
    <div v-if="initializing" class="chat-page-state" role="status">{{ t('common.loading') }}</div>
    <div v-else-if="selectionFailed" class="chat-page-state" role="alert">
      <p>{{ t('chat.selectError') }}</p>
      <button type="button" @click="restoreRouteChat">{{ t('common.retry') }}</button>
    </div>
    <StoryOpeningSelector v-else-if="showOpeningSelector" :profile="entryProfile" :selection="openingSelection"
      :loading="entryLoading" :error="openingError" @select="selectOpening" @next="continueFromOpening"
      @retry="reloadOpening" @cancel="cancelOpening" />
    <div v-else-if="(creatingChat || quickEntryPending) && !showPersonaSelector" class="chat-page-state" role="status">{{ t('exploration.starting') }}</div>
    <WelcomePage
      v-else-if="!currentChatId && !(showPersonaSelector && storyEntryMode)"
      v-loading="creatingChat"
      @select-character="handleSelectCharacter"
      @select-characters="handleSelectCharacters"
    />
    <ChatWindow
      v-else-if="currentChatId"
      :current-chat="currentChat"
    />
    <PersonaSelector
      :model-value="showPersonaSelector"
      :story-mode="storyEntryMode"
      :inline="storyEntryMode && !route.params.chatId"
      :busy="creatingChat"
      :blocked="creationUncertain"
      :navigation-only="!!createdChatId"
      :submission-error="personaSelectionError"
      @update:model-value="handlePersonaSelectorVisibility"
      @confirm="handlePersonaSelected"
    >
      <template #preview>
        <button v-if="entryProfile && !creatingChat && !creationUncertain && !createdChatId" type="button" class="entry-back" @click="backToOpenings">{{ t('storyEntry.back') }}</button>
        <StoryEntryPreview v-if="showPersonaSelector && storyEntryMode && pendingCharacterId" :key="pendingCharacterId" :character-id="pendingCharacterId" :entry-profile="entryProfile" :opening="openingSelection" />
      </template>
      <template #entry-context><StoryEntryContext v-if="showPersonaSelector && storyEntryMode" /></template>
    </PersonaSelector>
  </component>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';
import { useToast } from '@client/composables/useToast';
import { useStoryCreationRecovery } from '@client/composables/useStoryCreationRecovery';
import ExplorationLayout from '@client/components/layout/ExplorationLayout.vue';
import ExplorationPlayLayout from '@client/components/layout/ExplorationPlayLayout.vue';
import ChatWindow from '@client/components/chat/ChatWindow.vue';
import WelcomePage from '@client/components/chat/WelcomePage.vue';
import PersonaSelector from '@client/components/chat/PersonaSelector.vue';
import StoryEntryContext from '@client/components/chat/StoryEntryContext.vue';
import StoryEntryPreview from '@client/components/chat/StoryEntryPreview.vue';
import StoryOpeningSelector from '@client/components/chat/StoryOpeningSelector.vue';
import { characterApi } from '@client/services/character.api';
import { openingSelectionSchema, type OpeningSelection, type StoryEntryProfile } from '../../types/story-opening';
import { userPersonaApi } from '@client/services/user-persona.api';
import { ApiError } from '@client/services/api';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('Chat');
const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const userStore = useUserStore();
const creationOwner = computed(() => userStore.user?.id && userStore.user.tenantId
  ? JSON.stringify([userStore.user.tenantId, userStore.user.id]) : null);
const recovery = useStoryCreationRecovery(creationOwner);
const { pending: recoveryPending, status: recoveryStatus, checking: recoveryChecking, check: checkRecovery } = recovery;
const recoveryMessage = computed(() => t(`personas.${
  !recovery.storageAvailable.value ? 'storyRecoveryStorageFailed'
    : recoveryStatus.value === 'deleted' ? 'storyCreationDeleted'
      : recoveryPending.value?.chatId ? 'storyCreatedResume'
        : recoveryStatus.value === 'not_found' ? 'storyRecoveryNotFound'
          : recoveryStatus.value === 'unavailable' ? 'storyRecoveryUnavailable' : 'storyRecoveryPending'
}`));

const currentChat = computed(() => chatStore.currentChat ?? null);
const currentChatId = computed(() => chatStore.currentChatId);
const creatingChat = ref(false);
const showPersonaSelector = ref(false);
const pendingCharacterId = ref<string | null>(null);
const pendingCharacterIds = ref<string[] | null>(null);
const initializing = ref(true);
const selectionFailed = ref(false);
const personaSelectionError = ref('');
const creationUncertain = ref(false);
const createdChatId = ref<string | null>(null);
const entryProfile = ref<StoryEntryProfile | null>(null);
const openingSelection = ref<OpeningSelection | null>(null);
const showOpeningSelector = ref(false);
const entryLoading = ref(false);
const openingError = ref('');
let creationRequest: { id: string; characterId: string; characterIds?: string[]; personaId?: string; opening?: OpeningSelection } | null = null;
let entryVersion = 0;
const storyEntryMode = computed(() => ['1', 'quick'].includes(String(route.query.storyEntry)));
const quickEntryPending = computed(() => route.query.storyEntry === 'quick' && Boolean(pendingCharacterId.value));

const handleNewChat = async () => {
  if (recoveryPending.value && !creationRequest) return;
  if (creationUncertain.value || createdChatId.value) {
    showPersonaSelector.value = true;
    return;
  }
  clearPendingCharacterSelection();
  selectionFailed.value = false;
  await chatStore.setCurrentChat(null);
  localStorage.removeItem('lastChatId');
  await router.push({ name: 'Chat' });
};

const handleSelectChat = async (chatId: string) => {
  await router.push({ name: 'ChatSession', params: { chatId } });
};

const clearPendingCharacterSelection = (force = false) => {
  entryVersion += 1;
  showPersonaSelector.value = false;
  if (!force && (creationUncertain.value || createdChatId.value || recoveryPending.value)) return;
  showOpeningSelector.value = false;
  entryLoading.value = false;
  openingError.value = '';
  entryProfile.value = null;
  openingSelection.value = null;
  personaSelectionError.value = '';
  creationUncertain.value = false;
  createdChatId.value = null;
  creationRequest = null;
  pendingCharacterId.value = null;
  pendingCharacterIds.value = null;
};

const clearCharacterEntryQuery = async () => {
  if (!route.query.characterId && !route.query.storyEntry) return;
  const query = { ...route.query };
  delete query.characterId;
  delete query.storyEntry;
  await router.replace({ query });
};

function openingDraftKey(characterId: string) {
  return `squaretable:opening:${creationOwner.value}:${characterId}`;
}

function selectOpening(selection: OpeningSelection) {
  if (creatingChat.value || creationUncertain.value || createdChatId.value) return;
  openingSelection.value = selection;
  try { sessionStorage.setItem(openingDraftKey(selection.characterId), JSON.stringify(selection)); }
  catch { openingError.value = t('personas.storyRecoveryStorageFailed'); }
}

async function prepareOpening(characterId: string, allowQuick = true) {
  const requestVersion = entryVersion;
  showOpeningSelector.value = true;
  entryLoading.value = true;
  openingError.value = '';
  entryProfile.value = null;
  openingSelection.value = null;
  try {
    const profile = await characterApi.getStoryEntry(characterId);
    if (requestVersion !== entryVersion) return;
    entryProfile.value = profile;
    try {
      const raw = sessionStorage.getItem(openingDraftKey(characterId));
      const saved = raw ? openingSelectionSchema.safeParse(JSON.parse(raw)) : null;
      if (saved?.success && saved.data.characterId === characterId && saved.data.revision === profile.revision) openingSelection.value = saved.data;
    } catch { openingSelection.value = null; }
    if (allowQuick && profile.openings.length === 1 && profile.openings[0].kind === 'narrative'
      && profile.openings[0].record?.status !== 'conflict'
      && !profile.openings[0].adaptationReport?.findings.length
      && !profile.compatibilityIssues?.length
      && profile.identity.status !== 'invalid' && profile.rulesStatus !== 'invalid') {
      openingSelection.value = { characterId, revision: profile.revision, reference: profile.openings[0].reference, reviewed: false };
      await continueFromOpening(route.query.storyEntry === '1');
    }
  } catch {
    if (requestVersion === entryVersion) openingError.value = t('storyEntry.loadFailed');
  } finally {
    if (requestVersion === entryVersion) entryLoading.value = false;
  }
}

async function continueFromOpening(customize: boolean) {
  if (!openingSelection.value || creatingChat.value || creationUncertain.value || openingError.value) return;
  showOpeningSelector.value = false;
  const personaId = await resolvePersonaId(customize);
  if (personaId !== null) await startChat(personaId);
}

async function reloadOpening() {
  if (pendingCharacterId.value) await prepareOpening(pendingCharacterId.value, false);
}

function forgetOpeningDraft(characterId: string) {
  try { sessionStorage.removeItem(openingDraftKey(characterId)); }
  catch { logger.warn('Could not remove the opening draft'); }
}

async function cancelOpening() {
  if (pendingCharacterId.value) forgetOpeningDraft(pendingCharacterId.value);
  clearPendingCharacterSelection();
  await clearCharacterEntryQuery();
}

function backToOpenings() {
  if (creatingChat.value || creationUncertain.value || createdChatId.value) return;
  showPersonaSelector.value = false;
  showOpeningSelector.value = true;
}

const handlePersonaSelectorVisibility = async (visible: boolean) => {
  if (creatingChat.value) return;
  showPersonaSelector.value = visible;
  if (!visible && !creatingChat.value) {
    clearPendingCharacterSelection();
    await clearCharacterEntryQuery();
  }
};

const restoreRouteChat = async () => {
  const chatId = typeof route.params.chatId === 'string' ? route.params.chatId : null;
  selectionFailed.value = false;
  try {
    await chatStore.setCurrentChat(chatId);
    if (chatId && chatId === route.params.chatId && chatStore.currentChatId === chatId) {
      localStorage.setItem('lastChatId', chatId);
    }
  } catch (error) {
    if (chatId !== route.params.chatId) return;
    selectionFailed.value = true;
    logger.error('Failed to restore chat from route:', error);
  }
};

const resolvePersonaId = async (confirmIdentity = false): Promise<string | undefined | null> => {
  const requestVersion = entryVersion;
  personaSelectionError.value = '';
  if (confirmIdentity) {
    showPersonaSelector.value = true;
    return null;
  }

  try {
    const personas = await userPersonaApi.list();
    if (requestVersion !== entryVersion) return null;
    if (personas.length === 0) return undefined;
    const preferred = personas.find((p) => p.isDefault);
    if (preferred) return preferred.id;
    if (route.query.storyEntry === 'quick') return undefined;
    if (personas.length === 1) return personas[0].id;
    showPersonaSelector.value = true;
    return null;
  } catch (error) {
    if (requestVersion !== entryVersion) return null;
    logger.error('Failed to load personas:', error);
    if (storyEntryMode.value) {
      showPersonaSelector.value = true;
      personaSelectionError.value = t('exploration.identityLoadFailed');
      return null;
    }
    return undefined;
  }
};

const startChat = async (personaId?: string) => {
  if (creatingChat.value || creationUncertain.value || (!pendingCharacterId.value && !pendingCharacterIds.value)) return;
  const requestVersion = entryVersion;
  const requestOwner = creationOwner.value;
  let submission: ReturnType<typeof recovery.begin> = null;
  creatingChat.value = true;
  try {
    if (!createdChatId.value) {
      if (!creationRequest || creationRequest.personaId !== personaId || JSON.stringify(creationRequest.opening) !== JSON.stringify(openingSelection.value ?? undefined)) {
        creationRequest = {
          id: crypto.randomUUID(),
          characterId: pendingCharacterIds.value?.[0] ?? pendingCharacterId.value!,
          characterIds: pendingCharacterIds.value ? [...pendingCharacterIds.value] : undefined,
          personaId,
          ...(openingSelection.value ? { opening: openingSelection.value } : {}),
        };
      }
      const request = creationRequest;
      submission = recovery.begin(request.id);
      if (!submission) {
        personaSelectionError.value = t('personas.storyRecoveryStorageFailed');
        if (storyEntryMode.value) showPersonaSelector.value = true;
        if (!showPersonaSelector.value) toast.error(personaSelectionError.value);
        return;
      }
      const chat = await chatStore.createChat(request.characterId, undefined, request.characterIds, request.personaId, request.id, request.opening);
      submission.created(chat.id);
      if (requestVersion !== entryVersion) return;
      createdChatId.value = chat.id;
      forgetOpeningDraft(request.characterId);
    }
    const destinationId = createdChatId.value;
    await router.replace({ name: 'ChatSession', params: { chatId: destinationId } });
    if (requestOwner !== creationOwner.value) return;
    if (route.params.chatId !== destinationId) throw new Error('Story navigation did not complete');
    recovery.clear();
    try {
      localStorage.setItem('lastChatId', destinationId!);
    } catch (error) {
      logger.warn('Could not remember the story:', error);
    }
    showPersonaSelector.value = false;
    personaSelectionError.value = '';
    clearPendingCharacterSelection(true);
  } catch (error) {
    const uncertain = !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.status === 408 || error.code === 'IDEMPOTENCY_CONFLICT' || error.code === 'CREATED_CHAT_DELETED';
    if (!uncertain && !createdChatId.value) submission?.rejected();
    if (requestVersion !== entryVersion) return;
    logger.error('Failed to create chat:', error);
    creationUncertain.value = !createdChatId.value && uncertain;
    if (error instanceof ApiError && ['STORY_ENTRY_CHANGED', 'STORY_OPENING_INVALID', 'STORY_OPENING_REQUIRED'].includes(error.code ?? '') && pendingCharacterId.value) {
      creationRequest = null;
      showPersonaSelector.value = false;
      await prepareOpening(pendingCharacterId.value, false);
      openingError.value = error.message;
      return;
    }
    const message = createdChatId.value
      ? t('personas.storyNavigationFailed')
      : error instanceof ApiError && error.code === 'IDEMPOTENCY_CONFLICT'
        ? t('personas.storyCreationConflict')
        : error instanceof ApiError && error.code === 'CREATED_CHAT_DELETED'
          ? t('personas.storyCreationDeleted')
          : error instanceof ApiError && ['STORY_IDENTITY_CONFLICT', 'STORY_IDENTITY_INVALID'].includes(error.code ?? '')
            ? error.message
            : creationUncertain.value ? t('personas.storyCreationUncertain') : t('chat.createError');
    personaSelectionError.value = message;
    if (storyEntryMode.value) showPersonaSelector.value = true;
    if (!showPersonaSelector.value) {
      toast.error(message);
    }
  } finally {
    creatingChat.value = false;
  }
};

const resumeRecoveredStory = async () => {
  const request = recoveryPending.value;
  const owner = creationOwner.value;
  if (!request?.chatId || creatingChat.value || recoveryChecking.value) return;
  creatingChat.value = true;
  try {
    await router.replace({ name: 'ChatSession', params: { chatId: request.chatId } });
    if (owner !== creationOwner.value) return;
    if (route.params.chatId !== request.chatId) throw new Error('Story navigation did not complete');
    recovery.clear();
    clearPendingCharacterSelection(true);
  } catch (error) {
    if (owner === creationOwner.value) toast.error(t('personas.storyNavigationFailed'));
    logger.warn('Could not open recovered story:', error);
  } finally {
    creatingChat.value = false;
  }
};

const dismissDeletedRequest = async () => {
  if (recoveryStatus.value !== 'deleted' || !recovery.clear()) return;
  clearPendingCharacterSelection(true);
  await clearCharacterEntryQuery();
};

const handleSelectCharacter = async (characterId: string) => {
  if (creatingChat.value || !creationOwner.value || (recoveryPending.value && !creationRequest)) return;
  if (creationUncertain.value || createdChatId.value) {
    showPersonaSelector.value = true;
    return;
  }
  clearPendingCharacterSelection();
  pendingCharacterId.value = characterId;
  pendingCharacterIds.value = null;
  await prepareOpening(characterId);
};

const handleSelectCharacters = async (characterIds: string[]) => {
  if (creatingChat.value || !creationOwner.value || !characterIds.length || (recoveryPending.value && !creationRequest)) return;
  if (creationUncertain.value || createdChatId.value) {
    showPersonaSelector.value = true;
    return;
  }
  clearPendingCharacterSelection();
  pendingCharacterId.value = null;
  pendingCharacterIds.value = [...characterIds];
  const personaId = await resolvePersonaId(route.query.storyEntry === '1');
  if (personaId === null) return;
  await startChat(personaId);
};

const handlePersonaSelected = async (personaId?: string) => {
  if (creatingChat.value || creationUncertain.value) return;
  personaSelectionError.value = '';
  await startChat(personaId);
};

onMounted(async () => {
  // Initialize WebSocket
  const token = userStore.token;
  if (token) {
    logger.info('Initializing WebSocket');
    chatStore.initWebSocket(token);
  } else {
    logger.warn('No token available, WebSocket not initialized');
  }

  // Load chats
  try {
    await chatStore.fetchChats();

    await restoreRouteChat();
  } catch (error) {
    logger.error('Failed to initialize chat page:', error);
    toast.error(t('chat.loadError'));
    selectionFailed.value = Boolean(route.params.chatId);
  } finally {
    initializing.value = false;
  }

  // If URL has characterId query param, auto-create a chat
  const characterId = route.query.characterId as string;
  if (typeof characterId === 'string' && !route.params.chatId) {
    logger.info('Auto-creating chat for character from URL:', characterId);
    await handleSelectCharacter(characterId);
  }
});

// Watch for route query changes (e.g. navigating from marketplace)
watch(() => [route.query.characterId, route.query.storyEntry], async ([characterId]) => {
  clearPendingCharacterSelection();
  if (!initializing.value && characterId && typeof characterId === 'string' && !route.params.chatId) {
    logger.info('Character ID from URL:', characterId);
    await handleSelectCharacter(characterId);
  }
});

watch(() => route.params.chatId, async () => {
  clearPendingCharacterSelection();
  if (!initializing.value) await restoreRouteChat();
});

watch(creationOwner, async () => {
  clearPendingCharacterSelection(true);
  const characterId = route.query.characterId;
  if (!initializing.value && creationOwner.value && !recoveryPending.value && typeof characterId === 'string' && !route.params.chatId) {
    await handleSelectCharacter(characterId);
  }
}, { flush: 'sync' });

onUnmounted(() => {
  entryVersion += 1;
  chatStore.disconnectWebSocket();
});
</script>

<style scoped>
.entry-back { min-height: 44px; padding: 8px 16px; border: 1px solid var(--border-interactive); border-radius: 8px; background: var(--bg-surface); color: var(--accent-text); cursor: pointer; }
.creation-recovery {
  flex-shrink: 0;
  max-height: 35dvh;
  overflow: auto;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-primary);
}

.creation-recovery p {
  margin: 8px 0;
  color: var(--text-secondary);
  line-height: 1.6;
}

.creation-recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.creation-recovery button {
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid var(--border-interactive);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
}

.creation-recovery button:focus-visible {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
}

.creation-recovery button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.chat-page-state {
  margin: auto;
  padding: var(--spacing-lg);
  color: var(--text-secondary);
  text-align: center;
}

.chat-page-state button {
  min-height: 44px;
  padding: 8px 20px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-interactive);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
</style>
