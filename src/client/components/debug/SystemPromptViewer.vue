<!-- src/client/components/debug/SystemPromptViewer.vue -->
<template>
  <div class="system-prompt-viewer">
    <div class="prompt-header">
      <span class="prompt-title">系统提示预览</span>
      <el-button size="small" @click="copyPrompt" :icon="CopyDocument">复制</el-button>
    </div>

    <div v-if="loading" class="prompt-loading">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="promptData" class="prompt-content">
      <!-- Token Summary -->
      <div class="token-summary">
        <el-tag type="info">总计: {{ promptData.tokenCount.total }} tokens</el-tag>
      </div>

      <!-- Sections -->
      <el-collapse v-model="activeSections">
        <el-collapse-item title="角色基础" name="character">
          <template #title>
            <span>角色基础</span>
            <el-tag size="small" type="primary" class="section-token">
              {{ promptData.tokenCount.characterBase }} tokens
            </el-tag>
          </template>
          <pre class="prompt-text">{{ promptData.sections.characterBase }}</pre>
        </el-collapse-item>

        <el-collapse-item v-if="promptData.sections.memories" title="记忆" name="memories">
          <template #title>
            <span>记忆</span>
            <el-tag size="small" type="success" class="section-token">
              {{ promptData.tokenCount.memories }} tokens
            </el-tag>
          </template>
          <pre class="prompt-text">{{ promptData.sections.memories }}</pre>
        </el-collapse-item>

        <el-collapse-item v-if="promptData.sections.emotion" title="情感" name="emotion">
          <template #title>
            <span>情感状态</span>
            <el-tag size="small" type="warning" class="section-token">
              {{ promptData.tokenCount.emotion }} tokens
            </el-tag>
          </template>
          <pre class="prompt-text">{{ promptData.sections.emotion }}</pre>
        </el-collapse-item>

        <el-collapse-item title="行为指引" name="guidelines">
          <template #title>
            <span>行为指引</span>
            <el-tag size="small" type="info" class="section-token">
              {{ promptData.tokenCount.guidelines }} tokens
            </el-tag>
          </template>
          <pre class="prompt-text">{{ promptData.sections.guidelines }}</pre>
        </el-collapse-item>
      </el-collapse>

      <!-- Full Prompt (collapsed by default) -->
      <el-collapse class="full-prompt-collapse">
        <el-collapse-item title="完整提示">
          <pre class="prompt-text full-prompt">{{ promptData.fullPrompt }}</pre>
        </el-collapse-item>
      </el-collapse>
    </div>

    <div v-else class="prompt-empty">
      <el-empty description="暂无系统提示数据" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { CopyDocument } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { api } from '../../services/api';

interface SystemPromptData {
  fullPrompt: string;
  sections: {
    characterBase: string;
    memories: string | null;
    emotion: string | null;
    guidelines: string;
  };
  tokenCount: {
    total: number;
    characterBase: number;
    memories: number;
    emotion: number;
    guidelines: number;
  };
}

const props = defineProps<{
  chatId: string;
  characterId: string;
}>();

const loading = ref(false);
const promptData = ref<SystemPromptData | null>(null);
const activeSections = ref(['character', 'memories', 'emotion', 'guidelines']);

async function fetchPromptData() {
  if (!props.chatId || !props.characterId) return;

  loading.value = true;
  try {
    const response = await api.get<SystemPromptData>(
      `/characters/${props.characterId}/intelligence/system-prompt?chatId=${props.chatId}`
    );
    promptData.value = response;
  } catch (error) {
    console.error('Failed to fetch system prompt:', error);
  } finally {
    loading.value = false;
  }
}

function copyPrompt() {
  if (!promptData.value) return;
  navigator.clipboard.writeText(promptData.value.fullPrompt);
  ElMessage.success('已复制到剪贴板');
}

watch(() => [props.chatId, props.characterId], () => {
  fetchPromptData();
}, { immediate: true });

onMounted(() => {
  fetchPromptData();
});
</script>

<style scoped>
.system-prompt-viewer {
  padding: 12px;
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.prompt-title {
  font-weight: 600;
  font-size: 14px;
}

.token-summary {
  margin-bottom: 12px;
}

.section-token {
  margin-left: 8px;
}

.prompt-text {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.full-prompt {
  max-height: 400px;
  overflow-y: auto;
}

.full-prompt-collapse {
  margin-top: 12px;
}

.prompt-loading,
.prompt-empty {
  padding: 24px;
}

:deep(.el-collapse-item__header) {
  font-size: 13px;
}

:deep(.el-collapse-item__content) {
  padding-bottom: 12px;
}
</style>
