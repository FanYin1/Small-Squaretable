<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CreatorForm } from '@client/composables/useCreatorDraft';
import { storyDisplayText } from '@client/utils/story-display';
import { inspectAuthorIdentity } from '../../../types/story-diagnostics';
import { storyRulesSchema } from '../../../types/story-state';

const form = defineModel<CreatorForm>({ required: true });
const selectedOpening = defineModel<number>('selectedOpening', { required: true });
const props = defineProps<{ original: Record<string, unknown>; rules: string; editMode: boolean; disabled: boolean }>();
const emit = defineEmits<{ upload: []; advanced: []; library: [] }>();
const step = ref('story');
const coverFailed = ref(false);
watch(() => form.value.avatarUrl, () => { coverFailed.value = false; });
const steps = [
  { id: 'story', title: '故事名片', hint: '第一眼的邀请' },
  { id: 'people', title: '人物与身份', hint: '谁在故事之中' },
  { id: 'world', title: '背景与资料', hint: '让世界有依据' },
  { id: 'openings', title: '开场场景', hint: '从这里出发' },
  { id: 'review', title: '保存与试体验', hint: '交给另一个自己' },
];
const activeStep = computed(() => steps.find(item => item.id === step.value)!);
const identity = computed(() => inspectAuthorIdentity(props.original));
const scenes = computed(() => [form.value.firstMessage, ...form.value.alternateGreetings]);
const sceneText = computed({
  get: () => scenes.value[selectedOpening.value] ?? '',
  set: value => { if (selectedOpening.value === 0) form.value.firstMessage = value; else form.value.alternateGreetings[selectedOpening.value - 1] = value; },
});
const entries = computed(() => {
  const book = props.original.character_book as { entries?: unknown[] } | undefined;
  return Array.isArray(book?.entries) ? book.entries : [];
});
const rulesSummary = computed(() => {
  if (!props.rules.trim()) return null;
  try { return storyRulesSchema.parse(JSON.parse(props.rules)); } catch { return false; }
});
function excerpt(value: string, limit = 140) {
  return storyDisplayText(value, { characterName: form.value.name, userName: '你', limit });
}
function addScene() {
  if (props.disabled || form.value.alternateGreetings.length >= 10) return;
  form.value.alternateGreetings.push('');
  selectedOpening.value = form.value.alternateGreetings.length;
}
function removeScene() {
  if (props.disabled || selectedOpening.value === 0) return;
  form.value.alternateGreetings.splice(selectedOpening.value - 1, 1);
  selectedOpening.value = Math.max(0, selectedOpening.value - 1);
}
defineExpose({ step });
</script>

