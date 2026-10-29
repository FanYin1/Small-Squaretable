<template>
  <button ref="trigger" type="button" class="correction-trigger" @click="openFor()">纠正与分支</button>
  <el-dialog v-model="opened" title="保留原档，认真回应每一次选择" class="story-correction-dialog" width="min(720px, 96vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" @closed="restoreFocus">
    <p class="correction-intro">阅读标注只属于你；改变已经发生的事，会另建独立分支。原档与已有消费保留。</p>
    <el-radio-group v-model="operation" aria-label="纠正操作" :disabled="busy || !!pending">
      <el-radio-button value="annotation">阅读标注</el-radio-button>
      <el-radio-button value="layout">段落排版</el-radio-button>
      <el-radio-button value="branch">纠正 / 改变选择</el-radio-button>
    </el-radio-group>
    <el-form label-position="top" :disabled="busy || !!pending" @submit.prevent>
      <el-form-item label="原文位置（当前已载入的消息）">
        <el-select v-model="selectedId" aria-label="原文位置" filterable @change="preview = null">
          <el-option v-for="message in messages" :key="message.id" :value="Number(message.id)" :label="`#${message.id} ${message.content.slice(0, 80)}`" />
        </el-select>
      </el-form-item>
      <details v-if="selected"><summary>查看原文</summary><pre class="correction-excerpt">{{ selected.content }}</pre></details>
      <template v-if="operation === 'branch'">
        <el-form-item label="分支用途">
          <el-select v-model="mode" aria-label="分支用途">
            <el-option value="choice" label="改变过去的选择" /><el-option value="evidenced" label="引用依据进行修正" />
            <el-option value="conflict" label="依据冲突，选择本分支的解释" /><el-option value="adaptation" label="主动改编（不宣称原作错误）" />
          </el-select>
        </el-form-item>
        <el-form-item label="从哪里另作选择（保留到此轮结束）">
          <el-select v-model="throughVersion" aria-label="分叉位置" :loading="loadingEvents">
            <el-option :value="0" label="开场之后，首次行动之前" />
            <el-option v-for="event in boundaries" :key="event.id" :value="event.version" :label="`第 ${event.version} 个事件之后 · ${event.excerpt.slice(0, 60)}`" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="mode === 'evidenced' || mode === 'conflict'" label="引用本档可见原文（冲突解释至少两条）">
          <el-select v-model="evidenceIds" multiple :multiple-limit="8" aria-label="修正依据">
            <el-option v-for="message in messages" :key="message.id" :value="Number(message.id)" :label="`#${message.id} ${message.content.slice(0, 80)}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="希望新分支如何发展">
          <el-input v-model="direction" type="textarea" :rows="4" :maxlength="2000" aria-label="新分支方向" />
        </el-form-item>
      </template>
      <template v-else>
        <p v-if="operation === 'layout'">仅允许调整已有非空段落之间的空行，保留所有文字。需要换措辞或改变事实时，请建立纠正分支。只接受未开始后续轮次的最新回复。</p>
        <el-button v-if="operation === 'layout' && selected" @click="readingText = selected.content.split('\n').filter(line => line.trim()).join('\n\n')">从原文生成段落间距候选</el-button>
        <el-form-item :label="operation === 'annotation' ? '仅供阅读的标注（不进入剧情记忆）' : '排版候选（预览后采用）'">
          <el-input v-model="readingText" type="textarea" :rows="5" :maxlength="operation === 'annotation' ? 2000 : 50000" aria-label="阅读修订内容" />
        </el-form-item>
      </template>
    </el-form>
    <section v-if="preview" class="correction-preview" aria-label="分支影响预览">
      <h3>确认前，看看会发生什么</h3>
      <p>保留 {{ preview.retainedMessages }} 条消息，到第 {{ preview.throughVersion }} 个事件结束；之后 {{ preview.discardedMessages }} 条消息与 {{ preview.discardedEvents }} 个事件不带入新分支。</p>
      <dl v-if="preview.fields.length"><template v-for="field in preview.fields" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }} {{ field.unit }}</dd></template></dl>
      <p v-else>此卡没有可验证的可见数值，不补造资产或地图。</p>
      <p>卡、世界书与开局身份使用原档冻结版本；摘要与人物记忆只从保留前缀重新整理。未来经历、情绪、旧笔记和阅读标注不继承，笔记可在新分支重新添加。</p>
      <p>你指定的方向不会立即改变数值或人物知情。引用是你提供的依据，平台未自动证明事实；后续行动仍须遵守规则。创建本身不调用模型、不产生生成费用。</p>
      <details v-if="preview.evidence.length"><summary>核对所引依据</summary><pre v-for="item in preview.evidence" :key="item.id" class="correction-excerpt">#{{ item.id }} {{ item.content }}</pre></details>
    </section>
    <section v-if="readingPreview" class="correction-preview" aria-label="阅读修订预览"><h3>即将保存的{{ operation === 'annotation' ? '标注' : '阅读排版' }}</h3><pre class="correction-excerpt">{{ readingPreview }}</pre><p>原始消息与模型上下文保持原文；可随时撤销。</p></section>
    <p v-if="error" role="alert" class="correction-error">{{ error }}</p>
    <p v-if="pending" role="status">提交结果尚未确认。请查回原请求，避免重复创建；离开后再次打开可继续查回。</p>
    <template #footer>
      <el-button :disabled="busy" @click="opened = false">暂不修改</el-button>
      <el-button v-if="pending" :loading="busy" @click="recover">查回创建结果</el-button>
      <el-button v-else-if="operation === 'branch' && preview" type="primary" :loading="busy" @click="commit">确认，保留原档并建立分支</el-button>
      <el-button v-else-if="readingPreview" type="primary" :loading="busy" @click="saveReading">确认保存阅读修订</el-button>
      <el-button v-else type="primary" :loading="busy" @click="review">预览影响</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ApiError } from '@client/services/api';
