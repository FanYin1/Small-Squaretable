<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChatDotRound, ArrowLeft, Edit, Share, FolderAdd, Warning } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@client/stores/user';
import { characterApi } from '@client/services/character.api';
import { creditsApi, type CreditBalance } from '@client/services/credits.api';
import { api } from '@client/services/api';
import { characterCollectionApi } from '@client/services/character-collection.api';
import ExplorationLayout from '@client/components/layout/ExplorationLayout.vue';
import StoryCompatibility from '@client/components/character/StoryCompatibility.vue';
import StoryAdapterPanel from '@client/components/character/StoryAdapterPanel.vue';
import PresentationSource from '@client/components/character/PresentationSource.vue';
import PresentationJobPanel from '@client/components/character/PresentationJobPanel.vue';
import RatingComponent from '@client/components/rating/RatingComponent.vue';
import FavoriteButton from '@client/components/social/FavoriteButton.vue';
import CommentSection from '@client/components/social/CommentSection.vue';
import ShareDialog from '@client/components/character/ShareDialog.vue';
import ReportDialog from '@client/components/moderation/ReportDialog.vue';
import type { RatingResponseDto } from '@/types/rating';
import type { Character, CharacterCollection } from '@client/types';
import { inspectOpening, openingContent, openingReferences, storyIntroduction } from '../../types/story-opening';
import { storyDisplayText } from '@client/utils/story-display';
import { useContinueStory } from '@client/composables/useContinueStory';

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const userStore = useUserStore();

const characterId = computed(() => route.params.id as string);
const character = ref<Character | null>(null);
const isAuthenticated = computed(() => userStore.isAuthenticated);
const isOwner = computed(() =>
  userStore.user && character.value?.creatorId && userStore.user.id === character.value.creatorId
);
const loading = ref(true);
const compatibilityVersion = ref(0);
const loadError = ref(false);

// Rating state
const ratings = ref<RatingResponseDto | null>(null);
const showShareDialog = ref(false);
const showReportDialog = ref(false);
const collections = ref<CharacterCollection[]>([]);
const addingToCollection = ref(false);

const coverFailed = ref(false);
const enteringStory = ref(false);
const balance = ref<CreditBalance | null>(null);
const balanceFailed = ref(false);
const balanceLoading = ref(false);
let detailVersion = 0;
let balanceVersion = 0;
let collectionVersion = 0;

function storyText(value: unknown, limit = 1600): string {
  return storyDisplayText(value, { characterName: character.value?.name, userName: t('chat.you'), limit, multiline: true });
}

const scenario = computed(() => storyText(character.value?.cardData?.scenario));
const introduction = computed(() => storyIntroduction(character.value?.description, character.value?.cardData ?? {}, character.value?.presentation));
const opening = computed(() => {
  const card = character.value?.cardData ?? {};
  const preview = openingReferences(card).map(reference => inspectOpening(card, reference)).find(item => item.kind === 'narrative');
  return storyText(preview ? openingContent(card, preview.reference) : '');
});
const personality = computed(() => storyText(character.value?.cardData?.personality, 600));
const author = computed(() => storyText(character.value?.cardData?.creator, 120));
const accountScope = computed(() => isAuthenticated.value
  ? `${userStore.user?.tenantId}:${userStore.user?.id}` : '');
const continueOwner = computed(() => accountScope.value || null);
const { story: recentStory } = useContinueStory(continueOwner);
const matchingStory = computed(() => recentStory.value?.characterId === characterId.value ? recentStory.value : null);

const overallRating = computed(() => {
  if (!ratings.value?.overall) return 0;
  return parseFloat(ratings.value.overall);
});

async function fetchCharacter() {
  const version = ++detailVersion;
  const requestedId = characterId.value;
  loading.value = true;
  loadError.value = false;
  character.value = null;
  ratings.value = null;
  coverFailed.value = false;
  showShareDialog.value = false;
  showReportDialog.value = false;
  try {
    const result = await characterApi.getCharacter(requestedId);
    if (version !== detailVersion) return;
    character.value = result;
    if (result.isPublic) void fetchRatings(requestedId, version);
  } catch {
    if (version !== detailVersion) return;
    loadError.value = true;
  } finally {
    if (version === detailVersion) loading.value = false;
  }
}

async function fetchRatings(requestedId: string, version: number) {
  try {
    const response = await api.get<RatingResponseDto>(`/characters/${requestedId}/ratings`);
    if (version === detailVersion) ratings.value = response;
  } catch { /* ratings are optional */ }
}

