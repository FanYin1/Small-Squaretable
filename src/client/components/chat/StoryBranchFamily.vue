<template>
  <details v-if="family.length" class="story-branch-family" open>
    <summary>同一次开始 · {{ family.length }} 份存档</summary>
    <ul><li v-for="item in family" :key="item.id"><button type="button" :aria-current="item.id === chatId ? 'page' : undefined" @click="$emit('select', item.id)">
      <strong>{{ item.title || '未命名故事' }}</strong>
      <span>{{ item.id === chatId ? '当前 · ' : '' }}{{ item.branch ? `事件 ${item.branch.throughVersion} 后分叉` : '原始开始' }}</span>
    </button></li></ul>
  </details>
  <p v-if="error" role="status">分支列表读取失败。<button type="button" @click="load">重试</button></p>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { storyApi } from '@client/services/story.api';
import type { StoryBranchInfo } from '../../../types/story-corrections';
const props = defineProps<{ chatId: string | null; ownerId?: string }>();
defineEmits<{ select: [string] }>();
const family = ref<Array<{ id: string; title: string | null; branch: StoryBranchInfo | null }>>([]);
const error = ref(false);
let ticket = 0;
onBeforeUnmount(() => { ticket++; });
async function load() {
  const current = ++ticket; family.value = []; error.value = false;
  if (!props.chatId || !props.ownerId) return;
  try {
    const response = await storyApi.branches(props.chatId);
    if (current === ticket) family.value = response;
  } catch { if (current === ticket) error.value = true; }
}
watch(() => [props.chatId, props.ownerId], load, { immediate: true });
</script>

<style scoped>
.story-branch-family { margin: 12px; border: 1px solid var(--el-border-color); border-radius: 12px; padding: 10px; color: var(--el-text-color-primary); }
summary { cursor: pointer; font-size: 12px; }
ul { list-style: none; padding: 0; margin: 8px 0 0; }
button { width: 100%; display: grid; gap: 4px; padding: 9px; text-align: left; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
button[aria-current] { background: var(--el-fill-color); }
span { font-size: 11px; color: var(--el-text-color-secondary); }
strong { font-size: 13px; overflow-wrap: anywhere; }
</style>
