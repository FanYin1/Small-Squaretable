<template>
  <section class="memory-status" aria-label="自动记忆整理" :aria-busy="loading || loadingMore">
    <header><h3>自动记忆整理</h3><button type="button" :disabled="loading || loadingMore" @click="refresh">{{ loading ? '读取中…' : '刷新进度' }}</button></header>
    <p v-if="error" role="alert">{{ error }}<span v-if="memory"> 下方保留上次读取的记录。</span></p>
    <p v-if="!memory && loading" role="status">正在读取此次故事的整理记录。</p>
    <template v-if="memory">
      <p v-if="!memory.supported">此旧存档尚未接入自动整理进度。原文和手记仍可查看。</p>
      <template v-else>
        <p class="memory-muted">正文和手记独立保存。这里可以查看整理进度，回到当时的原文。</p>
        <dl class="memory-counts"><div v-for="item in totals" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.count }} 批</dd></div></dl>
        <p v-if="memory.counts.failed" role="status">有整理未完成，可继续游玩；原文没有丢失。请联系管理员检查，刷新进度不会重新生成剧情。</p>
        <details class="memory-help"><summary>这些进度代表什么</summary><p class="memory-muted">自动整理供后续对话参考，不代表每条经历都会被记住，也不会直接修改状态。</p><p class="memory-muted">进度为本次读取结果；每位角色累计 {{ memory.batchSize }} 次完整回应后开始一批整理，停止的片段不参与。旧历史不会自动补齐。</p></details>
        <p v-for="item in memory.accumulating" :key="item.characterId">{{ item.characterName || '故事角色' }}：已累计 {{ item.turns }} / {{ memory.batchSize }} 次完整回应。</p>
        <p v-if="!memory.jobs.length" class="memory-muted">还没有本批次的整理记录。你可以先在下方记下重要约定。</p>
        <ol class="memory-jobs">
          <li v-for="job in memory.jobs" :key="job.id">
            <div class="memory-job-title"><strong>{{ job.characterName || '故事角色' }}</strong><span>{{ job.recoveryPending ? '等待恢复整理' : labels[job.status] }}</span></div>
            <p v-if="job.status === 'succeeded' && job.sourcesAvailable">当前保留 {{ job.retainedMemories }} 条辅助记忆；整理完成不保证涵盖全部经历。</p>
            <p v-if="!job.sourcesAvailable">本批原文依据暂不可核对，不展示未经确认的来源。</p>
            <details v-else><summary>查看本批依据（{{ job.sources.length }}轮）</summary><ul class="memory-sources"><li v-for="source in job.sources" :key="source.messageId"><span>第 {{ source.version }} 轮</span><button type="button" @click="$emit('source', source.inputMessageId)">阅读输入</button><button type="button" @click="$emit('source', source.messageId)">阅读回应</button></li></ul></details>
          </li>
        </ol>
        <button v-if="memory.nextBefore" type="button" :disabled="loading || loadingMore" @click="loadMore">{{ loadingMore ? '读取中…' : '更早的整理记录' }}</button>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useUserStore } from '../../stores/user';
import { useStoryMemory } from '../../composables/useStoryMemory';
const props = defineProps<{ chatId: string; busy: boolean; version: number }>();
defineEmits<{ source: [messageId: number] }>();
const userStore = useUserStore();
const { memory, loading, loadingMore, error, refresh, loadMore } = useStoryMemory(
  () => userStore.user ? JSON.stringify([userStore.user.tenantId, userStore.user.id]) : null,
  () => props.chatId, () => props.busy, () => props.version);
const labels = { pending: '等待整理', running: '正在整理', retry: '等待重试', failed: '整理未完成', succeeded: '已整理' };
const totals = computed(() => memory.value ? [
  { label: '已整理', count: memory.value.counts.succeeded },
  { label: '等待或进行中', count: memory.value.counts.pending + memory.value.counts.running + memory.value.counts.retry },
  { label: '未完成', count: memory.value.counts.failed },
] : []);
</script>

<style scoped lang="scss">
.memory-status { padding-bottom: 22px; margin-bottom: 22px; border-bottom: 1px solid var(--border-default); }
header, .memory-job-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
h3 { margin: 0; font-size: 15px; }
p, li { font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
.memory-muted, dt, .memory-job-title span { color: var(--text-secondary); font-size: 12px; }
.memory-counts { display: flex; flex-wrap: wrap; gap: 12px; }
dd { margin: 4px 0 0; font-size: 18px; }
button { min-height: 40px; padding: 7px 9px; border: 1px solid var(--border-default); border-radius: 5px; background: transparent; color: var(--accent-text); cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.memory-jobs, .memory-sources { list-style: none; padding: 0; }
.memory-jobs>li { margin: 12px 0; padding: 12px; border: 1px solid var(--border-default); border-radius: 8px; }
.memory-sources li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
.memory-sources span { width: 100%; }
summary { cursor: pointer; padding: 10px 0; min-height: 24px; }
</style>
