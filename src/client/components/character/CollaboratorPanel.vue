<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { collaboratorApi } from '@client/services/collaborator.api';
import type { CharacterCollaborator } from '@client/types';

const props = defineProps<{
  characterId: string;
  isOwner: boolean;
}>();

const { t } = useI18n();

const collaborators = ref<CharacterCollaborator[]>([]);
const loading = ref(false);
const showInviteDialog = ref(false);
const inviteUserId = ref('');
const inviteRole = ref<'editor' | 'viewer'>('viewer');

async function fetchCollaborators() {
  loading.value = true;
  try {
    collaborators.value = await collaboratorApi.listCollaborators(props.characterId);
  } catch {
    collaborators.value = [];
  } finally {
    loading.value = false;
  }
}

async function inviteCollaborator() {
  if (!inviteUserId.value.trim()) return;
  try {
    await collaboratorApi.inviteCollaborator(props.characterId, {
      userId: inviteUserId.value.trim(),
      role: inviteRole.value,
    });
    ElMessage.success(t('collaboration.collaboratorAdded'));
    showInviteDialog.value = false;
    inviteUserId.value = '';
    inviteRole.value = 'viewer';
    await fetchCollaborators();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to invite';
    ElMessage.error(msg);
  }
}

async function updateRole(userId: string, role: 'editor' | 'viewer') {
  try {
    await collaboratorApi.updateCollaboratorRole(props.characterId, userId, role);
    const collab = collaborators.value.find((c) => c.userId === userId);
    if (collab) collab.role = role;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update role';
    ElMessage.error(msg);
  }
}

async function removeCollab(userId: string) {
  try {
    await ElMessageBox.confirm(
      t('collaboration.removeCollaborator'),
      { confirmButtonText: t('common.confirm', 'Confirm'), cancelButtonText: t('common.cancel', 'Cancel'), type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await collaboratorApi.removeCollaborator(props.characterId, userId);
    ElMessage.success(t('collaboration.collaboratorRemoved'));
    collaborators.value = collaborators.value.filter((c) => c.userId !== userId);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to remove';
    ElMessage.error(msg);
  }
}

onMounted(fetchCollaborators);
</script>

<template>
  <el-card v-loading="loading" class="collaborator-panel">
    <template #header>
      <div class="panel-header">
        <span>{{ t('collaboration.collaborators') }}</span>
        <el-button v-if="isOwner" size="small" type="primary" @click="showInviteDialog = true">
          {{ t('collaboration.inviteCollaborator') }}
        </el-button>
      </div>
    </template>

    <div v-if="collaborators.length === 0" class="empty-state">
      <el-empty :description="t('collaboration.noCollaborators') || 'No collaborators yet'" :image-size="60" />
    </div>

    <div v-for="collab in collaborators" :key="collab.id" class="collaborator-item">
      <el-avatar :src="collab.userAvatar" :size="32">{{ (collab.userName || '?')[0] }}</el-avatar>
      <span class="collab-name">{{ collab.userName || collab.userId }}</span>
      <el-select
        v-if="isOwner"
        :model-value="collab.role"
        size="small"
        style="width: 110px"
        @change="updateRole(collab.userId, $event as 'editor' | 'viewer')"
      >
        <el-option value="editor" :label="t('collaboration.roleEditor')" />
        <el-option value="viewer" :label="t('collaboration.roleViewer')" />
      </el-select>
      <el-tag v-else :type="collab.role === 'editor' ? 'success' : 'info'" size="small">
        {{ collab.role === 'editor' ? t('collaboration.roleEditor') : t('collaboration.roleViewer') }}
      </el-tag>
      <el-button v-if="isOwner" type="danger" size="small" text @click="removeCollab(collab.userId)">
        {{ t('collaboration.removeCollaborator') }}
      </el-button>
    </div>

    <!-- Invite dialog -->
    <el-dialog v-model="showInviteDialog" :title="t('collaboration.inviteCollaborator')" width="400px">
      <el-form>
        <el-form-item :label="t('collaboration.searchUsers')">
          <el-input v-model="inviteUserId" placeholder="User ID or email" />
        </el-form-item>
        <el-form-item label="Role">
          <el-select v-model="inviteRole">
            <el-option value="editor" :label="t('collaboration.roleEditor')" />
            <el-option value="viewer" :label="t('collaboration.roleViewer')" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showInviteDialog = false">{{ t('common.cancel') || 'Cancel' }}</el-button>
        <el-button type="primary" @click="inviteCollaborator">{{ t('collaboration.inviteCollaborator') }}</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped>
.collaborator-panel {
  margin-top: 24px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.collaborator-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-default, #ebeef5);
}

.collaborator-item:last-child {
  border-bottom: none;
}

.collab-name {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary, #303133);
}

.empty-state {
  padding: 12px 0;
}
</style>
