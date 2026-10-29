<template>
  <section class="intent-review" aria-label="核对这次行动">
    <h2>{{ candidate.intent.disposition === 'clarification' ? '先确认你的意思' : candidate.intent.disposition === 'proposal' ? '你想这样行动吗？' : '这轮留下的信息' }}</h2>
    <p v-if="candidate.intent.question">{{ candidate.intent.question }}</p>
    <ul v-if="candidate.intent.steps.length"><li v-for="(step, index) in candidate.intent.steps" :key="index">{{ stepLabel(step) }}</li></ul>
    <ul v-if="candidate.intent.facts.length"><li v-for="(fact, index) in candidate.intent.facts" :key="index"><span>{{ labels[fact.kind] }} · {{ fact.speaker === 'player' ? '你的表达' : '人物的表达' }}</span> {{ fact.content }}</li></ul>
    <template v-if="candidate.intent.disposition === 'proposal'">
      <p>候选尚未执行。理解有误时，直接补充说明即可。</p>
      <button type="button" :disabled="busy || stale" @click="$emit('confirm')">确认并继续</button>
      <p v-if="stale" role="status">故事已有新进展，请重新描述行动。</p>
      <details><summary>确认会发生什么</summary><p>继续这次行动，按通常生成计费。数值只能按卡片规则变更；自由探索不能凭推测增加资产。</p></details>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { StoredStoryIntent, StoryIntent } from '../../../types/story-intent';
const props = defineProps<{ candidate: StoredStoryIntent; busy: boolean; stale: boolean; actions: Array<{ id: string; label: string }> }>();
defineEmits<{ confirm: [] }>();
const labels = { claim: '主张 · 未证实', intention: '意向 · 非执行凭据', inference: '推测', observation: '叙事见闻', style: '表达偏好' };
function stepLabel(step: StoryIntent['steps'][number]) {
  if (step.kind === 'execute') return `执行：${props.actions.find(action => action.id === step.actionId)?.label ?? '原候选行动（已不可用）'}`;
  return `${step.kind === 'refuse' ? '拒绝' : '自由探索'}：${step.description}`;
}
</script>

<style scoped>
.intent-review { max-width: 760px; margin: 0 auto 14px; padding: 12px 16px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--bg-subtle); font-size: 13px; line-height: 1.6; }
h2 { margin: 0; font-size: 15px; color: var(--text-primary); }
p { margin: 8px 0 0; color: var(--text-secondary); }
ul { padding-left: 20px; margin: 8px 0; }
span { color: var(--text-secondary); }
button { min-height: 40px; padding: 8px 14px; background: var(--accent); color: var(--accent-on); border: 0; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
</style>
