<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Upload, Download, Share, Search } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores';
import { api } from '@client/services/api';
import { useFeatureGate } from '@client/composables/useFeatureGate';
import LeftSidebar from '@client/components/layout/LeftSidebar.vue';
import CharacterCard from '@client/components/character/CharacterCard.vue';
import EmptyState from '@client/components/market/EmptyState.vue';
import CharacterPublishForm from '@client/components/character/CharacterPublishForm.vue';
import { downloadCharacterJson, readCharacterJson } from '@client/utils/sillytavern';
import type { Character } from '@client/types';

const userStore = useUserStore();
const { hasFeature } = useFeatureGate();

// State
const characters = ref<Character[]>([]);
const loading = ref(false);
const activeTab = ref<'private' | 'published'>('private');
const searchQuery = ref('');
const showUserMenu = ref(false);

// Dialogs
const publishDialogVisible = ref(false);
const selectedCharacterForPublish = ref<Character | null>(null);

// Computed
const isLoggedIn = computed(() => !!userStore.user);

const privateCharacters = computed(() => {
  return characters.value.filter(c => !c.isPublic);
});

const publishedCharacters = computed(() => {
  return characters.value.filter(c => c.isPublic);
});

const displayCharacters = computed(() => {
  const list = activeTab.value === 'private' ? privateCharacters.value : publishedCharacters.value;

  if (!searchQuery.value.trim()) {
    return list;
  }

  const query = searchQuery.value.toLowerCase();
  return list.filter(c =>
    c.name.toLowerCase().includes(query) ||
    c.description?.toLowerCase().includes(query) ||
    c.tags?.some(tag => tag.toLowerCase().includes(query))
  );
});

onMounted(async () => {
  await fetchCharacters();
});

async function fetchCharacters() {
  loading.value = true;
  try {
    const response = await api.get<{ data: { items: Character[] } }>('/characters');
    characters.value = response.data.items;
  } catch (error) {
    console.error('Failed to fetch characters:', error);
    ElMessage.error('获取角色列表失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  // Search is reactive through computed property
}

function handleClearFilters() {
  searchQuery.value = '';
}

function handleBrowseAll() {
  searchQuery.value = '';
  activeTab.value = 'private';
}

function handleCreateNew() {
  // Navigate to character creation page or open dialog
  ElMessage.info('创建角色功能开发中');
}

function handlePublish(character: Character) {
  selectedCharacterForPublish.value = character;
  publishDialogVisible.value = true;
}

async function handleUnpublish(character: Character) {
  try {
    await ElMessageBox.confirm(
      '确定要从市场下架此角色吗？',
      '确认下架',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    await api.post(`/characters/${character.id}/unpublish`);
    ElMessage.success('角色已下架');
    await fetchCharacters();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '下架失败');
    }
  }
}

async function handleDelete(character: Character) {
  try {
    await ElMessageBox.confirm(
      '确定要删除此角色吗？此操作不可恢复。',
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'error',
      }
    );

    await api.delete(`/characters/${character.id}`);
    ElMessage.success('角色已删除');
    await fetchCharacters();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
}

function handleExport(character: Character) {
  downloadCharacterJson(character);
  ElMessage.success('角色已导出');
}

async function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const characterData = await readCharacterJson(file);

      // Create character
      await api.post('/characters', characterData);
      ElMessage.success('角色已导入');
      await fetchCharacters();
    } catch (error: any) {
      ElMessage.error(error.message || '导入失败');
    }
  };

  input.click();
}

function handlePublishSuccess() {
  publishDialogVisible.value = false;
  selectedCharacterForPublish.value = null;
  fetchCharacters();
}

function handleCardClick(characterId: string) {
  // TODO: Open character detail modal or navigate to detail page
  console.log('Character clicked:', characterId);
}

function handleLogout() {
  userStore.logout();
  showUserMenu.value = false;
}
</script>

