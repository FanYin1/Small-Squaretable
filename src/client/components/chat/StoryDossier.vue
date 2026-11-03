<template>
  <Teleport to="body">
    <div v-if="expanded" class="story-dossier-layer" @keydown.esc.stop.prevent="closePanel" @keydown.tab="trapFocus">
      <button type="button" class="story-dossier-backdrop" tabindex="-1" aria-label="关闭此次游玩资料" @click="closePanel" />
      <aside ref="dialogPanel" :id="panelId" class="story-dossier" role="dialog" aria-modal="true" :aria-labelledby="`${panelId}-title`" tabindex="-1">
        <div class="dossier-body">
      <div class="dossier-heading"><header><span class="dossier-eyebrow">留在这个世界的痕迹</span><h2 :id="`${panelId}-title`">此次游玩</h2><p role="status">{{ tab === 'ledger' ? '查看已保存回复中的账簿描述' : busy ? '剧情正在展开 · 状态尚未确认' : error ? state ? '显示上次记录 · 本次读取失败' : '记录读取失败' : loading ? state ? '正在核对最新记录' : '读取记录中' : state ? `已读取记录 · 第 ${state.version} 轮` : '读取记录中' }}</p></header><button ref="closeButton" type="button" class="dossier-close" @click="closePanel">返回故事</button></div>
      <nav aria-label="游玩资料">
        <button v-for="item in tabs" :key="item.id" type="button" :aria-pressed="tab === item.id" @click="tab = item.id">{{ item.label }}</button>
      </nav>
      <div class="dossier-content">
      <p v-if="error" role="alert">{{ error }} <button type="button" @click="$emit('refresh')">重新读取</button></p>
      <StoryLedgerDetails v-if="tab === 'ledger' && ledger" :snapshot="ledger" :busy="busy" @source="readSource" />
      <section v-if="tab === 'state'" :key="chatId" aria-label="已知状态">
        <section class="current-state" data-testid="current-story-state" :aria-busy="loading || busy">
          <div class="section-heading"><h3>当前状态</h3><span v-if="state" class="state-badge">{{ busy || error || loading ? '上次确认' : '已确认记录' }}</span></div>
          <button v-if="state" type="button" class="state-refresh" :disabled="loading || busy" @click="$emit('refresh')">重新核对记录</button>
          <p v-if="state && (busy || error || loading)" class="dossier-muted" data-testid="state-freshness">{{ busy ? '本轮尚未确认，以下保留上次状态。' : error ? '本次未更新，以下保留上次状态。' : '正在核对，以下保留上次状态。' }}</p>
          <div v-if="currentLocation" class="current-location"><span class="dossier-eyebrow">你在这里</span><strong>{{ currentLocation.label }}</strong><button type="button" @click="tab = 'map'">查看已知地图</button></div>
          <dl v-if="state?.fields.length" class="story-facts current-facts"><div v-for="field in state.fields" :key="field.id"><dt>{{ field.label }}</dt><dd>{{ displayValue(field.value) }}<small v-if="field.value !== null">{{ field.unit }}</small><button v-if="field.sourceEventId" type="button" @click="showSource(field.sourceEventId)">查看依据</button><span v-else class="fact-origin">开局设定</span></dd></div></dl>
          <template v-else-if="state"><p class="state-empty">{{ state.legacy ? '此存档尚无结构化状态' : state.native ? '尚未发现可显示的状态' : '在正文中继续你的经历' }}</p><p class="dossier-muted">{{ state.legacy ? '沿用已有正文与历程，不补造历史数值。' : state.native ? '发现并确认后，状态会留在这里。未显示不代表数值为零。' : '本卡暂无可运行的数值规则。你的经历保存在正文和历程中。' }}</p></template>
          <div v-else-if="loading" class="state-loading" role="status">正在读取此次故事的状态…<span v-for="row in 3" :key="row" aria-hidden="true" /></div>
          <p v-else class="dossier-muted">{{ error ? '状态暂时无法读取，可在上方重试。' : '尚未读取状态。' }}</p>
        </section>
        <details v-if="recentFacts.length" class="dossier-disclosure" data-testid="story-narrative-facts">
          <summary>最近的见闻与表达 <span>{{ recentFacts.length }} 条</span></summary>
          <p class="dossier-muted">仅含最近已记录轮次。传闻、提问和计划不会自动成为已确认的资产或地点。</p>
          <ul class="story-notes"><li v-for="item in recentFacts" :key="item.id"><small>{{ factLabels[item.fact.kind] }} · {{ item.fact.speaker === 'player' ? '你的表达' : '人物的表达' }}</small><p>{{ item.fact.content }}</p><button v-if="item.messageId" type="button" @click="readSource(item.messageId)">第 {{ item.version }} 轮 · 阅读依据</button></li></ul>
        </details>
        <button v-if="currentUnsettledEvent" type="button" class="unsettled-events" @click="tab = 'history'">{{ currentUnsettledEvent.status === 'proposed' ? '本轮有待核对的行动' : '本轮已中断，状态未推进' }} · 查看历程</button>
        <section v-if="state?.openingRecord?.status === 'initial-only' || state?.adaptationReport" class="story-reference" aria-label="开局与兼容资料">
          <h3>开局与兼容资料</h3><p class="dossier-muted">保留这次出发时的依据，按需查阅。</p>
          <details v-if="state?.openingRecord?.status === 'initial-only'" class="dossier-disclosure opening-record" data-testid="saved-opening-record">
            <summary>开局记录 <span>历史初值</span></summary><p class="dossier-muted">来自本次选定开场，已随存档保存，不会随剧情自动更新；这些数值不代表当前余额。</p>
            <dl class="story-facts"><div v-for="field in state.openingRecord.fields" :key="field.id"><dt>{{ field.label }}</dt><dd>{{ displayValue(field.value) }}<span class="fact-origin">开局时</span></dd></div></dl>
            <details><summary>查看记录来源</summary><p v-for="field in state.openingRecord.fields" :key="field.id" class="dossier-muted">{{ state.openingRecord.source.opening.source === 'first_mes' ? '默认开场' : `开场 ${state.openingRecord.source.opening.index + 1}` }} · {{ field.path.join(' › ') }}</p></details>
          </details>
          <StoryAdaptationReport v-if="state?.adaptationReport" :report="state.adaptationReport" saved />
        </section>
      </section>
      <section v-if="tab === 'map'" aria-label="已知地图">
        <p v-if="!state?.map" class="dossier-muted">本卡没有提供可用地图。</p>
        <template v-else><p class="dossier-muted">查看地点不会移动；前往地点请使用行动区。</p><ol class="story-map"><li v-for="node in state.map.nodes" :key="node.id" :class="{ here: node.id === state.map.location }"><strong>{{ node.label }}</strong><span v-if="node.id === state.map.location">你在这里</span><p v-if="node.description">{{ node.description }}</p><small v-if="node.links.length">连接：{{ node.links.map(id => state?.map?.nodes.find(place => place.id === id)?.label).join('、') }}</small></li></ol></template>
      </section>
      <section v-if="tab === 'history'" aria-label="游玩历程">
        <p v-if="sourceLoading" role="status">正在读取这条状态的依据…</p>
        <p v-if="sourceError" role="alert">{{ sourceError }} <button type="button" @click="showSource(sourceId)">重新读取依据</button></p>
        <article v-if="sourceEvent" id="story-source-event" class="source-event" aria-label="所选状态依据" tabindex="-1">
          <small>状态依据 · 第 {{ sourceEvent.version }} 轮 · {{ new Date(sourceEvent.createdAt).toLocaleString() }}</small>
          <h3>{{ sourceEvent.actionLabel || '自由探索' }}</h3><p>{{ sourceEvent.outcome || sourceEvent.excerpt }}</p>
          <button v-if="sourceEvent.messageId" type="button" @click="readSource(sourceEvent.messageId)">阅读依据原文</button>
        </article>
        <p v-if="historyError" role="alert">{{ historyError }} <button type="button" :disabled="historyLoading" @click="loadEarlier">重新读取历程</button></p>
        <p v-if="!allEvents.length" class="dossier-muted">完成一轮剧情后，确认记录会出现在这里。</p>
        <ol class="story-history"><li v-for="event in allEvents" :key="event.id" :id="`story-event-${event.id}`"><span class="dossier-eyebrow">第 {{ event.version }} 轮 · {{ event.status === 'interrupted' ? '已停止，状态未推进' : event.status === 'proposed' ? event.version === state?.version ? '候选已保存，尚未执行' : '当时保存的行动候选 · 后续结果请查看随后记录' : '已记录' }}</span><h3>{{ event.actionLabel || (event.status === 'proposed' ? event.version === state?.version ? '待核对的行动' : '行动候选记录' : '自由探索') }}</h3><p>{{ event.status === 'interrupted' ? '保留了已生成的片段；行动效果未提交。' : event.outcome || event.excerpt }}</p><button v-if="event.messageId" type="button" @click="readSource(event.messageId)">阅读原文</button></li></ol>
        <button v-if="!historyEnd && allEvents.length" type="button" :disabled="historyLoading" @click="loadEarlier">{{ historyLoading ? '读取中…' : '更早的经历' }}</button>
      </section>
      <section v-if="tab === 'notes'" aria-label="此次记忆">
        <StoryMemoryStatus :chat-id="chatId" :busy="busy" :version="state?.version ?? 0" @source="readSource" />
        <h3>我的手记</h3>
        <p class="dossier-muted">只用于此次故事，作为共享背景提供给本故事人物。不要在这里填写只想告诉某个人的秘密。手记不会直接修改数值。</p>
        <ul class="story-notes"><li v-for="note in state?.notes" :key="note.id"><small>{{ noteLabels[note.kind] }}</small><p>{{ note.content }}</p><button type="button" :disabled="saving" @click="removeNote(note.id)">删除此条</button></li></ul>
        <form @submit.prevent="saveNote"><label for="story-note-kind">记录类型</label><select id="story-note-kind" v-model="noteKind"><option value="note">重要线索</option><option value="thread">未完成事项</option><option value="style">对话风格偏好</option></select><label for="story-note-content">记下什么</label><textarea id="story-note-content" v-model="noteText" maxlength="1000" rows="4" placeholder="例如：我喜欢克制的对白，给我回应的空间。" /><button type="submit" :disabled="saving || !noteText.trim()">{{ saving ? '正在保存…' : '保存到此次故事' }}</button><p v-if="noteStatus" role="status">{{ noteStatus }}</p></form>
      </section>
      </div>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onScopeDispose, useId } from 'vue';
