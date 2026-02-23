<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChatDotRound, Download, Upload, ArrowLeft, Edit, Share, FolderAdd } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useCharacterStore, useUserStore } from '@client/stores';
import { api } from '@client/services/api';
import { downloadCharacterJson } from '@client/utils/sillytavern';
import { characterCollectionApi } from '@client/services/character-collection.api';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import RatingComponent from '@client/components/rating/RatingComponent.vue';
import FavoriteButton from '@client/components/social/FavoriteButton.vue';
import CommentSection from '@client/components/social/CommentSection.vue';
import ShareDialog from '@client/components/character/ShareDialog.vue';
import type { RatingInput, RatingResponseDto } from '@/types/rating';
import type { CharacterCollection } from '@client/types';

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const characterStore = useCharacterStore();
const userStore = useUserStore();

const characterId = computed(() => route.params.id as string);
const character = computed(() => characterStore.currentCharacter);
const isAuthenticated = computed(() => userStore.isAuthenticated);
const isOwner = computed(() =>
  userStore.user && character.value?.creatorId && userStore.user.id === character.value.creatorId
);
const loading = ref(true);

// Rating state
const ratings = ref<RatingResponseDto | null>(null);
const userRating = ref<RatingInput>({
  quality: 0, creativity: 0, interactivity: 0, accuracy: 0, entertainment: 0,
});
const showRatingDialog = ref(false);
const submittingRating = ref(false);
const importing = ref(false);
const showShareDialog = ref(false);
const collections = ref<CharacterCollection[]>([]);
const addingToCollection = ref(false);

const avatarUrl = computed(() =>
  character.value?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${characterId.value}`
);

const overallRating = computed(() => {
  if (!ratings.value?.overall) return 0;
  return parseFloat(ratings.value.overall);
});

onMounted(async () => {
  await Promise.all([fetchCharacter(), fetchRatings()]);
  loading.value = false;
  if (userStore.isAuthenticated) {
    try {
      collections.value = await characterCollectionApi.getCollections();
    } catch {
      // Collections are supplementary, don't block
    }
  }
});

async function fetchCharacter() {
  try {
    await characterStore.fetchCharacter(characterId.value);
  } catch {
    ElMessage.error(t('common.retry'));
  }
}

async function fetchRatings() {
  try {
    const response = await api.get<RatingResponseDto>(`/characters/${characterId.value}/ratings`);
    ratings.value = response;
    if (response?.userRating) userRating.value = response.userRating;
  } catch { /* ratings are optional */ }
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
  <DashboardLayout>
    <template #title>{{ t('characterDetail.title') }}</template>
    <template #actions>
      <button class="btn-back" @click="router.back()">
        <el-icon><ArrowLeft /></el-icon>
        {{ t('common.back') }}
      </button>
    </template>
    <div v-loading="loading" class="character-detail-page">
      <template v-if="character && !loading">
        <div class="detail-header">
          <el-avatar :size="120" :src="avatarUrl" />
          <h2>{{ character.name }}</h2>
          <div class="rating-section">
            <RatingComponent :model-value="overallRating" readonly show-score :show-count="true" :count="ratings?.count || 0" />
          </div>
        </div>

        <div class="detail-body">
          <div class="detail-section">
            <h3>{{ t('characterDetail.description') }}</h3>
            <p>{{ character.description || t('characterDetail.noDescription') }}</p>
          </div>

          <div v-if="character?.cardData?.creator_notes" class="detail-section creator-notes">
            <h3>{{ t('characterDetail.creatorNotes') }}</h3>
            <p>{{ character.cardData.creator_notes }}</p>
          </div>

          <div v-if="character.tags?.length" class="detail-section">
            <h3>{{ t('characterDetail.tags') }}</h3>
            <div class="tags">
              <el-tag v-for="tag in character.tags" :key="tag" type="info">{{ tag }}</el-tag>
            </div>
          </div>

          <div class="detail-section">
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

          <div class="action-buttons">
            <FavoriteButton :character-id="characterId" />
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
              type="warning"
              :icon="Edit"
              @click="router.push({ name: 'CharacterEdit', params: { id: character.id } })"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-if="isOwner"
              type="info"
              :icon="Share"
              @click="showShareDialog = true"
            >
              {{ t('share.shareLink') }}
            </el-button>
            <el-button type="primary" :icon="ChatDotRound" @click="router.push({ name: 'Chat', query: { characterId: character.id } })">
              {{ t('market.startChat') }}
            </el-button>
          </div>

          <CommentSection :character-id="characterId" />
          <ShareDialog
            v-if="character"
            v-model="showShareDialog"
            :character="character"
            @shared="fetchCharacter"
          />
        </div>
      </template>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.character-detail-page {
  max-width: 800px;
  margin: 0 auto;
  min-height: 400px;
}

.detail-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

.detail-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.rating-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

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
}

.creator-notes {
  padding: 16px;
  background: color-mix(in srgb, var(--accent-purple) 4%, transparent);
  border-radius: 8px;
  border-left: 3px solid var(--accent-purple);
}

.tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
  background: color-mix(in srgb, var(--accent-purple) 4%, transparent);
  border-radius: 8px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--accent-purple);
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
  background: var(--surface-card);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-back:hover {
  border-color: var(--accent-purple);
  color: var(--accent-purple);
}

@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