<template>
  <div class="creator-workbench" data-testid="creator-workbench">
    <nav class="workbench-steps" aria-label="创作步骤">
      <button v-for="(item, index) in steps" :key="item.id" type="button" :aria-current="step === item.id ? 'step' : undefined" :data-step="item.id" @click="step = item.id">
        <span class="step-number">{{ String(index + 1).padStart(2, '0') }}</span><span><strong>{{ item.title }}</strong><small>{{ item.hint }}</small></span>
      </button>
    </nav>
    <section class="workbench-stage" :aria-label="activeStep.title">
      <header class="stage-heading"><p class="eyebrow">{{ activeStep.hint }}</p><h2>{{ activeStep.title }}</h2></header>
      <fieldset :disabled="disabled">
        <template v-if="step === 'story'">
          <div class="story-object">
            <button type="button" class="cover-object" aria-label="上传故事封面" @click="emit('upload'); coverFailed = false">
              <img v-if="form.avatarUrl && !coverFailed" :src="form.avatarUrl" alt="" @error="coverFailed = true" />
              <span v-else class="cover-initial">{{ form.name.slice(0, 1) || '序' }}</span><span class="cover-action">更换封面</span>
            </button>
            <div><p class="eyebrow">你的作品 · 故事名片</p><h3>{{ form.name || '一个尚未命名的世界' }}</h3><p>{{ excerpt(form.description) || '一段清楚的邀请，告诉玩家将进入怎样的体验。' }}</p></div>
          </div>
          <p class="hint">封面可留空；支持 PNG / JPEG / WebP，最多 5 MB。</p>
          <button v-if="form.avatarUrl" type="button" class="text-action" @click="form.avatarUrl = ''">移除封面</button>
          <label>故事名称<input v-model="form.name" maxlength="255" data-testid="creator-name" /></label>
          <label>展示介绍<textarea v-model="form.description" rows="4" data-testid="creator-description" placeholder="不剧透地介绍体验，不把隐藏设定写在这里。" /></label>
          <div class="paired-fields">
            <label>分类<select v-model="form.category"><option value="">暂不分类</option><option value="game">游戏</option><option value="entertainment">娱乐</option><option value="historical">历史</option><option value="modern">现代</option><option value="assistant">助手</option><option value="education">教育</option><option v-if="form.category && !['game','entertainment','historical','modern','assistant','education'].includes(form.category)" :value="form.category">{{ form.category }}</option></select></label>
            <div class="tag-object"><span>故事标签</span><p>{{ form.tags.join(' · ') || '尚未设置' }}</p><button type="button" class="text-action" @click="emit('advanced')">在高级编辑中调整标签</button></div>
          </div>
        </template>
        <template v-else-if="step === 'people'">
          <div class="people-objects">
            <article class="person-object"><span class="object-mark" aria-hidden="true">01</span><p class="eyebrow">作者角色 / 叙事主体</p><h3>{{ form.name || '待命名' }}</h3><p>{{ excerpt(form.personality) || '尚未填写人物性格与行为方式。' }}</p><span class="source-label">来源：人物设定</span></article>
            <article class="person-object player-object"><span class="object-mark" aria-hidden="true">你</span><p class="eyebrow">玩家进入的身份</p><h3>{{ identity.status === 'fixed_name' ? identity.fixedName : '开局时选择' }}</h3><p>{{ identity.status === 'invalid' ? '身份声明无效，请在高级资料中检查。' : identity.status === 'fixed_name' ? '作者声明固定称呼。真实开局仍会校验身份约束。' : '未检测到平台固定称呼声明。玩家可在开场流程调整身份；原文仍可能有作者约束。' }}</p><span class="source-label">{{ identity.status === 'unverified' ? '未推断人物关系' : '来源：作者身份声明' }}</span></article>
          </div>
          <label>人物性格与行为<textarea v-model="form.personality" rows="7" placeholder="这个角色如何说话、做决定、回应玩家？" /></label>
          <p class="hint">人物关系写入原有设定；这里不自动生成关系图或新增可独立控制的 NPC。</p>
        </template>
        <template v-else-if="step === 'world'">
          <div class="material-objects">
            <article><span class="material-symbol" aria-hidden="true">▤</span><div><h3>故事背景</h3><p>{{ excerpt(form.scenario) || '还没有填写背景。' }}</p><small>来源：情境设定 · 本次草稿</small></div></article>
            <article><span class="material-symbol" aria-hidden="true">▥</span><div><h3>卡片内嵌资料</h3><p>{{ entries.length }} 条原始资料保留</p><small>这是原卡归档；实际使用的书与启用状态见下方绑定资料，不自动加载其他世界。</small></div></article>
            <article><span class="material-symbol" aria-hidden="true">◇</span><div><h3>探索机制</h3><p>{{ rulesSummary === false ? '规则格式有误，保存前需要修正' : rulesSummary ? `${rulesSummary.fields.length} 个状态字段 · ${rulesSummary.actions.length} 个明确行动` : '未声明平台探索规则' }}</p><small>只有已支持规则参与运行；保留扩展不代表执行作者脚本。</small></div></article>
          </div>
          <label>情境与背景<textarea v-model="form.scenario" rows="6" /></label>
          <button type="button" class="text-action" @click="emit('advanced')">编辑系统提示与探索规则</button>
          <slot name="bindings" />
          <p v-if="!editMode" class="hint">先保存私有作品，再绑定已有资料。不会从资料库猜测或自动启用世界书。</p>
        </template>
        <template v-else-if="step === 'openings'">
          <p class="hint">点击场景对照完整正文。保持作者原顺序；内容是否可直接开局由真实开场检查决定。</p>
          <div class="scene-objects" aria-label="开场场景列表">
            <button v-for="(scene, index) in scenes" :key="index" type="button" class="scene-object" :aria-pressed="selectedOpening === index" :data-scene="index" @click="selectedOpening = index">
              <span class="scene-number">{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ index === 0 ? '默认开场' : `备选开场 ${index}` }}</strong><span>{{ excerpt(scene, 100) || '没有可展示正文 · 原文可编辑' }}</span><small>{{ scene.length }} 字符 · {{ index === 0 ? 'first_mes' : `alternate_greetings[${index - 1}]` }}</small>
            </button>
          </div>
          <div class="scene-actions"><button type="button" :disabled="form.alternateGreetings.length >= 10" @click="addScene">添加开场</button><button v-if="selectedOpening > 0" type="button" @click="removeScene">移除所选备选开场</button></div>
          <label>{{ selectedOpening === 0 ? '默认开场原文' : `备选开场 ${selectedOpening} 原文` }}<textarea v-model="sceneText" rows="10" data-testid="creator-scene-text" spellcheck="false" /></label>
          <p class="hint">原文可含宏与控制块；玩家预览只展示可阅读文字，不改写原文。</p>
        </template>
        <template v-else>
          <ol class="delivery-path"><li><span>01</span><div><h3>保存作品</h3><p>新作品默认私有。已有作品保留当前发布状态；底部反馈以服务器结果为准。</p></div></li><li><span>02</span><div><h3>独立试体验</h3><p>保存后回到「我的角色」，从作品选择开始，确认开场与身份。新开局与已有故事分开，发送剧情时才进入模型调用流程。</p></div></li><li><span>03</span><div><h3>准备好后再发布</h3><p>在库中提交发布、集中检查展示内容；提交后仍需审核。</p></div></li></ol>
          <dl class="review-facts"><div><dt>名称</dt><dd>{{ form.name || '尚未填写（必填）' }}</dd></div><div><dt>介绍</dt><dd>{{ form.description ? '已填写，请检查剧透' : '留空，不自动编造' }}</dd></div><div><dt>开场</dt><dd>{{ scenes.length }} 个原始位置</dd></div><div><dt>扩展</dt><dd>随原卡保留，支持情况以试体验检查为准</dd></div></dl>
          <button type="button" class="text-action" @click="emit('library')">返回我的角色</button>
        </template>
      </fieldset>
      <footer class="step-actions"><button v-if="step !== 'story'" type="button" @click="step = steps[steps.findIndex(item => item.id === step) - 1].id">上一步</button><button v-if="step !== 'review'" type="button" @click="step = steps[steps.findIndex(item => item.id === step) + 1].id">下一步：{{ steps[steps.findIndex(item => item.id === step) + 1].title }}</button></footer>
    </section>
  </div>
