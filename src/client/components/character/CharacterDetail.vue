<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChatDotRound, Star, Download, Upload } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useCharacterStore } from '@client/stores';
import { useUserStore } from '@client/stores/user';
import RatingComponent from '@client/components/rating/RatingComponent.vue';
import { api } from '@client/services/api';
import { downloadCharacterJson } from '@client/utils/sillytavern';
import { createLogger } from '@client/utils/logger';
import FavoriteButton from '@client/components/social/FavoriteButton.vue';
import CommentSection from '@client/components/social/CommentSection.vue';
import type { RatingInput, RatingResponseDto } from '@/types/rating';

const logger = createLogger('CharacterDetail');

const props = defineProps<{
  visible: boolean;
  characterId: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const router = useRouter();
const { t, locale } = useI18n();
const characterStore = useCharacterStore();
const authStore = useUserStore();

const character = computed(() => characterStore.currentCharacter);
const isAuthenticated = computed(() => authStore.isAuthenticated);

// Responsive drawer size
const isMobile = ref(window.innerWidth < 768);
const drawerSize = computed(() => isMobile.value ? '100%' : '600px');
function handleResize() { isMobile.value = window.innerWidth < 768; }

// Rating state
const ratings = ref<RatingResponseDto | null>(null);
const userRating = ref<RatingInput>({
  quality: 0,
  creativity: 0,
  interactivity: 0,
  accuracy: 0,
  entertainment: 0,
});
const showRatingDialog = ref(false);
const submittingRating = ref(false);

// Import state
const importing = ref(false);

const avatarUrl = computed(() =>
  character.value?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${props.characterId}`
);

const overallRating = computed(() => {
  if (!ratings.value?.overall) return 0;
  return parseFloat(ratings.value.overall);
});

onMounted(async () => {
  window.addEventListener('resize', handleResize);
  await fetchRatings();
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

async function fetchRatings() {
  try {
    const response = await api.get<RatingResponseDto>(`/characters/${props.characterId}/ratings`);
    ratings.value = response;
    if (response?.userRating) {
      userRating.value = response.userRating;
    }
  } catch (error) {
    logger.error('Failed to fetch ratings', error);
  }
}

function handleStartChat() {
  if (character.value) {
    router.push({ name: 'Chat', query: { characterId: character.value.id } });
    emit('close');
  }
}

async function handleImport() {
  if (!isAuthenticated.value) {
    ElMessage.warning(t('characterDetail.loginRequired'));
    return;
  }

  if (!character.value) return;

  importing.value = true;
  try {
    await api.post(`/characters/${character.value.id}/fork`);
    ElMessage.success(t('characterDetail.importSuccess'));
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('characterDetail.importFailed'));
  } finally {
    importing.value = false;
  }
}

function handleExport() {
  if (!character.value) return;
  downloadCharacterJson(character.value);
  ElMessage.success(t('characterDetail.exportSuccess'));
}

function handleRateClick() {
  if (!isAuthenticated.value) {
    ElMessage.warning(t('characterDetail.loginRequired'));
    return;
  }
  showRatingDialog.value = true;
}

async function handleSubmitRating() {
  if (!character.value) return;

  // Validate all dimensions are rated
  if (
    userRating.value.quality === 0 ||
    userRating.value.creativity === 0 ||
    userRating.value.interactivity === 0 ||
    userRating.value.accuracy === 0 ||
    userRating.value.entertainment === 0
  ) {
    ElMessage.warning(t('characterDetail.rateAllDimensions'));
    return;
  }

  submittingRating.value = true;
  try {
    await api.post(`/characters/${character.value.id}/ratings`, userRating.value);
    ElMessage.success(t('characterDetail.ratingSubmitted'));
    showRatingDialog.value = false;
    await fetchRatings();
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('characterDetail.submitFailed'));
  } finally {
    submittingRating.value = false;
  }
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    :title="t('characterDetail.title')"
    :size="drawerSize"
    @close="handleClose"
  >
    <div v-if="character" class="detail-content">
      <div class="detail-header">
        <el-avatar :size="120" :src="avatarUrl" />
        <h2>{{ character.name }}</h2>

        <div class="rating-section">
          <RatingComponent
            :model-value="overallRating"
            readonly
            show-score
            :show-count="true"
            :count="ratings?.count || 0"
          />
        </div>

        <el-button
          type="primary"
          text
          @click="handleRateClick"
        >
          {{ ratings?.userRating ? t('characterDetail.editRating') : t('characterDetail.rate') }}
        </el-button>
      </div>

      <el-divider />

      <div class="detail-section">
        <h3>{{ t('characterDetail.description') }}</h3>
        <p>{{ character.description || t('characterDetail.noDescription') }}</p>
      </div>

      <!-- Creator Notes -->
      <div v-if="character?.cardData?.creator_notes" class="creator-notes-section">
        <h4>{{ t('characterDetail.creatorNotes') }}</h4>
        <div class="creator-notes-content">
          {{ character.cardData.creator_notes }}
        </div>
      </div>

      <div v-if="character.tags && character.tags.length" class="detail-section">
        <h3>{{ t('characterDetail.tags') }}</h3>
        <div class="tags">
          <el-tag
            v-for="tag in character.tags"
            :key="tag"
            type="info"
          >
            {{ tag }}
          </el-tag>
        </div>
      </div>

      <!-- Rating Dimensions -->
      <div v-if="ratings" class="detail-section">
        <h3>{{ t('characterDetail.ratingDetails') }}</h3>
        <div class="rating-dimensions">
          <div class="dimension-item">
            <span class="dimension-label">{{ t('characterDetail.quality') }}</span>
            <RatingComponent
              :model-value="parseFloat(ratings.dimensions.quality || '0')"
              readonly
              show-score
              size="small"
            />
          </div>
          <div class="dimension-item">
            <span class="dimension-label">{{ t('characterDetail.creativity') }}</span>
            <RatingComponent
              :model-value="parseFloat(ratings.dimensions.creativity || '0')"
              readonly
              show-score
              size="small"
            />
          </div>
          <div class="dimension-item">
            <span class="dimension-label">{{ t('characterDetail.interactivity') }}</span>
            <RatingComponent
              :model-value="parseFloat(ratings.dimensions.interactivity || '0')"
              readonly
              show-score
              size="small"
            />
          </div>
          <div class="dimension-item">
            <span class="dimension-label">{{ t('characterDetail.accuracy') }}</span>
            <RatingComponent
              :model-value="parseFloat(ratings.dimensions.accuracy || '0')"
              readonly
              show-score
              size="small"
            />
          </div>
          <div class="dimension-item">
            <span class="dimension-label">{{ t('characterDetail.entertainment') }}</span>
            <RatingComponent
              :model-value="parseFloat(ratings.dimensions.entertainment || '0')"
              readonly
              show-score
              size="small"
            />
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3>{{ t('characterDetail.statistics') }}</h3>
        <div class="stats">
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

      <!-- Comments -->
      <el-divider />
      <CommentSection :character-id="characterId" />

      <div class="action-section">
        <FavoriteButton :character-id="characterId" />
        <el-button
          type="primary"
          size="large"
          :icon="ChatDotRound"
          @click="handleStartChat"
        >
          {{ t('market.startChat') }}
        </el-button>
        <el-button
          size="large"
          :icon="Download"
          :loading="importing"
          @click="handleImport"
        >
          {{ t('characterDetail.importToMine') }}
        </el-button>
        <el-button
          size="large"
          :icon="Upload"
          @click="handleExport"
        >
          {{ t('characterDetail.exportJson') }}
        </el-button>
      </div>
    </div>

    <div v-else v-loading="characterStore.loading" class="loading-container" />

    <!-- Rating Dialog -->
    <el-dialog
      v-model="showRatingDialog"
      :title="t('characterDetail.rate')"
      :width="isMobile ? '90vw' : '500px'"
    >
      <div class="rating-form">
        <div class="rating-item">
          <label>{{ t('characterDetail.quality') }}</label>
          <RatingComponent
            v-model="userRating.quality"
            :max="5"
          />
        </div>
        <div class="rating-item">
          <label>{{ t('characterDetail.creativity') }}</label>
          <RatingComponent
            v-model="userRating.creativity"
            :max="5"
          />
        </div>
        <div class="rating-item">
          <label>{{ t('characterDetail.interactivity') }}</label>
          <RatingComponent
            v-model="userRating.interactivity"
            :max="5"
          />
        </div>
        <div class="rating-item">
          <label>{{ t('characterDetail.accuracy') }}</label>
          <RatingComponent
            v-model="userRating.accuracy"
            :max="5"
          />
        </div>
        <div class="rating-item">
          <label>{{ t('characterDetail.entertainment') }}</label>
          <RatingComponent
            v-model="userRating.entertainment"
            :max="5"
          />
        </div>
      </div>

      <template #footer>
        <el-button @click="showRatingDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="submittingRating"
          @click="handleSubmitRating"
        >
          {{ t('characterDetail.submit') }}
        </el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.detail-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.rating-section {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
}

.detail-section h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px 0;
}

.detail-section p {
  margin: 0;
  line-height: 1.6;
  color: var(--text-primary);
}

.creator-notes-section {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-surface);
  border-radius: 8px;
  border-left: 3px solid var(--accent-purple);
}

.creator-notes-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.creator-notes-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.rating-dimensions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dimension-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dimension-label {
  font-size: 14px;
  color: var(--text-primary);
  min-width: 80px;
}

.stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.action-section {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-section .el-button {
  width: 100%;
}

.loading-container {
  min-height: 400px;
}

.rating-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.rating-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rating-item label {
  font-size: 14px;
  font-weight: 500;
  min-width: 80px;
}
</style>
