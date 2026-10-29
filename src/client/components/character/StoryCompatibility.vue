<template>
  <section class="story-compatibility" aria-label="体验支持情况">
    <h2>这张卡如何游玩</h2>
    <p v-if="capabilities.invalid" role="alert">这张卡的探索规则有误，暂时无法新开故事。请作者修正规则后再开始。</p>
    <p v-else-if="capabilities.native">支持推荐行动、自由输入和有依据的状态记录。{{ capabilities.map ? '提供已知地点地图。' : '不提供地图。' }}</p>
    <p v-else-if="report?.adaptation?.reason === 'reviewed-ritual'">以自由输入推进剧情，新故事保存咔咔的角色力量。本次没有新增规则行动或地图。</p>
    <p v-else-if="report?.adaptation?.conclusion === 'supported'">新故事支持已校验的有限数值规则、推荐行动和自由输入。其他外部机制仍需单独验证，当前适配不提供地图。</p>
    <p v-else>以自由输入推进剧情，保留每轮经历和此次故事的记忆。本卡尚未提供可运行的数值规则，暂不显示数值和地图。</p>
    <p v-if="report?.adaptation">{{ adapterReasonMessages[report.adaptation.reason] }}</p>
    <p v-if="capabilities.issues.length">本卡含有尚未适配的扩展，部分数值、界面或玩法可能无法按原作运行。</p>
    <p v-if="report?.identity.status === 'invalid'" role="alert">玩家身份声明有误，请作者修正后再开始。</p>
    <p v-if="report?.books.dependencies.some(status => status !== 'bound')" role="status">部分设定未就绪，请展开详情核对绑定或停用情况。</p>
    <p v-if="loading" role="status">正在核对已绑定设定与身份声明…</p>
    <p v-else-if="failed" role="alert">暂时无法核对绑定，未判定依赖齐全。<button type="button" @click="load">重新检查</button></p>
    <p v-else-if="!report">仅检查卡内声明，尚未核对实际绑定的设定。</p>
    <details>
      <summary>查看设定与兼容详情</summary>
      <ul v-if="capabilities.issues.length" class="compatibility-issues"><li v-for="issue in capabilities.issues" :key="issue">{{ storyCapabilityMessages[issue] }}</li></ul>
      <StoryDiagnosticsView v-if="report" :report="report" />
    </details>
    <p class="compatibility-footnote">开始时固定卡片与已绑定设定。之后编辑原卡只影响新故事。</p>
  </section>
</template>
<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { inspectStoryCapabilities, storyCapabilityMessages } from '../../../types/story-capabilities';
import { characterApi } from '../../services/character.api';
import type { StoryDiagnostics } from '../../../types/story-diagnostics';
import StoryDiagnosticsView from './StoryDiagnosticsView.vue';
import { adapterReasonMessages } from '../../../types/story-adapter';
const props = defineProps<{ cardData?: Record<string, unknown>; characterId?: string }>();
const report = ref<StoryDiagnostics | null>(null);
const loading = ref(false);
const failed = ref(false);
let version = 0;
const capabilities = computed(() => report.value?.capabilities ?? inspectStoryCapabilities(props.cardData ?? {}));
async function load() {
  const requestVersion = ++version;
  report.value = null;
  failed.value = false;
  loading.value = Boolean(props.characterId);
  if (!props.characterId) return;
  try {
    const result = await characterApi.getCompatibility(props.characterId);
    if (requestVersion === version) report.value = result;
  } catch {
    if (requestVersion === version) failed.value = true;
  } finally {
    if (requestVersion === version) loading.value = false;
  }
}
watch(() => props.characterId, load, { immediate: true });
onScopeDispose(() => { version++; });
</script>
<style scoped>
.story-compatibility { border-top: 1px solid var(--border-default); padding: 24px 0; }
h2 { font-size: 16px; font-weight: 500; margin: 0 0 12px; }
p { font-size: 14px; line-height: 1.9; color: var(--text-secondary); }
.compatibility-issues { padding-left: 20px; font-size: 14px; line-height: 1.9; color: var(--text-secondary); }
.compatibility-footnote { font-size: 12px; }
summary { cursor: pointer; min-height: 44px; line-height: 44px; color: var(--accent-text); }
button { min-height: 44px; color: var(--accent-text); cursor: pointer; background: transparent; border: 0; font: inherit; }
</style>