</template>

<style scoped>
.creator-workbench { display:grid; grid-template-columns:164px minmax(0,1fr); gap:28px; }
.workbench-steps { display:flex; flex-direction:column; gap:8px; align-self:start; position:sticky; top:24px; }
.workbench-steps button { text-align:left; display:flex; gap:12px; padding:14px 8px; border:0; border-left:2px solid transparent; background:transparent; }
.workbench-steps button[aria-current=step] { border-color:var(--accent-text); background:var(--bg-subtle); }
.step-number { color:var(--accent-text); font-size:12px; padding-top:3px; } strong { font-weight:500; } small { display:block; font-size:11px; color:var(--text-secondary); line-height:1.8; } .workbench-steps small { margin-top:5px; }
.workbench-stage { min-width:0; } .stage-heading { margin-bottom:24px; } h2,h3 { font-family:var(--font-display); font-weight:500; overflow-wrap:anywhere; } h2 { font-size:28px; margin:8px 0; } h3 { font-size:23px; margin:8px 0 12px; }
fieldset { border:0; margin:0; padding:0; min-width:0; } .eyebrow { color:var(--accent-text); font-size:11px; letter-spacing:.08em; } p { line-height:1.8; overflow-wrap:anywhere; }
button { cursor:pointer; min-height:44px; color:var(--text-primary); background:var(--bg-subtle); border:1px solid var(--border-interactive); border-radius:6px; padding:10px 12px; font:inherit; font-size:13px; } button:disabled { cursor:default; opacity:.55; }
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible { outline:2px solid var(--accent-text); outline-offset:3px; }
label { display:grid; gap:10px; margin:24px 0; font-size:13px; } input,textarea,select { width:100%; box-sizing:border-box; min-height:44px; border:1px solid var(--border-interactive); border-radius:6px; background:var(--bg-surface); color:var(--text-primary); padding:12px; font:inherit; line-height:1.7; } textarea { resize:vertical; }
.hint { font-size:12px; color:var(--text-secondary); } .text-action { color:var(--accent-text); border:0; background:transparent; padding-left:0; text-align:left; }
.story-object { display:flex; gap:24px; align-items:center; padding:24px 0; border-top:1px solid var(--border-default); border-bottom:1px solid var(--border-default); }
.story-object > div { min-width:0; } .story-object p:not(.eyebrow) { color:var(--text-secondary); font-size:14px; }
.cover-object { width:120px; height:166px; flex-shrink:0; padding:0; position:relative; overflow:hidden; display:grid; place-items:center; background:var(--bg-subtle); border-color:var(--border-default); }
.cover-object img { width:100%; height:100%; object-fit:cover; } .cover-initial { font-family:var(--font-display); font-size:48px; color:var(--text-tertiary); }
.cover-action { position:absolute; bottom:0; left:0; width:100%; padding:8px 0; background:var(--bg-surface); font-size:11px; }
.paired-fields { display:grid; grid-template-columns:1fr 1fr; gap:24px; } .tag-object { padding-top:24px; font-size:13px; } .tag-object p { color:var(--text-secondary); }
.people-objects { display:grid; grid-template-columns:1fr 1fr; gap:16px; } .person-object { padding:20px; border:1px solid var(--border-default); border-radius:8px; background:var(--bg-surface); } .person-object p { font-size:13px; color:var(--text-secondary); }
.object-mark { display:grid; place-items:center; width:48px; height:48px; border-radius:50%; border:1px solid var(--border-default); font-family:var(--font-display); font-size:20px; color:var(--accent-text); margin-bottom:24px; } .source-label { font-size:11px; color:var(--text-secondary); }
.material-objects article { display:flex; gap:20px; padding:20px 0; border-bottom:1px solid var(--border-default); } .material-objects h3 { font-family:inherit; font-size:16px; } .material-objects p { font-size:13px; margin:8px 0; } .material-symbol { color:var(--accent-text); font-size:28px; } .material-objects article > div { min-width:0; }
.scene-objects { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; max-height:420px; overflow:auto; padding:4px; } .scene-object { display:flex; flex-direction:column; align-items:flex-start; gap:12px; text-align:left; border-color:var(--border-default); background:var(--bg-surface); overflow-wrap:anywhere; } .scene-object[aria-pressed=true] { border-color:var(--accent-text); background:var(--bg-subtle); } .scene-object > span:not(.scene-number) { font-size:12px; color:var(--text-secondary); line-height:1.7; } .scene-number { font-family:var(--font-display); font-size:24px; color:var(--accent-text); } .scene-object small { margin-top:auto; }
.scene-actions,.step-actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:20px; } .step-actions { padding-top:20px; border-top:1px solid var(--border-default); justify-content:flex-end; }
.delivery-path { list-style:none; padding:0; } .delivery-path li { display:flex; gap:20px; padding:20px 0; border-bottom:1px solid var(--border-default); } .delivery-path li > span { font-size:24px; color:var(--accent-text); font-family:var(--font-display); } .delivery-path h3 { font-size:20px; margin-top:0; } .delivery-path p { font-size:13px; color:var(--text-secondary); }
.review-facts { font-size:13px; } .review-facts > div { display:grid; grid-template-columns:60px 1fr; gap:16px; padding:12px 0; } dd { margin:0; overflow-wrap:anywhere; color:var(--text-secondary); }
@media(max-width:1150px) { .creator-workbench { grid-template-columns:minmax(0,1fr); } .workbench-steps { position:static; flex-direction:row; overflow:auto; padding-bottom:8px; } .workbench-steps button { flex-shrink:0; border-left:0; border-bottom:2px solid transparent; } .workbench-steps small { display:none; } }
@media(max-width:600px) { .story-object { gap:16px; } .cover-object { width:90px; height:128px; } .people-objects { grid-template-columns:1fr; } .person-object { padding:16px; } .object-mark { margin-bottom:12px; } .scene-objects { gap:8px; } .scene-object { padding:12px; } }
</style>
