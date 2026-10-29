<script setup lang="ts">
import { computed } from 'vue';
import type { PresentationVersion } from '../../../types/story-presentation';

const props = defineProps<{ presentation: PresentationVersion }>();
const sourceLabel = computed(() => props.presentation.draft.source?.reference.source === 'first_mes'
  ? '默认开场' : `备选开场 ${(props.presentation.draft.source?.reference.index ?? 0) + 1}`);
</script>

<template>
  <details v-if="presentation.draft.status === 'draft'" class="presentation-source" data-testid="presentation-source">
    <summary>来自{{ sourceLabel }}的场景摘录 <span>查看来源</span></summary>
    <p>这段介绍选自原有公开开场，保留原文。它描述一个场景，未概括全部设定与玩法。</p>
    <p v-if="presentation.draft.coverage.omittedCandidates">此次从 {{ presentation.draft.coverage.candidateCount }} 段候选中选择，另有 {{ presentation.draft.coverage.omittedCandidates }} 段未参与选择。</p>
    <p>保存新的介绍后优先展示你的内容；已有故事保留开始时的版本。</p>
  </details>
</template>

<style scoped>
.presentation-source { color:var(--text-secondary); font-size:12px; line-height:1.8; overflow-wrap:anywhere; }
summary { cursor:pointer; padding:10px 0; min-height:44px; box-sizing:border-box; }
summary span { color:var(--accent-text); margin-left:8px; }
summary:focus-visible { outline:2px solid var(--accent-text); outline-offset:2px; }
p { margin:0 0 8px; }
</style>
