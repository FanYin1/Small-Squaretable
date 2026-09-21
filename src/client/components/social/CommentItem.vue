<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { socialApi } from '@client/services/social.api';
import { useUserStore } from '@client/stores/user';
import { useDateTime } from '@client/composables/useDateTime';
import { createLogger } from '@client/utils/logger';
import ReportDialog from '@client/components/moderation/ReportDialog.vue';
import type { CommentWithAuthor } from '@/types/social';

const logger = createLogger('CommentItem');

const props = defineProps<{
  comment: CommentWithAuthor;
  characterId: string;
}>();

const emit = defineEmits<{
  deleted: [commentId: string];
  updated: [comment: CommentWithAuthor];
  replied: [comment: CommentWithAuthor];
}>();

const { t } = useI18n();
const userStore = useUserStore();
const { formatRelativeTime } = useDateTime();

const isOwnComment = computed(() => userStore.user?.id === props.comment.author.id);

// 举报入口：自己的评论不给举报按钮
const showReportDialog = ref(false);

function openReportDialog() {
  if (!userStore.isAuthenticated) {
    ElMessage.warning(t('report.loginRequired'));
    return;
  }
  showReportDialog.value = true;
}

// Edit state
const isEditing = ref(false);
const editContent = ref('');
const editLoading = ref(false);

// Reply state
const showReplyInput = ref(false);
const replyContent = ref('');
const replyLoading = ref(false);

// Replies state
const replies = ref<CommentWithAuthor[]>([]);
const showReplies = ref(false);
const repliesLoading = ref(false);
const repliesOffset = ref(0);
const hasMoreReplies = ref(false);
const REPLIES_LIMIT = 10;