import { useRouter } from 'vue-router';
import { storyApi } from '@client/services/story.api';
import { chatApi } from '@client/services/chat.api';
import { useChatStore } from '@client/stores/chat';
import { useStoryDraft } from '@client/composables/useStoryDraft';
import type { Message } from '@client/types';
import type { StoryBranchInput, StoryBranchPreview, StoryReading } from '../../../types/story-corrections';
import type { StoryEventView } from '../../../types/story-state';

const props = defineProps<{ chatId: string; ownerId: string; messages: Message[] }>();
const emit = defineEmits<{ readings: [StoryReading[]] }>();
const router = useRouter();
const store = useChatStore();
const opened = ref(false);
const trigger = ref<HTMLButtonElement>();
let focusOrigin: HTMLElement | null = null;
const operation = ref<'annotation' | 'layout' | 'branch'>('annotation');
const selectedId = ref<number>();
const selected = computed(() => props.messages.find(message => Number(message.id) === selectedId.value));
const mode = ref<StoryBranchInput['mode']>('choice');
const throughVersion = ref(0);
const evidenceIds = ref<number[]>([]);
const draftKey = computed(() => `story-correction:${props.ownerId}:${props.chatId}`);
const { text: draft, captureAcknowledgement } = useStoryDraft(draftKey);
const direction = ref('');
const readingText = ref('');
const readingPreview = ref('');
const readingRequestId = ref('');
const preview = ref<StoryBranchPreview | null>(null);
const events = ref<StoryEventView[]>([]);
const boundaries = computed(() => events.value.filter(event => event.status === 'confirmed' &&
  !events.value.some(other => other.inputMessageId === event.inputMessageId && (other.version > event.version || other.status !== 'confirmed'))));
const loadingEvents = ref(false);
const busy = ref(false);
const error = ref('');
const pending = ref<StoryBranchInput | null>(null);
let pendingDigest = '';
let alive = true;
onBeforeUnmount(() => { alive = false; });
const scope = () => alive ? `${props.ownerId}:${props.chatId}` : 'unmounted';
const describeError = (caught: unknown) => caught instanceof Error ? caught.message : '操作失败，草稿已保留，请重试。';

async function refreshReadings() {
  const originalScope = scope();
  try {
    const response = await storyApi.readings(props.chatId);
    if (originalScope === scope()) emit('readings', response);
  } catch (caught) { if (originalScope === scope()) error.value = describeError(caught); }
}

watch(draftKey, () => {
  opened.value = false; preview.value = null; pending.value = null; error.value = ''; emit('readings', []);
  try {
    const saved = JSON.parse(draft.value || '{}');
    direction.value = saved.direction ?? ''; readingText.value = saved.readingText ?? '';
    pending.value = saved.pending ?? null; pendingDigest = saved.pendingDigest ?? '';
    operation.value = saved.operation ?? 'annotation'; mode.value = saved.mode ?? 'choice';
    throughVersion.value = saved.throughVersion ?? 0; selectedId.value = saved.selectedId; evidenceIds.value = saved.evidenceIds ?? [];
    readingRequestId.value = saved.readingRequestId ?? '';
  } catch { direction.value = ''; readingText.value = ''; }
  void refreshReadings();
}, { immediate: true, flush: 'sync' });
watch([direction, readingText, operation, mode, throughVersion, selectedId, evidenceIds, pending, readingRequestId], () => {
  draft.value = JSON.stringify({ direction: direction.value, readingText: readingText.value, operation: operation.value, mode: mode.value,
    throughVersion: throughVersion.value, selectedId: selectedId.value, evidenceIds: evidenceIds.value, pending: pending.value, pendingDigest, readingRequestId: readingRequestId.value });
  preview.value = null; readingPreview.value = '';
}, { deep: true, flush: 'sync' });
watch([readingText, operation, selectedId], () => { readingRequestId.value = ''; }, { flush: 'sync' });

