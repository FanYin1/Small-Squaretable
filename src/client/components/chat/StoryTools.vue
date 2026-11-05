<script setup lang="ts">
import { useId } from 'vue';
import { useI18n } from 'vue-i18n';
defineProps<{ frozen: boolean; group: boolean; hasCharacter: boolean; busy: boolean }>();
defineEmits<{ select: [command: string] }>();
const { t } = useI18n();
const headingId = useId();
</script>
<template>
  <div class="story-tools">
    <section :aria-labelledby="headingId">
      <h3 :id="headingId">查看此次游玩</h3>
      <div class="tool-links">
        <button type="button" @click="$emit('select', 'memory')"><strong>{{ t('chat.memory') }}</strong><small>{{ frozen ? '查看本次故事记忆及其来源' : '查看此会话的记忆' }}</small></button>
        <button type="button" @click="$emit('select', 'pinned')"><strong>{{ t('chat.pinnedMessages') }}</strong><small>回到标记过的重要消息</small></button>
        <button type="button" @click="$emit('select', 'search')"><strong>{{ t('chat.searchMessages') }}</strong><small>在保存的对话中查找</small></button>
      </div>
    </section>
    <details>
      <summary>诊断与兼容</summary>
      <p>本轮上下文诊断只读取请求记录，不会继续剧情或重新调用模型。</p>
      <button v-if="!group" type="button" @click="$emit('select', 'context')"><strong>本轮上下文诊断</strong><small>查看真实请求的来源、顺序和容量估算</small></button>
      <slot name="context-estimate" />
      <slot name="compatibility" />
      <button v-if="!frozen" type="button" @click="$emit('select', 'debug')">{{ t('chat.debug') }}（旧式会话）</button>
    </details>
    <details>
      <summary>创作与设定</summary>
      <p v-if="frozen">此故事使用开局时保存的设定。要修改作品，请到故事库编辑；修改用于之后的新故事，不会覆盖这里的进度。</p>
      <p v-else>这是旧式会话，仍沿用原来的设定方式。会话调节与编辑作品的影响范围不同，请先核对再保存。</p>
      <nav aria-label="创作入口">
        <RouterLink :to="{ name: 'MyCharacters' }">管理我的角色卡</RouterLink>
        <RouterLink :to="{ name: 'WorldBooks' }">管理世界书</RouterLink>
      </nav>
      <button v-if="!frozen" type="button" :disabled="busy" @click="$emit('select', 'tuner')">{{ t('chat.parameterTuning') }}（仅此旧式会话）</button>
      <button v-if="!frozen && hasCharacter" type="button" @click="$emit('select', 'growth')">{{ t('character.growth') }}</button>
    </details>
    <slot name="account" />
  </div>
</template>
<style scoped>
.story-tools { font-size: 14px; line-height: 1.65; overflow-wrap: anywhere; }
h3 { margin: 0 0 12px; font-size: 16px; }
p, small { color: var(--text-secondary); }
.tool-links { display: grid; gap: 8px; }
button { display: block; text-align: left; width: 100%; padding: 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--bg-base); color: var(--text-primary); font: inherit; cursor: pointer; margin-block: 8px; }
small { display: block; font-size: 12px; }
details { border-top: 1px solid var(--border-default); padding-block: 16px; margin-top: 12px; }
summary { cursor: pointer; font-weight: 600; }
nav { display: flex; flex-wrap: wrap; gap: 12px; margin-block: 12px; }
a { color: var(--accent-text); }
button:disabled { cursor: default; opacity: .5; }
button:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
