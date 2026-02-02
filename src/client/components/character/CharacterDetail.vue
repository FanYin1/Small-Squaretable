<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChatDotRound, Star, Download, Upload } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useCharacterStore } from '@client/stores';
import { useUserStore } from '@client/stores/user';
import RatingComponent from '@client/components/rating/RatingComponent.vue';
import { api } from '@client/services/api';
import { downloadCharacterJson } from '@client/utils/sillytavern';
import type { RatingInput } from '@/types/rating';

const props = defineProps<{
  visible: boolean;
  characterId: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const router = useRouter();
const characterStore = useCharacterStore();
const authStore = useUserStore();

const character = computed(() => characterStore.currentCharacter);
const isAuthenticated = computed(() => authStore.isAuthenticated);

// Rating state
const ratings = ref<any>(null);
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
  await fetchRatings();
});

async function fetchRatings() {
  try {
    const response = await api.get(`/characters/${props.characterId}/ratings`);
    ratings.value = response;
    if (response.userRating) {
      userRating.value = response.userRating;
    }
  } catch (error) {
    console.error('Failed to fetch ratings:', error);
  }
}

function handleStartChat() {
  if (character.value) {
    router.push(`/chat?characterId=${character.value.id}`);
    emit('close');
  }
}

async function handleImport() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }

  if (!character.value) return;

  importing.value = true;
  try {
    await api.post(`/characters/${character.value.id}/fork`);
    ElMessage.success('角色已导入到我的角色');
  } catch (error: any) {
    ElMessage.error(error.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

function handleExport() {
  if (!character.value) return;
  downloadCharacterJson(character.value);
  ElMessage.success('角色已导出');
}

function handleRateClick() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
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
    ElMessage.warning('请为所有维度评分');
    return;
  }

  submittingRating.value = true;
  try {
    await api.post(`/characters/${character.value.id}/ratings`, userRating.value);
    ElMessage.success('评分已提交');
    showRatingDialog.value = false;
    await fetchRatings();
  } catch (error: any) {
    ElMessage.error(error.message || '提交失败');
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
    title="角色详情"
    size="600px"
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
          {{ ratings?.userRating ? '修改评分' : '评分' }}
        </el-button>
      </div>

      <el-divider />

      <div class="detail-section">
        <h3>描述</h3>
        <p>{{ character.description || '暂无描述' }}</p>
      </div>

      <div v-if="character.tags && character.tags.length" class="detail-section">
        <h3>标签</h3>
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
        <h3>评分详情</h3>
        <div class="rating-dimensions">
          <div class="dimension-item">
            <span class="dimension-label">质量</span>
            <RatingComponent
              :model-value="parseFloat(ratings.dimensions.quality || '0')"
              readonly
              show-score
              size="small"
            />
          </div>
          <div class="dimension-item">
            <span class="dimension-label">创意</span>
            <RatingComponent
              :model-value="parseFloat(ratings.dimensions.creativity || '0')"
              readonly
              show-score
              size="small"
            />
          </div>
          <div class="dimension-item">
            <span class="dimension-label">互动性</span>
            <RatingComponent
              :model-value="parseFloat(ratings.dimensions.interactivity || '0')"
              readonly
              show-score
              size="small"
            />
          </div>
          <div class="dimension-item">
            <span class="dimension-label">准确性</span>
            <RatingComponent
              :model-value="parseFloat(ratings.dimensions.accuracy || '0')"
              readonly
              show-score
              size="small"
            />
          </div>
          <div class="dimension-item">
            <span class="dimension-label">娱乐性</span>
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
        <h3>统计信息</h3>
        <div class="stats">
          <div class="stat-item">
            <span class="stat-label">下载次数</span>
            <span class="stat-value">{{ character.downloadCount || 0 }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">浏览次数</span>
            <span class="stat-value">{{ character.viewCount || 0 }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">创建时间</span>
            <span class="stat-value">{{ new Date(character.createdAt).toLocaleDateString('zh-CN') }}</span>
          </div>
        </div>
      </div>

      <div class="action-section">
        <el-button
          type="primary"
          size="large"
          :icon="ChatDotRound"
          @click="handleStartChat"
        >
          开始聊天
        </el-button>
        <el-button
          size="large"
          :icon="Download"
          :loading="importing"
          @click="handleImport"
        >
          导入到我的角色
        </el-button>
        <el-button
          size="large"
          :icon="Upload"
          @click="handleExport"
        >
          导出 JSON
        </el-button>
      </div>
    </div>

    <div v-else v-loading="characterStore.loading" class="loading-container" />

    <!-- Rating Dialog -->
    <el-dialog
      v-model="showRatingDialog"
      title="评分"
      width="500px"
    >
      <div class="rating-form">
        <div class="rating-item">
          <label>质量</label>
          <RatingComponent
            v-model="userRating.quality"
            :max="5"
          />
        </div>
        <div class="rating-item">
          <label>创意</label>
          <RatingComponent
            v-model="userRating.creativity"
            :max="5"
          />
        </div>
        <div class="rating-item">
          <label>互动性</label>
          <RatingComponent
            v-model="userRating.interactivity"
            :max="5"
          />
        </div>
        <div class="rating-item">
          <label>准确性</label>
          <RatingComponent
            v-model="userRating.accuracy"
            :max="5"
          />
        </div>
        <div class="rating-item">
          <label>娱乐性</label>
          <RatingComponent
            v-model="userRating.entertainment"
            :max="5"
          />
        </div>
      </div>

      <template #footer>
        <el-button @click="showRatingDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submittingRating"
          @click="handleSubmitRating"
        >
          提交
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
  color: var(--el-text-color-regular);
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
  color: var(--el-text-color-regular);
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
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.stat-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
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
