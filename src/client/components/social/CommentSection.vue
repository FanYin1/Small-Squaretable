<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { socialApi } from '@client/services/social.api';
import { useUserStore } from '@client/stores/user';
import { createLogger } from '@client/utils/logger';
import CommentItem from './CommentItem.vue';
import type { CommentWithAuthor } from '@/types/social';

const logger = createLogger('CommentSection');

const props = defineProps<{
  characterId: string;
}>();

const { t } = useI18n();
const userStore = useUserStore();

const comments = ref<CommentWithAuthor[]>([]);
const loading = ref(false);
const newComment = ref('');
const submitting = ref(false);
const sort = ref<'newest' | 'oldest'>('newest');
const offset = ref(0);
const hasMore = ref(false);
const LIMIT = 20;

async function fetchComments(reset = false) {
  if (reset) {
    offset.value = 0;
    comments.value = [];
  }
  loading.value = true;
  try {
    const data = await socialApi.getComments(props.characterId, {
      limit: LIMIT,
      offset: offset.value,
      sort: sort.value,
    });
    if (offset.value === 0) {
      comments.value = data;
    } else {
      comments.value.push(...data);
    }
    hasMore.value = data.length === LIMIT;
    offset.value += data.length;
  } catch (error: unknown) {
    logger.error('Failed to fetch comments', error);
  } finally {
    loading.value = false;
  }
}
onMounted(() => fetchComments());

watch(() => props.characterId, () => fetchComments(true));

watch(sort, () => fetchComments(true));

async function submitComment() {
  if (!newComment.value.trim()) return;
  if (!userStore.isAuthenticated) {
    ElMessage.warning(t('characterDetail.loginRequired'));
    return;
  }
  submitting.value = true;
  try {
    const created = await socialApi.createComment(props.characterId, newComment.value.trim());
    newComment.value = '';
    // Prepend to list if sorting by newest, append if oldest
    if (sort.value === 'newest') {
      comments.value.unshift(created);
    } else {
      comments.value.push(created);
    }
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('common.retry'));
    logger.error('Failed to create comment', error);
  } finally {
    submitting.value = false;
  }
}

function loadMore() {
  fetchComments(false);
}

function handleDeleted(commentId: string) {
  comments.value = comments.value.filter(c => c.id !== commentId);
}

function handleUpdated(updated: CommentWithAuthor) {
  const idx = comments.value.findIndex(c => c.id === updated.id);
  if (idx !== -1) {
    comments.value[idx] = updated;
  }
}
</script>

<template>
  <div class="comment-section">
    <div class="comment-section-header">
      <h3>{{ t('social.comments') }}</h3>
      <el-radio-group v-model="sort" size="small">
        <el-radio-button value="newest">{{ t('social.sortNewest') }}</el-radio-button>
        <el-radio-button value="oldest">{{ t('social.sortOldest') }}</el-radio-button>
      </el-radio-group>
    </div>

    <!-- Comment input -->
    <div v-if="userStore.isAuthenticated" class="comment-input-area">
      <el-input
        v-model="newComment"
        type="textarea"
        :rows="3"
        :placeholder="t('social.writeComment')"
        :maxlength="2000"
        show-word-limit
      />
      <div class="comment-input-actions">
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!newComment.trim()"
          @click="submitComment"
        >
          {{ t('social.send') }}
        </el-button>
      </div>
    </div>

    <!-- Comment list -->
    <div v-loading="loading && comments.length === 0" class="comment-list">
      <template v-if="comments.length > 0">
        <CommentItem
          v-for="comment in comments"
          :key="comment.id"
          :comment="comment"
          :character-id="characterId"
          @deleted="handleDeleted"
          @updated="handleUpdated"
        />
      </template>
      <div v-else-if="!loading" class="no-comments">
        <p>{{ t('social.noComments') }}</p>
      </div>
    </div>

    <!-- Load more -->
    <div v-if="hasMore" class="load-more">
      <el-button text :loading="loading" @click="loadMore">
        {{ t('social.loadMore') }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.comment-section {
  margin-top: 8px;
}

.comment-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.comment-section-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.comment-input-area {
  margin-bottom: 16px;
}

.comment-input-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.comment-list {
  min-height: 60px;
}

.no-comments {
  text-align: center;
  padding: 24px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.no-comments p {
  margin: 0;
}

.load-more {
  text-align: center;
  padding: 8px 0;
}
</style>
