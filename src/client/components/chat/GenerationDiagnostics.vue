<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { api } from '../../services/api';
import { generationStageLabels, type GenerationTraceList, type GenerationTrace } from '../../../types/generation-trace';
import { storyValidationMessage } from '../../../types/story-intent';
const props = defineProps<{ chatId: string; ownerId: string }>();
const records = ref<GenerationTrace[]>([]);
const loading = ref(false), error = ref(''), exportError = ref('');
const retention = ref({ hours: 168, limit: 30 });
let sequence = 0;
async function load() {
  const ticket = ++sequence;
  records.value = []; error.value = ''; exportError.value = ''; loading.value = true;
  try {
    const result = await api.get<GenerationTraceList>(`/chats/${props.chatId}/generation-traces`);
    if (ticket !== sequence) return;
    records.value = result.traces;
    retention.value = { hours: result.retentionHours, limit: result.limit };
  } catch { if (ticket === sequence) error.value = '执行记录暂时无法读取，请重试。'; }
  finally { if (ticket === sequence) loading.value = false; }
}
function download(record: GenerationTrace) {
  exportError.value = '';
  let url: string | undefined;
  try {
    url = URL.createObjectURL(new Blob([JSON.stringify({ chatId: props.chatId, ...record }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `generation-${record.id}.json`;
    document.body.append(link); link.click(); link.remove();
  } catch { exportError.value = '导出失败，请重试。'; }
  finally { if (url) setTimeout(() => URL.revokeObjectURL(url!), 1000); }
}
watch(() => [props.chatId, props.ownerId], load, { immediate: true });
onBeforeUnmount(() => { sequence++; });
const statusLabels = { completed: '流程完成', failed: '流程失败', stopped: '已停止' };
const states = { confirmed: '已确认', interrupted: '未确认片段', proposed: '候选行动', unknown: '未记录' };
</script>
<template>
  <section class="generation-diagnostics" aria-label="生成结果与错误回溯">
    <h3>生成结果与错误回溯</h3>
    <p>记录已授权请求的准备阶段失败及单人生成结果。最多 {{ retention.limit }} 条，保留 {{ retention.hours }} 小时。进程崩溃、记录写入失败或过期可能导致缺失；没有记录不代表成功。</p>
    <button type="button" :disabled="loading" @click="load">刷新执行记录</button>
    <p v-if="loading" role="status">正在读取执行记录…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!records.length">暂无执行记录。旧错误不会自动补录或重放。</p>
    <p v-if="exportError" role="alert">{{ exportError }}</p>
    <details v-for="record in records" :key="record.id">
      <summary>{{ new Date(record.finishedAt).toLocaleString() }} · {{ statusLabels[record.status] }} · {{ record.model }}</summary>
      <dl>
        <dt>诊断编号</dt><dd>{{ record.id }}</dd>
        <dt>请求 / 生成编号</dt><dd>{{ record.requestId }} / {{ record.generationId ?? '尚未创建' }}</dd>
        <dt>输入 / 回复消息</dt><dd>{{ record.userMessageId ?? '未保存' }} / {{ record.assistantMessageId ?? '未记录保存成功' }}</dd>
        <dt>最后阶段或故障阶段</dt><dd>{{ generationStageLabels[record.stage] }}</dd>
        <dt>流程错误码 / HTTP</dt><dd>{{ record.errorCode ?? '无' }} / {{ record.httpStatus ?? '未记录' }}<span v-if="record.errorCategory"> · {{ record.errorCategory }}</span></dd>
        <dt>剧情状态 / 生成结果落库</dt><dd>{{ states[record.stateStatus ?? 'unknown'] }} / {{ record.outcomePersisted ? '已完成' : '未完成或不适用' }}</dd>
        <dt>总耗时</dt><dd>{{ record.durationMs }} ms</dd>
        <template v-if="record.response">
          <dt>上游结束原因 / 输出字符数</dt><dd>{{ record.response.finishReason ?? '未取得' }} / {{ record.response.characters }}</dd>
          <dt>首片段 / 首段可见正文</dt><dd>{{ record.response.firstTokenMs ?? '未记录' }} / {{ record.response.firstVisibleMs ?? '未记录' }} ms（前者从上游调用开始，后者从单人处理开始）</dd>
          <dt>流不完整 / 输出截断</dt><dd>{{ record.response.streamIncomplete ? '是' : '否' }} / {{ record.response.outputTruncated ? '是' : '否' }}</dd>
          <dt>响应指纹</dt><dd>{{ record.response.sha256 }}</dd>
        </template>
      </dl>
      <p v-if="record.contextFailure">容量拒绝：{{ record.contextFailure.reason }}；所需 {{ record.contextFailure.requiredTokens }} / 可用 {{ record.contextFailure.availableTokens }} token；总窗口 {{ record.contextFailure.contextWindow }}，输出预留 {{ record.contextFailure.outputTokens }}。</p>
      <p v-if="record.usage">供应商报告用量：输入 {{ record.usage.promptTokens ?? '未提供' }} / 输出 {{ record.usage.completionTokens ?? '未提供' }} / 总计 {{ record.usage.totalTokens ?? '未提供' }} token。缺失项不补造，实际结算另按账本规则。</p>
      <section v-if="record.validation">
        <p>校验：{{ record.validation.result }} · {{ record.validation.code ?? '无错误码' }}</p>
        <p v-if="record.validation.result === 'failed'">{{ storyValidationMessage(record.validation) }}</p>
        <p v-if="record.validation.jsonFailure">JSON：{{ record.validation.jsonFailure.kind }}；偏移 {{ record.validation.jsonFailure.offset ?? '未知' }} / 长度 {{ record.validation.jsonFailure.length }}；字符类别 {{ record.validation.jsonFailure.token ?? '未知' }}。</p>
        <p v-if="record.validation.protocolFailure">控制标签：{{ record.validation.protocolFailure.kind }}；控制区 {{ record.validation.protocolFailure.controlCharacters }} 字符；尾随 {{ record.validation.protocolFailure.trailingCharacters }} 字符。</p>
        <ul v-if="record.validation.schemaIssues?.length"><li v-for="(issue, index) in record.validation.schemaIssues" :key="index">字段 {{ issue.path }}：{{ issue.code }}</li></ul>
        <p v-if="record.validation.warnings.length">兼容与降级：{{ record.validation.warnings.join('、') }}</p>
      </section>
      <ol><li v-for="(event, index) in record.events" :key="index">{{ event.elapsedMs }} ms · {{ generationStageLabels[event.stage] }}</li></ol>
      <p>关联提示词诊断：{{ record.promptTraceIds.join('、') || '尚未组装请求或未记录' }}。提示词明细仅保留 24 小时，可能先于执行记录过期。</p>
      <details v-if="record.stackFrames.length"><summary>应用错误位置</summary><ul><li v-for="frame in record.stackFrames" :key="frame"><code>{{ frame }}</code></li></ul></details>
      <button type="button" @click="download(record)">导出此轮诊断 JSON</button>
      <p>导出包含编号和脱敏诊断，不含聊天正文、控制原文、密钥或上游错误原文。响应指纹用于比对，不能还原内容；导出不会重试或推进剧情。</p>
    </details>
  </section>
</template>
<style scoped>
.generation-diagnostics { margin-top: 20px; border-top: 1px solid var(--border-default); padding-top: 12px; overflow-wrap: anywhere; }
h3 { font-size: 16px; } p, dt { color: var(--text-secondary); }
details { margin-block: 12px; padding-block: 8px; border-top: 1px solid var(--border-default); }
summary { cursor: pointer; } dt { margin-top: 8px; } dd { margin: 0; }
button { padding: 10px; background: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: 6px; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
</style>
