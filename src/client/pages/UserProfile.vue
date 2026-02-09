<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChatDotRound, Star, Picture } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores/user';
import { socialApi } from '@client/services/social.api';
import { api } from '@client/services/api';
import { createLogger } from '@client/utils/logger';
import FollowButton from '@client/components/social/FollowButton.vue';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import type { FollowInfo } from '@/types/social';
import type { Character } from '@client/types';

const logger = createLogger('UserProfile');
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const userStore = useUserStore();

const userId = computed(() => route.params.userId as string);
const isOwnProfile = computed(() => userStore.user?.id === userId.value);

// User info
const userInfo = ref<{ id: string; displayName: string | null; avatarUrl: string | null } | null>(null);
const followInfo = ref<FollowInfo | null>(null);
const loading = ref(true);
const error = ref(false);

// Tabs
const activeTab = ref('characters');

// Characters tab
const characters = ref<Character[]>([]);
const charactersLoading = ref(false);

// Favorites tab
const favorites = ref<Character[]>([]);
const favoritesLoading = ref(false);

const avatarUrl = computed(() => {
  if (userInfo.value?.avatarUrl) return userInfo.value.avatarUrl;
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId.value}`;
});

const displayName = computed(() => {
  if (userInfo.value?.displayName) return userInfo.value.displayName;
  return userId.value.slice(0, 8) + '...';
});
// Fetch user data
async function fetchUserData() {
  loading.value = true;
  error.value = false;
  try {
    const status = await socialApi.getFollowStatus(userId.value);
    followInfo.value = status;

    userInfo.value = { id: userId.value, displayName: null, avatarUrl: null };

    try {
      const user = await api.get<{ id: string; displayName: string | null; avatarUrl: string | null }>(
        `/social/users/${userId.value}/profile`
      );
      if (user) {
        userInfo.value = user;
      }
    } catch {
      // User profile endpoint may not exist, use fallback
    }
  } catch (err: unknown) {
    logger.error('Failed to fetch user data', err instanceof Error ? { message: err.message } : {});
    error.value = true;
  } finally {
    loading.value = false;
  }
}

// Fetch characters
async function fetchCharacters() {
  charactersLoading.value = true;
  try {
    const result = await api.get<Character[] | { items: Character[] }>(
      `/characters/marketplace?creatorId=${userId.value}&limit=20`
    );
    characters.value = Array.isArray(result) ? result : (result as { items: Character[] }).items || [];
  } catch {
    characters.value = [];
  } finally {
    charactersLoading.value = false;
  }
}

// Fetch favorites
async function fetchFavorites() {
  favoritesLoading.value = true;
  try {
    if (isOwnProfile.value) {
      const result = await socialApi.getUserFavorites(20, 0);
      favorites.value = Array.isArray(result) ? result as Character[] : [];
    } else {
      favorites.value = [];
    }
  } catch {
    favorites.value = [];
  } finally {
    favoritesLoading.value = false;
  }
}
function handleTabChange(tab: string) {
  if (tab === 'characters' && characters.value.length === 0 && !charactersLoading.value) {
    fetchCharacters();
  } else if (tab === 'favorites' && favorites.value.length === 0 && !favoritesLoading.value) {
    fetchFavorites();
  }
}

function handleStartChat(characterId: string) {
  router.push({ name: 'Chat', query: { characterId } });
}

function getCharacterAvatar(character: Character): string {
  return character.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${character.id}`;
}

onMounted(() => {
  fetchUserData();
  fetchCharacters();
});

