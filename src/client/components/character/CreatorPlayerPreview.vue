<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { storyDisplayText } from '@client/utils/story-display';
import type { CreatorForm } from '@client/composables/useCreatorDraft';
import { storyIntroduction } from '../../../types/story-opening';
import type { PresentationVersion } from '../../../types/story-presentation';
import PresentationSource from './PresentationSource.vue';

const props = defineProps<{ form: CreatorForm; selectedOpening: number; presentation?: PresentationVersion }>();
const mode = ref('detail');
const coverFailed = ref(false);
const prose = ref<HTMLElement>();
const openings = computed(() => [props.form.firstMessage, ...props.form.alternateGreetings]);
const opening = computed(() => display(openings.value[props.selectedOpening] ?? '', Number.MAX_SAFE_INTEGER));
const introduction = computed(() => storyIntroduction(props.form.description,
  { first_mes: props.form.firstMessage, alternate_greetings: props.form.alternateGreetings }, props.presentation));
function display(value: string, limit = 300) {
  return storyDisplayText(value, { characterName: props.form.name, userName: '你', limit, multiline: true });
}
watch(() => props.form.avatarUrl, () => { coverFailed.value = false; });
watch(() => [props.selectedOpening, mode.value], async () => { await nextTick(); if (prose.value) prose.value.scrollTop = 0; });
</script>

<template>
  <aside class="creator-player-preview" aria-label="玩家视角预览" data-testid="creator-preview">
    <header><span class="eyebrow">PLAYER VIEW</span><h2>从玩家的视角看</h2><p>静态预览 · 不创建故事、不调用模型</p></header>
    <nav aria-label="预览页面" class="preview-modes">
      <button v-for="view in [{ id: 'detail', label: '故事详情' }, { id: 'prepare', label: '开场准备' }, { id: 'reading', label: '阅读正文' }]" :key="view.id" type="button" :aria-pressed="mode === view.id" @click="mode = view.id">{{ view.label }}</button>
    </nav>
    <article class="preview-paper">
      <template v-if="mode === 'detail'">
        <div class="preview-cover"><img v-if="form.avatarUrl && !coverFailed" :src="form.avatarUrl" alt="故事封面" @error="coverFailed = true" /><span v-else aria-label="尚未设置封面">{{ form.name.slice(0, 1) || '序' }}</span></div>
        <p class="eyebrow">{{ form.category || '等待你的故事' }}</p>
        <h3>{{ form.name || '未命名故事' }}</h3>
        <p class="description">{{ display(introduction.text, Number.MAX_SAFE_INTEGER) || '还没有可展示的介绍。' }}</p>
        <PresentationSource v-if="presentation && introduction.source === 'opening'" :presentation="presentation" />
        <ul class="preview-tags"><li v-for="tag in form.tags" :key="tag">{{ tag }}</li></ul>
      </template>
      <template v-else>
        <p class="eyebrow">{{ mode === 'prepare' ? '选择从何处进入' : '故事 · 序章' }}</p>
        <h3>{{ form.name || '未命名故事' }}</h3>
        <p class="scene-label">{{ selectedOpening === 0 ? '默认开场' : `备选开场 ${selectedOpening}` }}</p>
        <p v-if="mode === 'prepare'" class="preview-note">在编辑区选择场景，查看对应正文。身份调整和兼容检查以保存后的真实开场流程为准。</p>
        <p ref="prose" class="preview-prose" tabindex="0" aria-label="开场完整正文">{{ opening || '这个开场尚无可展示正文。可在编辑区保留或补充原文。' }}</p>
      </template>
    </article>
    <p class="preview-note">只预览介绍与开场可展示文字。作者设定不在这里展开，第三方控制块与脚本不执行；实际互动请保存后独立试体验。</p>
  </aside>
</template>

<style scoped>
.creator-player-preview { min-width:0; position:sticky; top:24px; }
header { margin-bottom:20px; } h2 { font-size:22px; margin:8px 0; } h2,h3 { font-family:var(--font-display); font-weight:500; }
header p,.preview-note { font-size:12px; color:var(--text-secondary); line-height:1.8; }
.eyebrow { font-size:11px; color:var(--accent-text); letter-spacing:.12em; }
.preview-modes { display:flex; gap:4px; margin-bottom:16px; flex-wrap:wrap; }
button { border:0; border-bottom:2px solid transparent; background:transparent; color:var(--text-secondary); font:inherit; font-size:13px; padding:10px 6px; min-height:44px; cursor:pointer; }
button[aria-pressed=true] { color:var(--text-primary); border-color:var(--accent-text); }
button:focus-visible,.preview-prose:focus-visible { outline:2px solid var(--accent-text); outline-offset:2px; }
.preview-paper { background:var(--bg-surface); border:1px solid var(--border-default); padding:24px; border-radius:8px; min-height:350px; overflow-wrap:anywhere; }
.preview-cover { height:180px; margin:-24px -24px 24px; display:grid; place-items:center; background:var(--bg-subtle); overflow:hidden; border-radius:8px 8px 0 0; }
.preview-cover img { width:100%; height:100%; object-fit:cover; } .preview-cover span { font-family:var(--font-display); font-size:64px; color:var(--text-tertiary); }
h3 { font-size:28px; margin:10px 0 20px; } .description,.preview-prose { white-space:pre-wrap; font-family:var(--font-reading); font-size:var(--chat-font-size,17px); line-height:1.95; }
.description { max-height:45dvh; overflow:auto; } .preview-prose { max-height:55dvh; overflow:auto; overscroll-behavior:contain; }
.scene-label { font-size:12px; color:var(--text-secondary); padding-bottom:16px; border-bottom:1px solid var(--border-default); }
.preview-tags { display:flex; flex-wrap:wrap; list-style:none; padding:0; gap:8px; font-size:12px; color:var(--text-secondary); }
</style>
