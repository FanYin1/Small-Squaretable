<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { characterApi } from '../../services/character.api';
import { adapterReasonMessages, type AdapterJobView } from '../../../types/story-adapter';
import { ruleClueLabels, ruleClueExplanations, ruleClueSourceLabel } from '../../../types/story-rule-inspection';

const props = defineProps<{ characterId: string }>();
const emit = defineEmits<{ changed: [] }>();
const jobs = ref<AdapterJobView[]>([]);
const failed = ref(false);
const busy = ref(false);
const loaded = ref(false);
const latest = computed(() => jobs.value[0]);
const inspection = computed(() => !failed.value && !busy.value && loaded.value && latest.value?.current && latest.value.result?.inspection?.sourceRevision === latest.value.sourceRevision
  ? latest.value.result.inspection : undefined);
const pending = computed(() => latest.value && ['queued', 'running'].includes(latest.value.status));
const stages = ['收集资料', '检查来源', '编译规则', '完成检查'];
const stageIds = ['collect', 'inspect', 'compile', 'complete'];
const statuses: Record<AdapterJobView['status'], string> = { queued: '等待检查', running: '正在检查', ready: '检查已完成', failed: '检查失败', cancelled: '已取消', stale: '资料已变更' };
let version = 0;
let readVersion = 0;
let requestId: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(timer);
  if (pending.value) timer = setTimeout(() => { void load(); }, 2000);
}
async function load() {
  const requestVersion = version;
  const currentRead = ++readVersion;
  failed.value = false;
  try {
    const data = await characterApi.getAdaptations(props.characterId);
    if (requestVersion === version && currentRead === readVersion) {
      const previous = latest.value;
      jobs.value = data; loaded.value = true; schedule();
      if (latest.value?.status === 'ready' && (previous?.id !== latest.value.id || previous.status !== 'ready')) emit('changed');
    }
  } catch { if (requestVersion === version && currentRead === readVersion) failed.value = true; }
}
async function act(cancel = false) {
  if (busy.value) return;
  const requestVersion = version;
  const characterId = props.characterId;
  const jobId = latest.value?.id;
  clearTimeout(timer);
  readVersion++;
  busy.value = true;
  failed.value = false;
  try {
    if (cancel && jobId) await characterApi.cancelAdaptation(characterId, jobId);
    else await characterApi.prepareAdaptation(characterId, requestId ??= crypto.randomUUID());
    if (requestVersion === version) { requestId = undefined; await load(); }
  } catch { if (requestVersion === version) failed.value = true; }
  finally { if (requestVersion === version) busy.value = false; }
}
watch(() => props.characterId, () => {
  version++; readVersion++; requestId = undefined; clearTimeout(timer); jobs.value = []; loaded.value = false; busy.value = false; void load();
}, { immediate: true });
onScopeDispose(() => { version++; clearTimeout(timer); });
</script>