watch(userId, () => {
  fetchUserData();
  characters.value = [];
  favorites.value = [];
  activeTab.value = 'characters';
  fetchCharacters();
});
</script>
<template>
  <DashboardLayout>
    <template #title>{{ t('social.userProfile') }}</template>

    <div v-if="loading" v-loading="true" class="loading-container" />

    <div v-else-if="error" class="error-state">
      <el-icon :size="64" color="var(--text-tertiary)"><Picture /></el-icon>
      <h3>{{ t('social.userNotFound') }}</h3>
      <p>{{ t('social.loadFailed') }}</p>
    </div>

    <div v-else class="user-profile">
      <div class="profile-header">
        <div class="profile-header-content">
          <el-avatar
            :size="96"
            :src="avatarUrl"
            class="profile-avatar"
          />
          <div class="profile-info">
            <h2 class="profile-name">{{ displayName }}</h2>
            <div class="profile-stats">
              <div class="stat-item">
                <span class="stat-count">{{ followInfo?.followerCount ?? 0 }}</span>
                <span class="stat-label">{{ t('social.followers') }}</span>
              </div>
              <div class="stat-divider" />
              <div class="stat-item">
                <span class="stat-count">{{ followInfo?.followingCount ?? 0 }}</span>
                <span class="stat-label">{{ t('social.followings') }}</span>
              </div>
              <div class="stat-divider" />
              <div class="stat-item">
                <span class="stat-count">{{ characters.length }}</span>
                <span class="stat-label">{{ t('social.characters') }}</span>
              </div>
            </div>
          </div>
          <div v-if="!isOwnProfile" class="profile-actions">
            <FollowButton :user-id="userId" />
          </div>
        </div>
      </div>
      <el-tabs v-model="activeTab" class="profile-tabs" @tab-change="handleTabChange">
        <el-tab-pane :label="t('social.characters')" name="characters">
          <div v-if="charactersLoading" v-loading="true" class="tab-loading" />
          <div v-else-if="characters.length === 0" class="empty-state">
            <el-icon :size="48" color="var(--text-tertiary)"><Picture /></el-icon>
            <p>{{ t('social.noCharacters') }}</p>
          </div>
          <div v-else class="character-grid">
            <div
              v-for="character in characters"
              :key="character.id"
              class="character-mini-card"
              role="button"
              tabindex="0"
              @click="handleStartChat(character.id)"
              @keydown.enter="handleStartChat(character.id)"
            >
              <el-avatar
                :size="56"
                :src="getCharacterAvatar(character)"
                class="character-avatar"
              />
              <div class="character-info">
                <h4 class="character-name">{{ character.name }}</h4>
                <p class="character-desc">
                  {{ character.description || t('market.noDescription') }}
                </p>
              </div>
              <div class="character-meta">
                <div v-if="character.rating" class="character-rating">
                  <el-icon><Star /></el-icon>
                  <span>{{ character.rating.toFixed(1) }}</span>
                </div>
                <el-button
                  type="primary"
                  size="small"
                  :icon="ChatDotRound"
                  @click.stop="handleStartChat(character.id)"
                >
                  {{ t('market.startChat') }}
                </el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane :label="t('social.favorites')" name="favorites">
          <div v-if="favoritesLoading" v-loading="true" class="tab-loading" />
          <div v-else-if="!isOwnProfile" class="empty-state">
            <el-icon :size="48" color="var(--text-tertiary)"><Star /></el-icon>
            <p>{{ t('social.noFavoritesOther') }}</p>
          </div>
          <div v-else-if="favorites.length === 0" class="empty-state">
            <el-icon :size="48" color="var(--text-tertiary)"><Star /></el-icon>
            <p>{{ t('social.noFavorites') }}</p>
          </div>
          <div v-else class="character-grid">
            <div
              v-for="character in favorites"
              :key="character.id"
              class="character-mini-card"
              role="button"
              tabindex="0"
              @click="handleStartChat(character.id)"
              @keydown.enter="handleStartChat(character.id)"
            >
              <el-avatar
                :size="56"
                :src="getCharacterAvatar(character)"
                class="character-avatar"
              />
              <div class="character-info">
                <h4 class="character-name">{{ character.name }}</h4>
                <p class="character-desc">
                  {{ character.description || t('market.noDescription') }}
                </p>
              </div>
              <div class="character-meta">
                <el-button
                  type="primary"
                  size="small"
                  :icon="ChatDotRound"
                  @click.stop="handleStartChat(character.id)"
                >
                  {{ t('market.startChat') }}
                </el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </DashboardLayout>
</template>
<style scoped>
.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.error-state h3 {
  margin: 16px 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.error-state p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.user-profile {
  max-width: 960px;
  margin: 0 auto;
  animation: fadeIn var(--duration-slow) var(--ease-out) both;
}

.profile-header {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 32px;
  margin-bottom: 24px;
  border: 1px solid var(--border-default);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--text-primary) 8%, transparent);
}

.profile-header-content {
  display: flex;
  align-items: center;
  gap: 24px;
}
.profile-avatar {
  flex-shrink: 0;
  border: 3px solid var(--border-default);
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 12px;
  color: var(--text-primary);
}

.profile-stats {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-count {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: var(--border-default);
}

.profile-actions {
  flex-shrink: 0;
}
.profile-tabs {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid var(--border-default);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--text-primary) 8%, transparent);
}

.profile-tabs :deep(.el-tabs__header) {
  margin-bottom: 24px;
}

.profile-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--accent-purple);
}

.profile-tabs :deep(.el-tabs__item.is-active) {
  color: var(--accent-purple);
}

.profile-tabs :deep(.el-tabs__item:hover) {
  color: var(--accent-purple);
}

.tab-loading {
  min-height: 200px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-state p {
  margin: 16px 0 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.character-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.character-mini-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid var(--border-default);
  background: var(--bg-base);
  cursor: pointer;
  transition: all 0.2s ease;
}

.character-mini-card:hover {
  border-color: var(--accent-purple);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent-purple) 10%, transparent);
}

.character-mini-card:focus-visible {
  outline: 2px solid var(--accent-purple);
  outline-offset: 2px;
}

.character-avatar {
  flex-shrink: 0;
}

.character-info {
  flex: 1;
  min-width: 0;
}

.character-name {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.character-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.character-rating {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.character-rating .el-icon {
  color: var(--color-warning);
}

.character-meta :deep(.el-button) {
  background: var(--accent-purple);
  border-color: var(--accent-purple);
}

.character-meta :deep(.el-button:hover) {
  opacity: 0.85;
}

/* Tablet */
@media (max-width: 1023px) {
  .profile-header {
    padding: 24px;
  }

  .profile-name {
    font-size: 20px;
  }

  .profile-tabs {
    padding: 20px;
  }
}

/* Mobile */
@media (max-width: 767px) {
  .profile-header {
    padding: 20px;
  }

  .profile-header-content {
    flex-direction: column;
    text-align: center;
  }

  .profile-stats {
    justify-content: center;
  }

  .profile-name {
    font-size: 18px;
  }

  .profile-tabs {
    padding: 16px;
  }

  .character-mini-card {
    flex-wrap: wrap;
    gap: 12px;
  }

  .character-meta {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
