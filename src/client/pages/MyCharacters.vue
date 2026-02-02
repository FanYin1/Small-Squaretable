<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Upload, Download, Share, ArrowLeft, Check, Close } from '@element-plus/icons-vue';
import { api } from '@client/services/api';
import { useFeatureGate } from '@client/composables/useFeatureGate';
import CharacterPublishForm from '@client/components/character/CharacterPublishForm.vue';
import { downloadCharacterJson, readCharacterJson } from '@client/utils/sillytavern';
import type { Character } from '@client/types';

const { hasFeature } = useFeatureGate();

// State
const characters = ref<Character[]>([]);
const loading = ref(false);
const activeTab = ref<'private' | 'published'>('private');

// Two-column layout state
const selectedCharacter = ref<Character | null>(null);
const showMobileDetail = ref(false);
const editMode = ref(false);
const editForm = ref({
  name: '',
  description: '',
  tags: [] as string[],
  category: '',
  isNsfw: false
});

// Dialogs
const publishDialogVisible = ref(false);

// Computed
const privateCharacters = computed(() => {
  return characters.value.filter(c => !c.isPublic);
});

const publishedCharacters = computed(() => {
  return characters.value.filter(c => c.isPublic);
});

const displayCharacters = computed(() => {
  return activeTab.value === 'private' ? privateCharacters.value : publishedCharacters.value;
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

function handlePublish(character: Character) {
  selectedCharacter.value = character;
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
  fetchCharacters();
}

function handleEdit(character: Character) {
  selectedCharacter.value = character;
  editMode.value = true;
  editForm.value = {
    name: character.name,
    description: character.description || '',
    tags: character.tags || [],
    category: character.category || '',
    isNsfw: character.isNsfw || false
  };
  showMobileDetail.value = true;
}

function handleSelectCharacter(character: Character) {
  selectedCharacter.value = character;
  editMode.value = false;
  showMobileDetail.value = true;
}

function handleBackToList() {
  showMobileDetail.value = false;
  selectedCharacter.value = null;
  editMode.value = false;
}

function handleCreateNew() {
  selectedCharacter.value = null;
  editMode.value = true;
  editForm.value = {
    name: '',
    description: '',
    tags: [],
    category: '',
    isNsfw: false
  };
  showMobileDetail.value = true;
}

async function handleSaveEdit() {
  if (!editForm.value.name.trim()) {
    ElMessage.error('角色名称不能为空');
    return;
  }

  try {
    if (selectedCharacter.value) {
      // Update existing character
      await api.put(`/characters/${selectedCharacter.value.id}`, editForm.value);
      ElMessage.success('角色已更新');
    } else {
      // Create new character
      await api.post('/characters', editForm.value);
      ElMessage.success('角色已创建');
    }

    await fetchCharacters();
    editMode.value = false;
    selectedCharacter.value = null;
    showMobileDetail.value = false;
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败');
  }
}

function handleCancelEdit() {
  editMode.value = false;
  if (!selectedCharacter.value) {
    showMobileDetail.value = false;
  }
}
</script>

<template>
  <div class="my-characters-container">
    <!-- Header -->
    <div class="page-header">
      <h1>我的角色</h1>
      <div class="header-actions">
        <el-button :icon="Upload" @click="handleImport">
          导入角色
        </el-button>
        <el-button type="success" :icon="Plus" @click="handleCreateNew">
          创建角色
        </el-button>
      </div>
    </div>

    <!-- Two-column layout -->
    <div class="two-column-layout">
      <!-- Left column: Character list -->
      <div
        class="left-column"
        :class="{ 'mobile-hidden': showMobileDetail }"
      >
        <div class="column-header">
          <el-tabs v-model="activeTab" class="character-tabs">
            <el-tab-pane label="私有角色" name="private">
              <template #label>
                <span>私有角色 ({{ privateCharacters.length }})</span>
              </template>
            </el-tab-pane>
            <el-tab-pane label="已发布" name="published">
              <template #label>
                <span>已发布 ({{ publishedCharacters.length }})</span>
              </template>
            </el-tab-pane>
          </el-tabs>
        </div>

        <div v-loading="loading" class="character-list-scroll">
          <el-empty
            v-if="!loading && displayCharacters.length === 0"
            :description="activeTab === 'private' ? '暂无私有角色' : '暂无已发布角色'"
            class="empty-state"
          />

          <div v-else class="character-list">
            <div
              v-for="character in displayCharacters"
              :key="character.id"
              class="character-list-item glass-card"
              :class="{ 'selected': selectedCharacter?.id === character.id }"
              @click="handleSelectCharacter(character)"
            >
              <el-avatar
                :size="48"
                :src="character.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${character.id}`"
                class="character-avatar"
              />
              <div class="character-info">
                <h3 class="character-name">{{ character.name }}</h3>
                <p class="character-desc">{{ character.description || '暂无描述' }}</p>
                <div v-if="character.tags && character.tags.length" class="character-tags">
                  <el-tag
                    v-for="tag in character.tags.slice(0, 2)"
                    :key="tag"
                    size="small"
                    type="info"
                  >
                    {{ tag }}
                  </el-tag>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right column: Character detail/edit -->
      <div
        class="right-column"
        :class="{ 'mobile-visible': showMobileDetail }"
      >
        <!-- Mobile back button -->
        <div class="mobile-back-button" @click="handleBackToList">
          <el-button :icon="ArrowLeft" circle />
        </div>

        <!-- Empty state -->
        <div v-if="!selectedCharacter && !editMode" class="empty-detail glass-card">
          <div class="empty-content">
            <svg class="empty-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="2" opacity="0.2"/>
              <path d="M32 16v32M16 32h32" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <h3>选择一个角色</h3>
            <p>从左侧列表选择角色查看详情，或创建新角色</p>
          </div>
        </div>

        <!-- View mode -->
        <div v-else-if="selectedCharacter && !editMode" class="character-detail glass-card">
          <div class="detail-header">
            <el-avatar
              :size="80"
              :src="selectedCharacter.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedCharacter.id}`"
            />
            <div class="detail-header-info">
              <h2>{{ selectedCharacter.name }}</h2>
              <div class="detail-meta">
                <el-tag v-if="selectedCharacter.isPublic" type="success" size="small">已发布</el-tag>
                <el-tag v-else type="info" size="small">私有</el-tag>
                <el-tag v-if="selectedCharacter.isNsfw" type="warning" size="small">NSFW</el-tag>
              </div>
            </div>
          </div>

          <div class="detail-content">
            <div class="detail-section">
              <h4>描述</h4>
              <p>{{ selectedCharacter.description || '暂无描述' }}</p>
            </div>

            <div v-if="selectedCharacter.tags && selectedCharacter.tags.length" class="detail-section">
              <h4>标签</h4>
              <div class="tags-list">
                <el-tag
                  v-for="tag in selectedCharacter.tags"
                  :key="tag"
                  type="info"
                >
                  {{ tag }}
                </el-tag>
              </div>
            </div>

            <div v-if="selectedCharacter.category" class="detail-section">
              <h4>分类</h4>
              <p>{{ selectedCharacter.category }}</p>
            </div>

            <div v-if="selectedCharacter.isPublic" class="detail-section">
              <h4>统计</h4>
              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-label">评分</span>
                  <span class="stat-value">{{ selectedCharacter.rating || 0 }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">评价数</span>
                  <span class="stat-value">{{ selectedCharacter.ratingCount || 0 }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">下载量</span>
                  <span class="stat-value">{{ selectedCharacter.downloadCount || 0 }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">浏览量</span>
                  <span class="stat-value">{{ selectedCharacter.viewCount || 0 }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="detail-actions">
            <el-button
              type="primary"
              :icon="Edit"
              @click="handleEdit(selectedCharacter)"
            >
              编辑
            </el-button>

            <el-button
              v-if="!selectedCharacter.isPublic"
              type="primary"
              :icon="Share"
              :disabled="!hasFeature('character_share')"
              @click="handlePublish(selectedCharacter)"
            >
              发布到市场
            </el-button>

            <el-button
              v-else
              type="warning"
              @click="handleUnpublish(selectedCharacter)"
            >
              从市场下架
            </el-button>

            <el-button
              :icon="Download"
              @click="handleExport(selectedCharacter)"
            >
              导出
            </el-button>

            <el-button
              type="danger"
              :icon="Delete"
              @click="handleDelete(selectedCharacter)"
            >
              删除
            </el-button>
          </div>
        </div>

        <!-- Edit mode -->
        <div v-else class="character-edit glass-card">
          <div class="edit-header">
            <h2>{{ selectedCharacter ? '编辑角色' : '创建角色' }}</h2>
          </div>

          <div class="edit-form">
            <div class="form-item">
              <label>角色名称 *</label>
              <el-input
                v-model="editForm.name"
                placeholder="请输入角色名称"
                maxlength="50"
                show-word-limit
              />
            </div>

            <div class="form-item">
              <label>角色描述</label>
              <el-input
                v-model="editForm.description"
                type="textarea"
                :rows="4"
                placeholder="请输入角色描述"
                maxlength="500"
                show-word-limit
              />
            </div>

            <div class="form-item">
              <label>分类</label>
              <el-input
                v-model="editForm.category"
                placeholder="例如：助手、娱乐、教育等"
              />
            </div>

            <div class="form-item">
              <label>标签</label>
              <el-select
                v-model="editForm.tags"
                multiple
                filterable
                allow-create
                placeholder="添加标签（按回车创建）"
                style="width: 100%"
              >
                <el-option
                  v-for="tag in editForm.tags"
                  :key="tag"
                  :label="tag"
                  :value="tag"
                />
              </el-select>
            </div>

            <div class="form-item">
              <el-checkbox v-model="editForm.isNsfw">
                标记为 NSFW（成人内容）
              </el-checkbox>
            </div>
          </div>

          <div class="edit-actions">
            <el-button
              type="success"
              :icon="Check"
              @click="handleSaveEdit"
            >
              保存
            </el-button>
            <el-button
              :icon="Close"
              @click="handleCancelEdit"
            >
              取消
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Publish Dialog -->
    <CharacterPublishForm
      v-if="selectedCharacter && publishDialogVisible"
      :visible="publishDialogVisible"
      :character="selectedCharacter"
      @close="publishDialogVisible = false"
      @success="handlePublishSuccess"
    />
  </div>
</template>

<style scoped>
.my-characters-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  min-height: calc(100vh - 120px);
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-actions {
  display: flex;
  gap: 12px;
}

/* Two-column layout */
.two-column-layout {
  display: grid;
  grid-template-columns: 35% 65%;
  gap: 24px;
  height: calc(100vh - 200px);
  min-height: 600px;
}

/* Left column - Character list */
.left-column {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.column-header {
  margin-bottom: 16px;
}

.character-tabs {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.character-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
}

.character-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Glassmorphism card */
.glass-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.dark .glass-card {
  background: rgba(30, 30, 30, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Character list item */
.character-list-item {
  display: flex;
  gap: 12px;
  padding: 16px;
  cursor: pointer;
  position: relative;
}

.character-list-item:hover {
  transform: translateY(-2px);
  border-color: rgba(102, 126, 234, 0.5);
  box-shadow: 0 12px 40px rgba(102, 126, 234, 0.2);
}

.character-list-item.selected {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
  box-shadow: 0 12px 40px rgba(102, 126, 234, 0.3);
}

.character-list-item.selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px 0 0 16px;
}

.character-avatar {
  flex-shrink: 0;
}

.character-info {
  flex: 1;
  min-width: 0;
}

.character-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color-primary);
}

.character-desc {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin: 0 0 8px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.character-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

/* Right column - Detail/Edit */
.right-column {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.mobile-back-button {
  display: none;
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
}

/* Empty state */
.empty-state {
  padding: 60px 20px;
}

.empty-detail {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 60px;
}

.empty-content {
  text-align: center;
  max-width: 400px;
}

.empty-icon {
  width: 120px;
  height: 120px;
  margin: 0 auto 24px;
  color: var(--text-color-secondary);
  opacity: 0.3;
}

.empty-content h3 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--text-color-primary);
}

.empty-content p {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin: 0;
}

/* Character detail view */
.character-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 32px;
  overflow-y: auto;
}

.detail-header {
  display: flex;
  gap: 20px;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.dark .detail-header {
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

.detail-header-info {
  flex: 1;
}

.detail-header-info h2 {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 12px 0;
  color: var(--text-color-primary);
}

.detail-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px 0;
}

.detail-section p {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-color-regular);
  margin: 0;
}

.tags-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  background: rgba(102, 126, 234, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(102, 126, 234, 0.1);
}

.stat-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #667eea;
}

.detail-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  margin-top: 24px;
}

.dark .detail-actions {
  border-top-color: rgba(255, 255, 255, 0.1);
}

/* Character edit form */
.character-edit {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 32px;
  overflow-y: auto;
}

.edit-header {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.dark .edit-header {
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

.edit-header h2 {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  color: var(--text-color-primary);
}

.edit-form {
  flex: 1;
  overflow-y: auto;
}

.form-item {
  margin-bottom: 24px;
}

.form-item label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-regular);
  margin-bottom: 8px;
}

.edit-actions {
  display: flex;
  gap: 12px;
  padding-top: 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  margin-top: 24px;
}

.dark .edit-actions {
  border-top-color: rgba(255, 255, 255, 0.1);
}

/* Mobile responsive */
@media (max-width: 768px) {
  .my-characters-container {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    margin-bottom: 16px;
  }

  .page-header h1 {
    font-size: 24px;
  }

  .header-actions {
    justify-content: stretch;
  }

  .header-actions .el-button {
    flex: 1;
  }

  /* Mobile: Stack columns */
  .two-column-layout {
    grid-template-columns: 1fr;
    height: auto;
    min-height: calc(100vh - 180px);
  }

  .left-column {
    display: block;
  }

  .left-column.mobile-hidden {
    display: none;
  }

  .right-column {
    display: none;
  }

  .right-column.mobile-visible {
    display: flex;
  }

  .mobile-back-button {
    display: block;
  }

  .character-detail,
  .character-edit {
    padding: 60px 20px 20px;
  }

  .detail-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .detail-actions,
  .edit-actions {
    flex-direction: column;
  }

  .detail-actions .el-button,
  .edit-actions .el-button {
    width: 100%;
  }
}

/* Scrollbar styling */
.character-list-scroll::-webkit-scrollbar,
.detail-content::-webkit-scrollbar,
.edit-form::-webkit-scrollbar {
  width: 6px;
}

.character-list-scroll::-webkit-scrollbar-track,
.detail-content::-webkit-scrollbar-track,
.edit-form::-webkit-scrollbar-track {
  background: transparent;
}

.character-list-scroll::-webkit-scrollbar-thumb,
.detail-content::-webkit-scrollbar-thumb,
.edit-form::-webkit-scrollbar-thumb {
  background: rgba(102, 126, 234, 0.3);
  border-radius: 3px;
}

.character-list-scroll::-webkit-scrollbar-thumb:hover,
.detail-content::-webkit-scrollbar-thumb:hover,
.edit-form::-webkit-scrollbar-thumb:hover {
  background: rgba(102, 126, 234, 0.5);
}
</style>