<template>
  <div class="my-characters-page">
    <!-- 左侧导航栏 -->
    <LeftSidebar />

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部栏 -->
      <header class="top-bar">
        <h1 class="page-title">我的角色</h1>

        <!-- 搜索框 -->
        <div class="search-combo">
          <el-input
            v-model="searchQuery"
            placeholder="搜索角色名称、描述或标签..."
            :prefix-icon="Search"
            clearable
            @keyup.enter="handleSearch"
          />
          <el-button type="primary" :icon="Plus" @click="handleCreateNew">
            创建角色
          </el-button>
        </div>

        <!-- 用户菜单 -->
        <div class="user-menu-wrapper">
          <el-dropdown v-if="isLoggedIn" trigger="click" @command="handleLogout">
            <div class="user-avatar-btn">
              <el-avatar
                :size="40"
                :src="userStore.user?.avatar"
              >
                {{ userStore.user?.name?.[0] }}
              </el-avatar>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  <div class="user-info">
                    <div class="user-name">{{ userStore.user?.name }}</div>
                    <div class="user-email">{{ userStore.user?.email }}</div>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item divided @click="$router.push('/profile')">
                  个人中心
                </el-dropdown-item>
                <el-dropdown-item @click="$router.push('/market')">
                  角色市场
                </el-dropdown-item>
                <el-dropdown-item @click="$router.push('/subscription')">
                  订阅管理
                </el-dropdown-item>
                <el-dropdown-item @click="$router.push('/profile')">
                  设置
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <div v-else class="auth-buttons">
            <el-button @click="$router.push('/login')">登录</el-button>
            <el-button type="primary" @click="$router.push('/register')">注册</el-button>
          </div>
        </div>
      </header>

      <!-- 标签栏 -->
      <div class="tabs-section">
        <el-tabs v-model="activeTab" class="character-tabs">
          <el-tab-pane name="private">
            <template #label>
              <span class="tab-label">
                私有角色
                <span class="tab-count">{{ privateCharacters.length }}</span>
              </span>
            </template>
          </el-tab-pane>
          <el-tab-pane name="published">
            <template #label>
              <span class="tab-label">
                已发布
                <span class="tab-count">{{ publishedCharacters.length }}</span>
              </span>
            </template>
          </el-tab-pane>
        </el-tabs>

        <div class="tabs-actions">
          <el-button :icon="Upload" @click="handleImport">
            导入角色
          </el-button>
        </div>
      </div>

      <!-- 角色网格 -->
      <div v-loading="loading" class="characters-section">
        <div v-if="!loading && displayCharacters.length === 0">
          <EmptyState
            @clear-filters="handleClearFilters"
            @browse-all="handleBrowseAll"
          />
        </div>

        <div v-else class="characters-grid">
          <div
            v-for="character in displayCharacters"
            :key="character.id"
            class="character-card-wrapper"
          >
            <CharacterCard
              :character="character"
              @click="handleCardClick(character.id)"
            />

            <!-- 操作按钮覆盖层 -->
            <div class="card-actions-overlay">
              <el-button
                size="small"
                :icon="Edit"
                circle
                @click.stop="handleCardClick(character.id)"
              />

              <el-button
                v-if="!character.isPublic"
                size="small"
                type="success"
                :icon="Share"
                circle
                :disabled="!hasFeature('character_share')"
                @click.stop="handlePublish(character)"
              />

              <el-button
                v-else
                size="small"
                type="warning"
                :icon="Download"
                circle
                @click.stop="handleUnpublish(character)"
              />

              <el-button
                size="small"
                :icon="Download"
                circle
                @click.stop="handleExport(character)"
              />

              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                circle
                @click.stop="handleDelete(character)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Publish Dialog -->
    <CharacterPublishForm
      v-if="selectedCharacterForPublish && publishDialogVisible"
      :visible="publishDialogVisible"
      :character="selectedCharacterForPublish"
      @close="publishDialogVisible = false"
      @success="handlePublishSuccess"
    />
  </div>
</template>

<style scoped>
.my-characters-page {
  display: flex;
  min-height: 100vh;
  background: #F9FAFB;
}

/* 主内容区 */
.main-content {
  flex: 1;
  margin-left: 64px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* 顶部栏 */
.top-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 32px;
  background: white;
  border-bottom: 1px solid #E5E7EB;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  margin: 0;
  white-space: nowrap;
}

/* 搜索框组合 */
.search-combo {
  flex: 1;
  display: flex;
  gap: 12px;
  max-width: 600px;
}