async function loadBalance() {
  const version = ++balanceVersion;
  balance.value = null;
  balanceFailed.value = false;
  balanceLoading.value = Boolean(accountScope.value);
  if (!accountScope.value) return;
  try {
    const result = await creditsApi.getBalance();
    if (version === balanceVersion) balance.value = result;
  } catch {
    if (version === balanceVersion) balanceFailed.value = true;
  } finally {
    if (version === balanceVersion) balanceLoading.value = false;
  }
}

async function loadCollections() {
  const version = ++collectionVersion;
  collections.value = [];
  if (!accountScope.value) return;
  try {
    const result = await characterCollectionApi.getCollections();
    if (version === collectionVersion) collections.value = result;
  } catch { if (version === collectionVersion) collections.value = []; }
}

async function enterStory(customize = false) {
  if (enteringStory.value || !character.value || loading.value || loadError.value) return;
  enteringStory.value = true;
  try {
    await router.push({ name: 'Chat', query: { characterId: character.value.id, storyEntry: customize ? '1' : 'quick' } });
  } catch {
    ElMessage.error(t('common.retry'));
  } finally {
    enteringStory.value = false;
  }
}

watch(characterId, fetchCharacter, { immediate: true });
watch(accountScope, () => { void loadBalance(); void loadCollections(); }, { immediate: true });
onBeforeUnmount(() => { detailVersion++; balanceVersion++; collectionVersion++; });

function openReportDialog() {
  if (!isAuthenticated.value) {
    ElMessage.warning(t('report.loginRequired'));
    return;
  }
  showReportDialog.value = true;
}

async function handleAddToCollection(collectionId: string) {
  addingToCollection.value = true;
  try {
    await characterCollectionApi.addCharacters(collectionId, [characterId.value]);
    ElMessage.success(t('collections.addSuccess'));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : t('common.retry');
    ElMessage.error(msg);
  } finally {
    addingToCollection.value = false;
  }
}
</script>