<template>
  <section class="adapter-panel" aria-label="整理与兼容检查" :aria-busy="busy || pending">
    <header><div><p class="eyebrow">故事准备</p><h2>整理与兼容检查</h2></div><span v-if="latest" role="status">{{ statuses[latest.status] }}</span></header>
    <p>核对当前卡片与已启用的绑定资料。保留原件，检查结果只供新故事采用。</p>
    <ol v-if="latest" class="adapter-stages" aria-label="检查步骤"><li v-for="(stage, index) in stages" :key="stage" :aria-current="stageIds[index] === latest.stage ? 'step' : undefined"><span>{{ index + 1 }}</span>{{ stage }}</li></ol>
    <p v-if="failed" role="alert">暂时无法确认检查结果。<button type="button" @click="load">重新读取</button></p>
    <p v-else-if="!loaded" role="status">正在读取检查记录…</p>
    <template v-if="latest">
      <p v-if="!latest.current || latest.status === 'stale'" role="status">卡片、绑定资料或规则检查要求已更新，这份结果不会用于新故事。请重新检查。已有故事保留冻结规则。</p>
      <template v-if="latest.result && latest.current && latest.status !== 'stale'">
        <p>{{ adapterReasonMessages[latest.result.reason] }}</p>
        <p v-if="latest.result.conclusion === 'supported'">{{ latest.result.fieldCount }} 项状态 · {{ latest.result.actionCount }} 项有限行动 · {{ latest.result.sourceCount }} 份来源</p>
        <details v-if="inspection" class="rule-inspection" role="region" aria-label="规则线索与依赖核对">
          <summary>规则线索与依赖核对 · {{ inspection.coverage === 'source-limit' ? '范围超限' : `${inspection.groups.length} 类线索待核对` }}</summary>
          <p>文本线索不是已确认规则，也不代表完整理解了玩法。这里不会自动新增行动或修改数值。</p>
          <p v-if="inspection.coverage === 'source-limit'" role="status">当前资料超过有界分析范围，未展示局部结果作为整卡结论。</p>
          <template v-else>
            <p>已扫描 {{ inspection.sourceCount }} 份资料 · {{ inspection.characterCount }} 个字符。范围为卡片指定字段、开场、指定扩展文本及启用的绑定条目，不含未绑定或停用的世界书条目。</p>
            <div v-if="inspection.groups.length" class="rule-clues">
              <article v-for="group in inspection.groups" :key="group.kind">
                <h4>{{ ruleClueLabels[group.kind] }} <span>{{ group.occurrences }} 处</span></h4>
                <p>{{ ruleClueExplanations[group.kind] }}</p>
                <details><summary>查看来源定位（最多3份）</summary><ul><li v-for="(example, index) in group.examples" :key="index">
                  {{ ruleClueSourceLabel(example.source) }} · 第 {{ example.line }} 行
                  <small>字符 {{ example.start + 1 }}–{{ example.end }} · 摘要 {{ example.digest.slice(0, 12) }}</small>
                  <a v-if="example.source.kind === 'book'" :href="`/worldbooks/${example.source.bookId}`">打开绑定资料</a>
                </li></ul></details>
              </article>
            </div>
            <p v-else>本次未命中文本线索，不等于没有规则、没有依赖或已经兼容。</p>
          </template>
          <small>只对当前资料即时分析，不改写原检查回执或旧故事；扩展包括其中停用脚本的静态文本，定位基于JSON序列化。否定句、例子和叙述也可能命中，仍需核对原文。</small>
        </details>
      </template>
      <p v-if="latest.status === 'failed'">本次未完成，不会采用半成品。可重新发起，旧记录保留。</p>
      <details><summary>检查版本与记录</summary><p>版本 {{ latest.id.slice(0, 8) }} · {{ latest.createdAt }} · 尝试 {{ latest.attempt }}/3</p><p>资料修订 {{ latest.sourceRevision.slice(0, 12) }}</p><ul><li v-for="job in jobs.slice(1)" :key="job.id">{{ statuses[job.status] }} · {{ job.id.slice(0, 8) }}{{ job.current ? '' : ' · 旧资料' }}</li></ul></details>
    </template>
    <div class="adapter-actions"><button v-if="pending" type="button" :disabled="busy" @click="act(true)">取消检查</button><button v-else type="button" :disabled="busy || !loaded" @click="act()">{{ latest ? '重新检查' : '检查这张卡' }}</button></div>
    <small>本次为确定性检查，不调用付费模型。仅运行已校验声明或精确匹配已审查版本的规则；其他自然语言、掷骰、动态价格和作者脚本不自动启用。</small>
  </section>
</template>

<style scoped>
.adapter-panel { padding: 24px; border: 1px solid var(--border-default); border-radius: 12px; background: var(--bg-surface); margin: 24px 0; overflow-wrap: anywhere; }
header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: center; }
h2 { font: 500 22px/1.5 var(--font-display); margin: 0; }
p, li { color: var(--text-secondary); line-height: 1.8; }
.eyebrow { color: var(--accent-text); font-size: 12px; margin: 0 0 4px; }
.adapter-stages { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); list-style: none; padding: 16px 0; gap: 12px; }
.adapter-stages li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.adapter-stages span { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--border-default); border-radius: 50%; }
[aria-current="step"] { color: var(--accent-text); }
button, summary { cursor: pointer; min-height: 44px; color: var(--accent-text); }
button { border: 1px solid var(--border-default); border-radius: 8px; padding: 8px 16px; background: var(--bg-surface); font: inherit; }
button:disabled { opacity: .5; cursor: default; }
.adapter-actions { margin: 16px 0; }
.rule-inspection { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-default); }
.rule-inspection > summary { font-size: 14px; line-height: 1.8; padding: 8px 0; }
.rule-clues { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; }
.rule-clues article { padding: 16px; border: 1px solid var(--border-default); border-radius: 10px; min-width: 0; }
.rule-clues h4 { margin: 0; font-size: 14px; font-weight: 500; color: var(--text-primary); }
.rule-clues h4 span { margin-left: 8px; color: var(--text-secondary); font-size: 12px; }
.rule-clues p, .rule-clues li { font-size: 13px; }
.rule-clues a { display: inline-flex; align-items: center; min-height: 44px; color: var(--accent-text); }
small { color: var(--text-secondary); line-height: 1.8; display: block; }
</style>
