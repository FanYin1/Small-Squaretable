<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="t('share.shareCharacter')"
    width="500px"
  >
    <div v-if="currentToken" class="share-link-container">
      <el-input :model-value="shareUrl" readonly>
        <template #append>
          <el-button @click="copyLink">{{ t('share.copyLink') }}</el-button>
        </template>
      </el-input>
      <el-button type="danger" plain @click="revokeLink" :loading="revoking" style="margin-top: 12px">
        {{ t('share.revokeLink') }}
      </el-button>
    </div>
    <div v-else class="share-generate">
      <p>{{ t('share.generateLinkDesc') || 'Generate a share link to let others view this character.' }}</p>
      <el-button type="primary" @click="generateLink" :loading="generating">
        {{ t('share.generateLink') }}
      </el-button>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { shareApi } from '@client/services/share.api';
import type { Character } from '@client/types';

interface Props {
  modelValue: boolean;
  character: Character;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  shared: [];
}>();

const { t } = useI18n();
const currentToken = ref(props.character.shareToken || '');
const generating = ref(false);
const revoking = ref(false);

const shareUrl = computed(() =>
  `${window.location.origin}/share/character/${currentToken.value}`
);

const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    ElMessage.success(t('share.linkCopied'));
  } catch {
    ElMessage.error('Failed to copy');
  }
};

const generateLink = async () => {
  generating.value = true;
  try {
    const res = await shareApi.generateShareLink(props.character.id);
    currentToken.value = res.shareToken;
    ElMessage.success(t('share.linkCopied'));
    emit('shared');
  } catch {
    ElMessage.error('Failed to generate link');
  } finally {
    generating.value = false;
  }
};

const revokeLink = async () => {
  revoking.value = true;
  try {
    await shareApi.revokeShareLink(props.character.id);
    currentToken.value = '';
    ElMessage.success(t('share.revokeLink'));
    emit('shared');
  } catch {
    ElMessage.error('Failed to revoke link');
  } finally {
    revoking.value = false;
  }
};
</script>

<style scoped>
.share-link-container {
  display: flex;
  flex-direction: column;
}

.share-generate {
  text-align: center;
  padding: 20px 0;
}

.share-generate p {
  margin: 0 0 16px;
  color: var(--text-secondary);
}
</style>