import type { StoryStateView, StoryEventView, StoryNoteInput, StoryValue } from '../../../types/story-state';
import { storyApi } from '../../services/story.api';
import StoryLedgerDetails from './StoryLedgerDetails.vue';
import type { StoryLedgerSnapshot } from '../../utils/story-ledger';
import StoryMemoryStatus from './StoryMemoryStatus.vue';
import StoryAdaptationReport from './StoryAdaptationReport.vue';
const props = defineProps<{ ledger?: StoryLedgerSnapshot | null; initialTab?: 'state' | 'ledger'; chatId: string; state: StoryStateView | null; busy: boolean; loading?: boolean; error: string; trigger?: HTMLButtonElement | null; open: boolean }>();
const emit = defineEmits<{ refresh: []; source: [messageId: number]; 'update:open': [open: boolean] }>();
const expanded = computed(() => props.open);
const panelId = useId();
const closeButton = ref<HTMLButtonElement | null>(null);
const dialogPanel = ref<HTMLElement | null>(null);
let appWasInert = false;
let bodyOverflow = '';
let modalActive = false;
function closePanel() {
  emit('update:open', false);
}
async function openPanel() {
  if (props.open) return;
  emit('update:open', true);
  await nextTick();
  closeButton.value?.focus({ preventScroll: true });
}
function trapFocus(event: KeyboardEvent) {
  const panel = dialogPanel.value;
  if (!panel) return;
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
  )).filter(el => el.tabIndex >= 0 && el.checkVisibility?.({ visibilityProperty: true }) !== false);
  if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
}
watch(() => props.open, async active => {
  const app = document.getElementById('app');
  if (active && !modalActive) {
    modalActive = true;
    appWasInert = app?.inert ?? false;
    if (app) app.inert = true;
    bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else if (!active && modalActive) {
    modalActive = false;
    if (app) app.inert = appWasInert;
    document.body.style.overflow = bodyOverflow;
  }
  await nextTick();
  if (props.open === active) {
    if (active) closeButton.value?.focus({ preventScroll: true });
    else props.trigger?.focus({ preventScroll: true });
  }
}, { flush: 'sync' });
defineExpose({ openPanel, closePanel });
function readSource(messageId: number) {
  if (expanded.value) closePanel();
  emit('source', messageId);
}
const tab = ref('state');
watch(() => [props.open, props.initialTab], () => { if (props.open) tab.value = props.initialTab === 'ledger' && props.ledger ? 'ledger' : 'state'; }, { immediate: true });
watch(() => props.ledger, ledger => { if (!ledger && tab.value === 'ledger') tab.value = 'state'; });
const tabs = computed(() => [{ id: 'state', label: '概况' }, ...(props.ledger ? [{ id: 'ledger', label: '账簿' }] : []), ...(props.state?.map ? [{ id: 'map', label: '地图' }] : []), { id: 'history', label: '历程' }, { id: 'notes', label: '记忆' }]);
watch(() => props.state?.map, map => { if (!map && tab.value === 'map') tab.value = 'state'; });
const noteLabels = { style: '风格偏好', note: '重要线索', thread: '未完成事项' };
const factLabels = { claim: '主张 · 未证实', intention: '意向 · 非执行凭据', inference: '推测', observation: '叙事见闻', style: '表达偏好' };
const currentLocation = computed(() => props.state?.map?.nodes.find(node => node.id === props.state?.map?.location));
const recentFacts = computed(() => (props.state?.events ?? []).filter(event => event.status === 'confirmed').flatMap(event => (event.facts ?? []).map((fact, index) => ({
  id: `${event.id}:${index}`, fact, version: event.version,
  messageId: fact.speaker === 'player' ? event.inputMessageId : event.messageId,
}))));
const currentUnsettledEvent = computed(() => props.state?.events.find(event => event.version === props.state?.version && event.status !== 'confirmed'));
const noteKind = ref<StoryNoteInput['kind']>('note');
const noteText = ref('');
const noteStatus = ref('');
const saving = ref(false);
const earlier = ref<StoryEventView[]>([]);
const historyEnd = ref(false);
const historyLoading = ref(false);
const historyError = ref('');
const sourceId = ref('');
const sourceEvent = ref<StoryEventView | null>(null);
const sourceLoading = ref(false);
const sourceError = ref('');
let historyEpoch = 0;
let sourceEpoch = 0;
onScopeDispose(() => {
  historyEpoch++; sourceEpoch++;
  if (modalActive) {
    const app = document.getElementById('app');
    if (app) app.inert = appWasInert;
    document.body.style.overflow = bodyOverflow;
    modalActive = false;
  }
});
const allEvents = computed(() => [...new Map([...(props.state?.events ?? []), ...earlier.value].map(event => [event.id, event])).values()].sort((left, right) => right.version - left.version));
const displayValue = (value: StoryValue) => value === null ? '尚未确定' : typeof value === 'boolean' ? value ? '已确认' : '未达成' : String(value);
watch([() => props.chatId, () => props.state?.version], () => {
  historyEpoch++; earlier.value = []; historyEnd.value = false; historyError.value = ''; historyLoading.value = false;
});
watch(() => props.chatId, () => {
  tab.value = 'state'; closePanel();
  sourceEpoch++; sourceEvent.value = null; sourceId.value = ''; sourceError.value = ''; sourceLoading.value = false;
  noteText.value = ''; noteStatus.value = '';
});
async function loadEarlier() {
  if (historyLoading.value) return;
  const target = props.chatId;
  const current = ++historyEpoch;
  historyLoading.value = true;
  historyError.value = '';
  try {
    const response = await storyApi.events(target, allEvents.value.at(-1)?.version);
    if (target !== props.chatId || current !== historyEpoch) return;
    earlier.value.push(...response);
    historyEnd.value = response.length < 30;
  } catch { if (target === props.chatId && current === historyEpoch) historyError.value = '历程读取失败，已有记录仍保留。'; }
  finally { if (current === historyEpoch) historyLoading.value = false; }
}
async function showSource(eventId: string) {
  if (!eventId) return;
  const target = props.chatId;
  const current = ++sourceEpoch;
  sourceId.value = eventId;
  sourceEvent.value = null;
  sourceError.value = '';
  tab.value = 'history';
  void openPanel();
  sourceLoading.value = true;
  try {
    const event = await storyApi.event(target, eventId);
    if (target !== props.chatId || current !== sourceEpoch) return;
    if (!event || event.id !== eventId) throw new Error('Missing source');
    sourceEvent.value = event;
    await nextTick();
    if (target !== props.chatId || current !== sourceEpoch) return;
    const sourceElement = document.getElementById('story-source-event');
    sourceElement?.scrollIntoView({ block: 'nearest' });
    sourceElement?.focus({ preventScroll: true });
  } catch {
    if (target === props.chatId && current === sourceEpoch) sourceError.value = '暂时无法读取这条依据，原状态没有改变。';
  } finally {
    if (current === sourceEpoch) sourceLoading.value = false;
  }
}
async function saveNote() {
  const target = props.chatId;
  const submitted = noteText.value;
  saving.value = true; noteStatus.value = '';
  try {
    await storyApi.addNote(target, { kind: noteKind.value, content: submitted.trim() });
    if (target !== props.chatId) return;
    if (noteText.value === submitted) noteText.value = '';
    noteStatus.value = '已保存到此次故事。'; emit('refresh');
  } catch (failure) { if (target === props.chatId) noteStatus.value = failure instanceof Error ? failure.message : '保存失败，文字已保留。'; }
  finally { saving.value = false; }
}
async function removeNote(noteId: string) {
  const target = props.chatId;
  saving.value = true;
  try { await storyApi.removeNote(target, noteId); if (target === props.chatId) { noteStatus.value = '已删除此条记录。'; emit('refresh'); } }
  catch { if (target === props.chatId) noteStatus.value = '删除失败，请重试。'; }
  finally { saving.value = false; }
}
</script>

<style scoped lang="scss">
.story-dossier-layer { position: fixed; inset: 0; z-index: 1200; }
.story-dossier-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: rgb(0 0 0 / 48%); cursor: default; }
.story-dossier { position: absolute; inset: 0 0 0 auto; width: min(420px, calc(100vw - 24px)); height: 100dvh; overflow: hidden; background: var(--bg-surface); border-left: 1px solid var(--border-default); color: var(--text-primary); box-shadow: -12px 0 36px rgb(0 0 0 / 20%); }
.dossier-body { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding: 26px 22px; overflow: hidden; }
.dossier-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.dossier-heading header { min-width: 0; }
.dossier-close { display: block; flex: 0 0 auto; }
h2 { font-family: Georgia, 'Noto Serif SC', serif; font-size: 24px; margin: 10px 0; font-weight: 500; }
h3 { font-size: 15px; margin: 8px 0; }
p { font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
.dossier-eyebrow, .dossier-muted, header p, small { color: var(--text-secondary); font-size: 12px; }
.dossier-eyebrow { letter-spacing: .1em; }
nav { display: flex; border-bottom: 1px solid var(--border-default); margin: 22px 0; }
button { border: 1px solid var(--border-default); background: transparent; color: var(--accent); border-radius: 5px; padding: 8px 10px; cursor: pointer; min-height: 40px; }
button:disabled { opacity: .5; cursor: default; }
nav button { flex: 1; border: 0; border-radius: 0; color: var(--text-secondary); }
nav button[aria-pressed='true'] { color: var(--text-primary); box-shadow: inset 0 -2px var(--accent); }
.dossier-content { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.state-badge { font-size: 11px; color: var(--text-secondary); border: 1px solid var(--border-default); border-radius: 20px; padding: 4px 8px; }
.state-refresh { font-size: 12px; margin: 6px 0; }
.current-location { padding: 16px; margin: 14px 0; border: 1px solid var(--border-default); border-left: 3px solid var(--accent); border-radius: 8px; background: var(--accent-wash); }
.current-location strong { display: block; font-family: Georgia, 'Noto Serif SC', serif; font-size: 20px; font-weight: 500; margin: 8px 0; overflow-wrap: anywhere; }
.current-location button { font-size: 12px; }
.current-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.state-empty { margin-bottom: 0; font-size: 14px; }
.state-loading { color: var(--text-secondary); font-size: 12px; line-height: 1.8; }
.state-loading span { display: block; height: 28px; margin: 12px 0; border-radius: 5px; background: var(--bg-subtle); }
.story-reference { margin-top: 26px; padding-top: 16px; border-top: 1px solid var(--border-default); }
.dossier-disclosure { margin: 16px 0; border: 1px solid var(--border-default); border-radius: 8px; padding: 0 12px; }
summary { cursor: pointer; font-size: 13px; padding: 13px 0; min-height: 44px; box-sizing: border-box; overflow-wrap: anywhere; }
summary span { color: var(--text-secondary); font-size: 11px; margin-left: 6px; }
.unsettled-events { margin-top: 16px; text-align: left; font-size: 12px; width: 100%; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.story-facts { margin: 0; }
.story-facts div { padding: 14px 0; border-bottom: 1px solid var(--border-default); }
dt { font-size: 12px; color: var(--text-secondary); }
dd { margin: 5px 0 0; font-size: 20px; overflow-wrap: anywhere; }
dd button, .fact-origin { display: block; font-size: 11px; margin-top: 5px; color: var(--text-secondary); }
dd small { margin-left: 5px; }
.story-map, .story-history, .story-notes { list-style: none; padding: 0; }
.story-map li, .story-history li, .story-notes li { padding: 15px 12px; margin: 12px 0; border: 1px solid var(--border-default); border-radius: 8px; overflow-wrap: anywhere; }
.story-map li.here { border-color: var(--accent); background: var(--accent-wash); }
.source-event { border: 1px solid var(--accent); border-radius: 8px; padding: 14px 12px; margin: 12px 0; }
.story-map li>span { display: block; font-size: 12px; margin-top: 5px; color: var(--accent); }
label { display: block; margin: 14px 0 6px; font-size: 13px; }
select, textarea { width: 100%; box-sizing: border-box; background: var(--bg-subtle); color: var(--text-primary); border: 1px solid var(--border-interactive); border-radius: 5px; padding: 10px; font: inherit; font-size: 14px; }
textarea { resize: vertical; }
form>button { margin-top: 12px; }
@include below(lg) {
  .story-dossier { inset: auto 0 0; width: 100%; height: min(72dvh, 680px); border: 1px solid var(--border-default); border-bottom: 0; border-radius: 16px 16px 0 0; box-shadow: 0 -12px 36px rgb(0 0 0 / 24%); }
  .dossier-body { padding: 18px 20px max(16px, env(safe-area-inset-bottom)); }
  .dossier-heading { flex-shrink: 0; }
  header .dossier-eyebrow { display: none; }
  header h2 { font-size: 20px; margin: 0 0 4px; }
  header p { margin: 0; }
  nav { flex-shrink: 0; margin: 14px 0; }
  nav button { min-height: 44px; }
  .current-location { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 12px; margin: 10px 0; }
  .current-location strong { grid-column: 1; margin: 0; }
  .current-location button { grid-column: 2; grid-row: 1 / 3; align-self: center; }
}
</style>