const avatarUrl = computed(() =>
  props.comment.author.avatarUrl ||
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${props.comment.author.id}`
);

const displayName = computed(() =>
  props.comment.author.displayName || 'Anonymous'
);

// --- Edit ---
function startEdit() {
  editContent.value = props.comment.content;
  isEditing.value = true;
}

function cancelEdit() {
  isEditing.value = false;
  editContent.value = '';
}

async function saveEdit() {
  if (!editContent.value.trim()) return;
  editLoading.value = true;
  try {
    const updated = await socialApi.updateComment(props.comment.id, editContent.value.trim());
    isEditing.value = false;
    emit('updated', updated);
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('common.retry'));
    logger.error('Failed to update comment', error);
  } finally {
    editLoading.value = false;
  }
}

// --- Delete ---
async function handleDelete() {
  try {
    await ElMessageBox.confirm(
      t('social.delete') + '?',
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    );
    await socialApi.deleteComment(props.comment.id);
    emit('deleted', props.comment.id);
  } catch (error: unknown) {
    if (error === 'cancel') return;
    ElMessage.error(error instanceof Error ? error.message : t('common.retry'));
    logger.error('Failed to delete comment', error);
  }
}

// --- Reply ---
function toggleReplyInput() {
  showReplyInput.value = !showReplyInput.value;
  if (showReplyInput.value) {
    replyContent.value = '';
  }
}

async function submitReply() {
  if (!replyContent.value.trim()) return;
  replyLoading.value = true;
  try {
    const newReply = await socialApi.createComment(
      props.characterId,
      replyContent.value.trim(),
      props.comment.id
    );
    replyContent.value = '';
    showReplyInput.value = false;
    replies.value.unshift(newReply);
    if (!showReplies.value) showReplies.value = true;
    emit('replied', newReply);
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('common.retry'));
    logger.error('Failed to submit reply', error);
  } finally {
    replyLoading.value = false;
  }
}
// --- Load replies ---
async function loadReplies() {
  repliesLoading.value = true;
  try {
    const data = await socialApi.getReplies(props.comment.id, REPLIES_LIMIT, repliesOffset.value);
    if (repliesOffset.value === 0) {
      replies.value = data;
    } else {
      replies.value.push(...data);
    }
    hasMoreReplies.value = data.length === REPLIES_LIMIT;
    repliesOffset.value += data.length;
    showReplies.value = true;
  } catch (error: unknown) {
    logger.error('Failed to load replies', error);
  } finally {
    repliesLoading.value = false;
  }
}

function toggleReplies() {
  if (showReplies.value) {
    showReplies.value = false;
  } else {
    if (replies.value.length === 0) {
      loadReplies();
    } else {
      showReplies.value = true;
    }
  }
}

function handleReplyDeleted(commentId: string) {
  replies.value = replies.value.filter(r => r.id !== commentId);
}

function handleReplyUpdated(updated: CommentWithAuthor) {
  const idx = replies.value.findIndex(r => r.id === updated.id);
  if (idx !== -1) {
    replies.value[idx] = updated;
  }
}
</script>

<template>
  <div class="comment-item">
    <div class="comment-main">
      <el-avatar :size="36" :src="avatarUrl" class="comment-avatar" />
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author">{{ displayName }}</span>
          <span class="comment-time">{{ formatRelativeTime(comment.createdAt) }}</span>
        </div>

        <!-- Edit mode -->
        <div v-if="isEditing" class="comment-edit">
          <el-input
            v-model="editContent"
            type="textarea"
            :rows="2"
            :maxlength="2000"
          />
          <div class="edit-actions">
            <el-button size="small" @click="cancelEdit">{{ t('common.cancel') }}</el-button>
            <el-button size="small" type="primary" :loading="editLoading" @click="saveEdit">
              {{ t('common.save') }}
            </el-button>
          </div>
        </div>

        <!-- Display mode -->
        <div v-else class="comment-content">
          <p v-if="comment.isDeleted" class="deleted-comment">[{{ t('social.delete') }}]</p>
          <p v-else>{{ comment.content }}</p>
        </div>

        <!-- Actions -->
        <div v-if="!comment.isDeleted" class="comment-actions">
          <el-button text size="small" @click="toggleReplyInput">
            {{ t('social.reply') }}
          </el-button>
          <template v-if="isOwnComment">
            <el-button text size="small" @click="startEdit">
              {{ t('social.edit') }}
            </el-button>
            <el-button text size="small" type="danger" @click="handleDelete">
              {{ t('social.delete') }}
            </el-button>
          </template>
          <el-button v-else text size="small" class="report-action" @click="openReportDialog">
            {{ t('report.reportComment') }}
          </el-button>
        </div>

        <!-- Reply input -->
        <div v-if="showReplyInput" class="reply-input">
          <el-input
            v-model="replyContent"
            type="textarea"
            :rows="2"
            :placeholder="t('social.writeComment')"
            :maxlength="2000"
          />
          <div class="reply-input-actions">
            <el-button size="small" @click="toggleReplyInput">{{ t('common.cancel') }}</el-button>
            <el-button
              size="small"
              type="primary"
              :loading="replyLoading"
              :disabled="!replyContent.trim()"
              @click="submitReply"
            >
              {{ t('social.send') }}
            </el-button>
          </div>
        </div>

        <!-- View replies toggle -->
        <div v-if="(comment.replyCount ?? 0) > 0 || replies.length > 0" class="replies-toggle">
          <el-button text size="small" :loading="repliesLoading" @click="toggleReplies">
            {{ showReplies ? t('common.close') : t('social.reply') + ` (${comment.replyCount ?? replies.length})` }}
          </el-button>
        </div>

        <ReportDialog
          v-model="showReportDialog"
          target-type="comment"
          :target-id="comment.id"
        />

        <!-- Nested replies -->
        <div v-if="showReplies && replies.length > 0" class="replies-list">
          <CommentItem
            v-for="reply in replies"
            :key="reply.id"
            :comment="reply"
            :character-id="characterId"
            @deleted="handleReplyDeleted"
            @updated="handleReplyUpdated"
            @replied="(r: CommentWithAuthor) => emit('replied', r)"
          />
          <el-button
            v-if="hasMoreReplies"
            text
            size="small"
            :loading="repliesLoading"
            class="load-more-replies"
            @click="loadReplies"
          >
            {{ t('social.loadMore') }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comment-item {
  padding: 12px 0;
}

.comment-main {
  display: flex;
  gap: 12px;
}

.comment-avatar {
  flex-shrink: 0;
}

.comment-body {
  flex: 1;
  min-width: 0;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.comment-author {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.comment-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.comment-content p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  word-break: break-word;
}

.deleted-comment {
  color: var(--text-secondary);
  font-style: italic;
}

.comment-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.report-action {
  color: var(--text-secondary);
}

.comment-edit {
  margin-top: 8px;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.reply-input {
  margin-top: 8px;
}

.reply-input-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.replies-toggle {
  margin-top: 4px;
}

.replies-list {
  margin-top: 8px;
  padding-left: 12px;
  border-left: 2px solid var(--border-default);
}

.load-more-replies {
  margin-top: 4px;
}
</style>
