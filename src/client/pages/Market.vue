<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { User } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores';
import { api } from '@client/services/api';
import LeftSidebar from '@client/components/layout/LeftSidebar.vue';
import SearchCombo from '@client/components/market/SearchCombo.vue';
import FilterToolbar from '@client/components/market/FilterToolbar.vue';
import EmptyState from '@client/components/market/EmptyState.vue';
import CharacterCard from '@client/components/character/CharacterCard.vue';
import type { Character } from '@client/types';
import type { SearchResult } from '@/types/search';

const userStore = useUserStore();

// 搜索和筛选状态
const searchQuery = ref('');
const selectedCategory = ref('');
const selectedTags = ref<string[]>([]);
const showNsfw = ref(false);
const sortBy = ref('popular');

// 数据状态
const characters = ref<Character[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const loading = ref(false);

// 用户菜单
const showUserMenu = ref(false);

const isLoggedIn = computed(() => !!userStore.user);

onMounted(async () => {
  await fetchCharacters();
});

async function fetchCharacters() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    const query = searchQuery.value.trim() || '*';
    params.set('q', query);
    params.set('sort', sortBy.value);
    params.set('filter', 'public');
    params.set('page', currentPage.value.toString());
    params.set('limit', pageSize.value.toString());

    if (selectedCategory.value) {
      params.set('category', selectedCategory.value);
    }

    if (selectedTags.value.length > 0) {
      params.set('tags', selectedTags.value.join(','));
    }

    if (showNsfw.value) {
      params.set('isNsfw', 'true');
    }

    const response = await api.get<SearchResult>(`/characters/search?${params.toString()}`);
    characters.value = response.items || [];
    total.value = response.pagination.total;
  } catch (error) {
    console.error('Failed to fetch characters:', error);
    ElMessage.error('加载角色失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  currentPage.value = 1;
  fetchCharacters();
}

function handleFilterChange() {
  currentPage.value = 1;
  fetchCharacters();
}

function handlePageChange(page: number) {
  currentPage.value = page;
  fetchCharacters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleClearFilters() {
  searchQuery.value = '';
  selectedCategory.value = '';
  selectedTags.value = [];
  showNsfw.value = false;
  currentPage.value = 1;
  fetchCharacters();
}

function handleBrowseAll() {
  handleClearFilters();
}

function handleCardClick(characterId: string) {
  // TODO: 打开角色详情
  console.log('Character clicked:', characterId);
}

function handleLogout() {
  userStore.logout();
  showUserMenu.value = false;
}
</script>

<template>
  <div class="market-page">
    <!-- 左侧导航栏 -->
    <LeftSidebar />

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部栏 -->
      <header class="top-bar">
        <h1 class="page-title">角色市场</h1>

        <!-- 搜索框组合 -->
        <SearchCombo
          v-model="searchQuery"
          @search="handleSearch"
        />

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
                  📊 个人中心
                </el-dropdown-item>
                <el-dropdown-item @click="$router.push('/my-characters')">
                  🎭 我的角色
                </el-dropdown-item>
                <el-dropdown-item @click="$router.push('/subscription')">
                  💳 订阅管理
                </el-dropdown-item>
                <el-dropdown-item @click="$router.push('/profile')">
                  ⚙️ 设置
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  🚪 退出登录
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

      <!-- 筛选工具栏 -->
      <FilterToolbar
        v-model:selected-category="selectedCategory"
        v-model:selected-tags="selectedTags"
        v-model:show-nsfw="showNsfw"
        v-model:sort-by="sortBy"
        @change="handleFilterChange"
      />

      <!-- 角色网格 -->
      <div v-loading="loading" class="characters-section">
        <div v-if="!loading && characters.length === 0">
          <EmptyState
            @clear-filters="handleClearFilters"
            @browse-all="handleBrowseAll"
          />
        </div>

        <div v-else class="characters-grid">
          <CharacterCard
            v-for="character in characters"
            :key="character.id"
            :character="character"
            @click="handleCardClick(character.id)"
          />
        </div>
      </div>

      <!-- 分页器 -->
      <div v-if="total > pageSize" class="pagination-section">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next, jumper"
          @current-change="handlePageChange"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.market-page {
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

/* 筛选工具栏 */
.top-bar + :deep(.filter-toolbar) {
  margin: 24px 32px;
}

/* 角色区域 */
.characters-section {
  flex: 1;
  padding: 0 32px 32px;
  min-height: 400px;
}

.characters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

/* 分页器 */
.pagination-section {
  display: flex;
  justify-content: center;
  padding: 32px;
  background: white;
  border-top: 1px solid #E5E7EB;
}

.pagination-section :deep(.el-pagination) {
  --el-pagination-button-color: #3B82F6;
  --el-pagination-hover-color: #2563EB;
}

/* 平板端适配 */
@media (max-width: 1023px) {
  .characters-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 20px;
  }
}

/* 移动端适配 */
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

  .user-menu-wrapper {
    margin-left: 0;
  }

  .auth-buttons {
    width: 100%;
  }

  .auth-buttons .el-button {
    flex: 1;
  }

  .top-bar + :deep(.filter-toolbar) {
    margin: 16px;
  }

  .characters-section {
    padding: 0 16px 16px;
  }

  .characters-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .pagination-section {
    padding: 16px;
  }
}
</style>