<template>
  <ExplorationLayout :navigation-section="isOwner && character && !character.isPublic ? 'MyCharacters' : undefined">
    <template #title>{{ t('characterDetail.storyTitle') }}</template>
    <template #actions>
      <button class="btn-back" @click="router.back()">
        <el-icon><ArrowLeft /></el-icon>
        {{ t('common.back') }}
      </button>
    </template>
    <div v-loading="loading" class="character-detail-page" :class="{ 'private-story-detail': character && !character.isPublic }">
      <!-- Error state -->
      <div v-if="!loading && loadError" class="error-state" role="alert">
        <p>{{ t('common.loadFailed', t('common.retry')) }}</p>
        <el-button type="primary" @click="fetchCharacter">{{ t('common.retry') }}</el-button>
      </div>
      <template v-else-if="character && !loading">
        <header class="story-hero">
          <div class="story-cover">
            <img v-if="character.avatar && !coverFailed" :src="character.avatar" :alt="character.name" @error="coverFailed = true" />
            <span v-else aria-hidden="true">{{ character.name.slice(0, 1) }}</span>
          </div>
          <div class="story-intro">
            <p class="story-eyebrow">{{ t(character.isPublic ? 'characterDetail.interactiveStory' : character.shareToken ? 'privateLibrary.sharedDetail' : 'privateLibrary.privateDetail') }} <span v-if="character.isNsfw"> · 18+</span></p>
            <h1>{{ character.name }}</h1>
            <p v-if="author" class="story-author">{{ t('characterDetail.byAuthor', { name: author }) }}</p>
            <p class="story-summary">{{ storyText(introduction.text, character.isPublic ? 500 : 180) || t('characterDetail.noDescription') }}</p>
            <details v-if="!character.isPublic && storyText(introduction.text, 6000).length > 180" class="introduction-details">
              <summary>{{ t('privateLibrary.readIntroduction') }}</summary>
              <p>{{ storyText(introduction.text, 6000) }}</p>
            </details>
            <PresentationSource v-if="character.presentation && introduction.source === 'opening'" :presentation="character.presentation" />
            <p v-else-if="introduction.source === 'opening'" class="story-author">{{ t('storyEntry.excerptSource') }}</p>
            <div v-if="character.isPublic" class="rating-section">
              <RatingComponent :model-value="overallRating" readonly show-score :show-count="true" :count="ratings?.count || 0" />
            </div>
            <RouterLink v-if="matchingStory" class="continue-story-link" :to="{ name: 'ChatSession', params: { chatId: matchingStory.id } }">{{ t('market.discovery.resume') }}</RouterLink>
            <el-button :type="matchingStory ? 'default' : 'primary'" :icon="ChatDotRound" :loading="enteringStory" data-testid="enter-story" @click="enterStory()">
              {{ t(matchingStory ? 'storyShell.startAnother' : 'characterDetail.enterStory') }}
            </el-button>
            <button type="button" class="customize-identity" :disabled="enteringStory" @click="enterStory(true)">{{ t('exploration.customizeIdentity') }} →</button>
            <p class="story-hint">{{ t('exploration.entryHint') }}</p>
            <div v-if="isOwner && !character.isPublic" class="private-detail-tools">
              <button type="button" @click="router.push({ name: 'CharacterEdit', params: { id: character.id } })">{{ t('privateLibrary.editStory') }}</button>
              <a href="#story-management">{{ t('privateLibrary.manageLink') }} ↓</a>
            </div>
          </div>
        </header>

        <div class="detail-body">
          <section class="detail-section story-opening" data-testid="story-opening">
            <h2>{{ t('characterDetail.opening') }}</h2>
            <p>{{ opening || t('characterDetail.noOpening') }}</p>
          </section>
          <section v-if="scenario" class="detail-section" data-testid="story-scenario">
            <h2>{{ t('characterDetail.scenario') }}</h2>
            <p>{{ scenario }}</p>
          </section>
          <section v-if="personality" class="detail-section">
            <h2>{{ t('characterDetail.personality') }}</h2>
            <p>{{ personality }}</p>
          </section>
          <section class="detail-section story-guidance">
            <h2>{{ t('characterDetail.howToPlay') }}</h2>
            <p>{{ t('characterDetail.playHint') }}</p>
            <div v-if="isAuthenticated" class="story-balance" aria-live="polite">
              <p v-if="balanceLoading">{{ t('common.loading') }}</p>
              <div v-else-if="balanceFailed">
                <p>{{ t('characterDetail.balanceUnavailable') }}</p>
                <el-button @click="loadBalance">{{ t('common.retry') }}</el-button>
              </div>
              <template v-else-if="balance?.billingMode === 'credits'">
                <p>{{ t('characterDetail.availablePoints', { points: balance.unlimited ? t('credits.unlimited') : balance.availablePoints.toLocaleString(locale, { maximumFractionDigits: 4 }) }) }}</p>
                <p>{{ t('characterDetail.costHint') }}</p>
                <el-button @click="router.push({ name: 'Subscription' })">{{ t('characterDetail.viewBalance') }}</el-button>
              </template>
            </div>
          </section>

          <details v-if="character?.cardData?.creator_notes" class="detail-section creator-notes">
            <summary>{{ t('characterDetail.creatorNotes') }}</summary>
            <p>{{ storyText(character.cardData.creator_notes, 6000) }}</p>
          </details>

          <div v-if="character.tags?.length" class="detail-section">
            <h3>{{ t('characterDetail.tags') }}</h3>
            <div class="tags">
              <el-tag v-for="tag in character.tags" :key="tag" type="info">{{ tag }}</el-tag>
            </div>
          </div>

          <div v-if="character.isPublic" class="detail-section">
            <h3>{{ t('characterDetail.statistics') }}</h3>
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-label">{{ t('characterDetail.downloads') }}</span>
                <span class="stat-value">{{ character.downloadCount || 0 }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">{{ t('characterDetail.views') }}</span>
                <span class="stat-value">{{ character.viewCount || 0 }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">{{ t('characterDetail.createdAt') }}</span>
                <span class="stat-value">{{ new Date(character.createdAt).toLocaleDateString(locale) }}</span>
              </div>
            </div>
          </div>

          <section id="story-management" class="story-management" :aria-label="t('privateLibrary.manageHeading')">
            <header v-if="isOwner" class="management-intro">
              <h2>{{ t('privateLibrary.manageHeading') }}</h2>
              <p>{{ t('privateLibrary.manageDescription') }}</p>
            </header>
            <StoryCompatibility :key="`${character.id}:${compatibilityVersion}`" :card-data="character.cardData" :character-id="character.id" />
            <StoryAdapterPanel v-if="isOwner" :character-id="character.id" @changed="compatibilityVersion++" />
            <PresentationJobPanel v-if="isOwner" :character-id="character.id" @adopted="fetchCharacter" />
          <div class="action-buttons">
            <FavoriteButton v-if="character.isPublic" :character-id="characterId" />
            <el-dropdown v-if="isAuthenticated && collections.length > 0" trigger="click" @command="handleAddToCollection">
              <el-button :icon="FolderAdd" :loading="addingToCollection">
                {{ t('collections.addToCollection') }}
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="col in collections" :key="col.id" :command="col.id">
                    {{ col.name }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button
              v-if="isOwner"
              :icon="Edit"
              @click="router.push({ name: 'CharacterEdit', params: { id: character.id } })"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-if="isOwner"
              :icon="Share"
              @click="showShareDialog = true"
            >
              {{ t('share.shareLink') }}
            </el-button>
            <el-button
              v-if="!isOwner"
              text
              class="btn-report"
              :icon="Warning"
              @click="openReportDialog"
            >
              {{ t('report.reportCharacter') }}
            </el-button>
          </div>
          </section>

          <CommentSection v-if="character.isPublic" :character-id="characterId" />
          <ShareDialog
            v-if="character"
            v-model="showShareDialog"
            :character="character"
            @shared="fetchCharacter"
          />
          <ReportDialog
            v-model="showReportDialog"
            target-type="character"
            :target-id="characterId"
          />
        </div>
      </template>
    </div>
  </ExplorationLayout>
</template>

<style scoped lang="scss">
.private-story-detail .story-hero { grid-template-columns: minmax(0, .65fr) minmax(0, 1fr); gap: 40px; padding-bottom: 32px; border-bottom: 1px solid var(--border-default); }
.private-story-detail .story-cover { aspect-ratio: 4 / 3; }
.private-story-detail .story-intro h1 { font-size: clamp(30px, 3.5vw, 44px); }
.private-story-detail .detail-body { max-width: 850px; }
.private-detail-tools { display: flex; flex-wrap: wrap; gap: 20px; padding-top: 8px; border-top: 1px solid var(--border-subtle); width: 100%; }
.private-detail-tools button, .private-detail-tools a { display: inline-flex; align-items: center; min-height: 44px; padding: 4px 0; border: 0; background: transparent; font: inherit; font-size: 13px; color: var(--text-secondary); text-decoration: none; cursor: pointer; }
.introduction-details { color: var(--text-secondary); font-size: 13px; max-width: 100%; }
.introduction-details summary { padding: 10px 0; min-height: 44px; cursor: pointer; color: var(--accent-text); }
.introduction-details p { max-height: 320px; overflow-y: auto; padding: 12px; background: var(--bg-subtle); white-space: pre-wrap; line-height: 1.8; }
.introduction-details summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.story-management { display: flex; flex-direction: column; gap: 20px; padding-top: 28px; border-top: 1px solid var(--border-default); scroll-margin-top: 30px; }
.management-intro h2 { margin: 0 0 10px; color: var(--text-primary); font: 500 25px/1.4 var(--font-display); }
.management-intro p { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.8; }
.character-detail-page {
  max-width: 1120px;
  margin: 0 auto;
  min-height: 400px;
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 80px 20px;
  color: var(--text-secondary);
}

.btn-report {
  color: var(--text-secondary);
}

.btn-report:hover {
  color: var(--el-color-danger);
}

.story-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 48px;
  margin-bottom: 32px;
}

.story-cover {
  align-self: start;
  aspect-ratio: 5 / 4;
  border: 1px solid var(--border-default);
  overflow: hidden;
  border-radius: var(--radius-card);
  background: var(--bg-subtle);
  color: var(--accent-text);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 64px;
}

.story-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 22%;
}

.story-intro {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.story-intro h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(34px, 4vw, 54px);
  font-weight:500;
  line-height: 1.3;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.story-intro p {
  margin: 0;
  overflow-wrap: anywhere;
}

.story-summary {
  color: var(--text-secondary);
  line-height: 1.75;
}

.customize-identity { min-height: 44px; padding: 8px 0; background: transparent; border: 0; color: var(--accent-text); font-size: 14px; cursor: pointer; }

.story-eyebrow {
  font-size: 12px;
  color: var(--accent-text);
}

.story-author,
.story-hint {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.story-opening,
.story-guidance {
  padding: 24px;
  border-radius: var(--radius-card);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}

.story-opening {
  border-left: 3px solid var(--accent);
}

.detail-section.story-opening p {
  font-family: var(--font-reading);
  font-size: 17px;
  line-height: 1.75;
}

.story-balance {
  margin-top: 16px;
}

.story-balance .el-button {
  margin-top: 12px;
}

.character-detail-page :deep(.el-button),
.btn-back {
  min-height: 44px;
}

.btn-back:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.rating-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-body {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail-section h2,
.detail-section h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.detail-section p {
  margin: 0;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.creator-notes {
  padding: 16px;
  background: color-mix(in srgb, var(--accent) 4%, transparent);
  border-radius: 8px;
  border-left: 3px solid var(--accent);
}

.tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tags :deep(.el-tag) {
  height: auto;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px;
  background: color-mix(in srgb, var(--accent) 4%, transparent);
  border-radius: 8px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--accent-text);
}

.action-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 14px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-back:hover {
  border-color: var(--accent);
  color: var(--accent-text);
}

@include below(md) {
  .story-hero, .private-story-detail .story-hero {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }

  .story-cover, .private-story-detail .story-cover {
    width: 100%;
    aspect-ratio: 16 / 9;
  }

  .story-opening,
  .story-guidance {
    padding: 18px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