async function openFor(messageId?: number) {
  focusOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!pending.value && messageId) selectedId.value = messageId;
  if (!selectedId.value) selectedId.value = Number(props.messages.at(-1)?.id) || undefined;
  opened.value = true; error.value = ''; loadingEvents.value = true;
  const originalScope = scope();
  try {
    const loaded: StoryEventView[] = [];
    let before: number | undefined;
    while (loaded.length <= 2000) {
      const response = await storyApi.events(props.chatId, before);
      const page = response;
      if (originalScope !== scope()) return;
      loaded.push(...page);
      if (page.length < 30) break;
      before = page.at(-1)!.version;
    }
    events.value = loaded;
  } catch (caught) { if (originalScope === scope()) error.value = describeError(caught); }
  finally { if (originalScope === scope()) loadingEvents.value = false; }
}
function restoreFocus() { void nextTick(() => (focusOrigin?.isConnected ? focusOrigin : trigger.value)?.focus()); }

async function review() {
  error.value = '';
  if (operation.value !== 'branch') {
    if (!selected.value || !readingText.value.trim()) { error.value = '请选择原文并填写内容。'; return; }
    if (!readingRequestId.value) readingRequestId.value = crypto.randomUUID();
    readingPreview.value = operation.value === 'annotation' ? readingText.value.trim() : readingText.value; return;
  }
  const input: StoryBranchInput = { requestId: crypto.randomUUID(), throughVersion: throughVersion.value, mode: mode.value,
    direction: direction.value.trim(), evidenceIds: evidenceIds.value };
  busy.value = true;
  const originalScope = scope();
  try {
    const response = await storyApi.previewBranch(props.chatId, input);
    if (originalScope === scope()) { preview.value = response; reviewedInput = input; }
  } catch (caught) { if (originalScope === scope()) error.value = describeError(caught); }
  finally { if (originalScope === scope()) busy.value = false; }
}
let reviewedInput: StoryBranchInput | null = null;
async function navigate(id: string, originalScope: string) {
  if (originalScope !== scope()) return;
  const clearSubmittedDraft = captureAcknowledgement();
  await router.push({ name: 'ChatSession', params: { chatId: id } });
  clearSubmittedDraft();
  if (originalScope === scope()) { pending.value = null; draft.value = ''; opened.value = false; }
  void store.fetchChats().catch(() => {});
}
async function commit() {
  if (!preview.value || !reviewedInput) return;
  const input = reviewedInput;
  const expected = preview.value.digest;
  pendingDigest = expected; pending.value = input;
  busy.value = true; const originalScope = scope();
  try {
    const response = await storyApi.createBranch(props.chatId, input, expected);
    await navigate(response.chatId, originalScope);
  } catch (caught) {
    if (originalScope === scope()) {
      error.value = describeError(caught);
      if (caught instanceof ApiError && caught.status >= 400 && caught.status < 500) pending.value = null;
    }
  }
  finally { if (originalScope === scope()) busy.value = false; }
}
async function recover() {
  if (!pending.value) return;
  busy.value = true; const originalScope = scope(); const input = pending.value;
  try {
    const response = await chatApi.getCreationStatus(input.requestId);
    if (originalScope !== scope()) return;
    if (response.status === 'created') await navigate(response.chatId, originalScope);
    else if (response.status === 'deleted') { pending.value = null; error.value = '该请求创建的分支已删除，不会自动重建。'; }
    else {
      const result = await storyApi.createBranch(props.chatId, input, pendingDigest);
      await navigate(result.chatId, originalScope);
    }
  } catch (caught) {
    if (originalScope === scope()) {
      error.value = describeError(caught);
      if (caught instanceof ApiError && caught.status >= 400 && caught.status < 500) pending.value = null;
    }
  }
  finally { if (originalScope === scope()) busy.value = false; }
}
async function saveReading() {
  if (!selectedId.value || !readingPreview.value || operation.value === 'branch') return;
  const originalScope = scope(); busy.value = true;
  try {
    await storyApi.saveReading(props.chatId, { requestId: readingRequestId.value, messageId: selectedId.value, kind: operation.value, content: readingPreview.value });
    if (originalScope === scope()) { readingText.value = ''; readingRequestId.value = ''; readingPreview.value = ''; opened.value = false; await refreshReadings(); }
  } catch (caught) { if (originalScope === scope()) error.value = describeError(caught); }
  finally { if (originalScope === scope()) busy.value = false; }
}
defineExpose({ openFor, refreshReadings });
</script>

<style scoped>
.correction-trigger { border: 1px solid var(--el-border-color); border-radius: 10px; padding: 8px 12px; color: var(--el-text-color-primary); background: var(--el-bg-color); cursor: pointer; }
.correction-intro { line-height: 1.8; color: var(--el-text-color-secondary); }
.el-form { margin-top: 20px; }
.el-select { width: 100%; }
.correction-excerpt { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; font: inherit; line-height: 1.8; }
.correction-preview { padding: 18px; margin-top: 16px; border: 1px solid var(--el-color-primary-light-5); border-radius: 14px; background: var(--el-fill-color-light); line-height: 1.8; }
.correction-preview h3 { margin-top: 0; font-size: 16px; }
.correction-preview dl { display: grid; grid-template-columns: 1fr 1fr; }
.correction-error { color: var(--el-color-danger); }
@media (max-width: 600px) { :deep(.el-radio-group) { display: flex; flex-wrap: wrap; gap: 5px; } }
</style>