.search-combo :deep(.el-input) {
  flex: 1;
}

.search-combo :deep(.el-input__wrapper) {
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}

.search-combo :deep(.el-input__wrapper:hover) {
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
}

.search-combo :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.search-combo :deep(.el-button) {
  border-radius: 12px;
  padding: 12px 24px;
  font-weight: 500;
  background: #3B82F6;
  border-color: #3B82F6;
  transition: all 0.2s ease;
}

.search-combo :deep(.el-button:hover) {
  background: #2563EB;
  border-color: #2563EB;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.search-combo :deep(.el-button:active) {
  background: #1D4ED8;
  border-color: #1D4ED8;
  transform: translateY(0);
}

/* 用户菜单 */
.user-menu-wrapper {
  margin-left: auto;
  flex-shrink: 0;
}

.user-avatar-btn {
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.user-avatar-btn:hover {
  opacity: 0.8;
}

.user-info {
  padding: 8px 0;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}

.user-email {
  font-size: 12px;
  color: #9CA3AF;
}

.auth-buttons {
  display: flex;
  gap: 12px;
}

/* 标签栏 */
.tabs-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 32px;
  background: white;
  border-bottom: 1px solid #E5E7EB;
}

.character-tabs {
  flex: 1;
}

.character-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.character-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.character-tabs :deep(.el-tabs__active-bar) {
  background: #3B82F6;
  height: 3px;
}

.character-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 500;
  color: #6B7280;
  padding: 0 20px;
  height: 44px;
  line-height: 44px;
}

.character-tabs :deep(.el-tabs__item:hover) {
  color: #3B82F6;
}

.character-tabs :deep(.el-tabs__item.is-active) {
  color: #3B82F6;
  font-weight: 600;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: #EFF6FF;
  color: #3B82F6;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.character-tabs :deep(.el-tabs__item.is-active) .tab-count {
  background: #3B82F6;
  color: white;
}

.tabs-actions {
  display: flex;
  gap: 12px;
}

.tabs-actions :deep(.el-button) {
  border-radius: 8px;
}

/* 角色区域 */
.characters-section {
  flex: 1;
  padding: 24px 32px 32px;
  min-height: 400px;
}

.characters-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

/* 角色卡片包装器 */
.character-card-wrapper {
  position: relative;
}

.character-card-wrapper:hover .card-actions-overlay {
  opacity: 1;
  pointer-events: auto;
}

/* 操作按钮覆盖层 */
.card-actions-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(4px);
  border-radius: 16px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  padding: 16px;
  flex-wrap: wrap;
}

.card-actions-overlay :deep(.el-button) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-actions-overlay :deep(.el-button.is-circle) {
  width: 36px;
  height: 36px;
}

/* 平板端适配 (3列) */
@media (max-width: 1279px) and (min-width: 768px) {
  .characters-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
}

/* 移动端适配 (1列) */
@media (max-width: 767px) {
  .main-content {
    margin-left: 0;
  }

  .top-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    padding: 16px;
  }

  .page-title {
    font-size: 20px;
  }

  .search-combo {
    max-width: none;
    flex-direction: column;
  }

  .search-combo :deep(.el-button) {
    width: 100%;
  }

  .user-menu-wrapper {
    margin-left: 0;
  }

  .auth-buttons {
    width: 100%;
  }

  .auth-buttons .el-button {
    flex: 1;
  }

  .tabs-section {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 16px;
  }

  .tabs-actions {
    width: 100%;
  }

  .tabs-actions .el-button {
    flex: 1;
  }

  .characters-section {
    padding: 16px;
  }

  .characters-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .card-actions-overlay {
    opacity: 1;
    pointer-events: auto;
    position: static;
    background: white;
    border-top: 1px solid #E5E7EB;
    border-radius: 0 0 16px 16px;
    margin-top: -16px;
    padding: 12px;
  }
}

/* 小平板端适配 */
@media (max-width: 1023px) and (min-width: 768px) {
  .top-bar {
    padding: 16px 24px;
  }

  .tabs-section {
    padding: 12px 24px;
  }

  .characters-section {
    padding: 20px 24px 24px;
  }
}
</style>
