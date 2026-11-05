<template>
  <StoryWorkspaceDrawer :open="visible" :return-focus="returnFocus" title="本轮上下文诊断" @update:open="visible = $event">
    <div class="prompt-trace-view">
      <p>查看实际生成时留下的记录，不会重新扫描世界书或调用模型。仅显示来源和用量，不展示设定正文、关键词或聊天内容。</p>
      <button type="button" :disabled="loading" @click="load">刷新记录</button>
      <p v-if="loading" role="status">正在读取诊断…</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <p v-else-if="!traces.length">暂无记录。仅记录启用此功能后、已完成上游请求组装的单人对话；旧轮次、前置失败及过期记录不能回溯。诊断存储故障或容量保护也可能导致记录缺失，不影响聊天。</p>
      <template v-else>
        <p>最多保留最近 {{ retention.limit }} 次，最长 {{ retention.hours }} 小时。记录表示请求已组装，不代表模型成功回复或剧情已保存。</p>
        <label>选择请求
          <select v-model="selectedId">
            <option v-for="item in traces" :key="item.id" :value="item.id">{{ formatTime(item.capturedAt) }} · 消息 #{{ item.userMessageId }} · {{ item.model }}</option>
          </select>
        </label>
        <article v-if="selected">
          <dl>
            <dt>请求 ID</dt><dd>{{ selected.requestId || '旧式请求未分配' }}</dd>
            <dt>模型 / 接口</dt><dd>{{ selected.model }} / {{ selected.transport.adapter }}</dd>
            <dt>布局 / 模板</dt><dd>{{ selected.assembly?.layout ?? '未记录' }} / {{ selected.template }}</dd>
            <dt>上下文容量</dt><dd>{{ selected.budget.contextWindow.toLocaleString() }} token</dd>
            <dt>输入上限 / 本次输出预留</dt><dd>{{ selected.budget.maxInputTokens?.toLocaleString() ?? '按总窗口计算' }} / {{ selected.budget.outputTokens.toLocaleString() }}</dd>
            <dt>本次输入估算 / 可用输入</dt><dd>{{ selected.budget.estimatedInputTokens.toLocaleString() }} / {{ selected.budget.availableInputTokens.toLocaleString() }} token</dd>
            <dt>历史消息</dt><dd>读取 {{ selected.history.supplied }} 条，选入 {{ selected.history.retained }} 条，本次省略 {{ selected.history.omitted }} 条</dd>
            <dt>派生摘要</dt><dd>{{ selected.history.summarized ? `已加入，估算 ${selected.history.summaryTokens} token` : '未加入' }}</dd>
            <dt>绑定版本</dt><dd>角色内容 {{ selected.snapshots.content ?? '旧式未冻结' }} / 世界书 {{ selected.snapshots.worldbook ?? '旧式未冻结' }}</dd>
          </dl>
          <p>token 为保守估算，不是供应商账单。深度注入预留 {{ selected.budget.depthReservedTokens }}，安全余量 {{ selected.budget.bufferTokens }}；已计入容量，不要重复相加。</p>
          <details>
            <summary>消息顺序（{{ selected.messageCount }} 条）</summary>
            <p>这是适配器转换前、裁剪及深度注入后的应用消息顺序。模板和原生接口会改变上游封装。</p>
            <ol>
              <li v-for="message in selected.messages" :key="message.index">
                #{{ message.index }} {{ message.role }} · {{ sourceLabel(message.source) }}<span v-if="message.messageId != null"> · 消息 #{{ message.messageId }}</span><span v-if="message.depth != null"> · 深度 {{ message.depth }}</span>
                <small>{{ message.characters }} 字符 / 约 {{ message.estimatedTokens }} token</small>
              </li>
            </ol>
            <p v-if="selected.omittedMessageDetails">另 {{ selected.omittedMessageDetails }} 条明细未保留，消息未因此被裁剪。</p>
            <p>选入历史 ID：{{ selected.history.retainedIds.join('、') || '无' }}</p>
            <p>本次省略历史 ID：{{ selected.history.omittedIds.join('、') || '无' }}（每组最多列出 200 条，原历史未删除）</p>
          </details>
          <details v-if="selected.assembly">
            <summary>提示词来源与记忆</summary>
            <p>以下为开局模式投影及平台控制协议追加之前的组装分段；分段估算不等于最终消息总量。</p>
            <ul><li v-for="(section, index) in selected.assembly.sections" :key="index">{{ sourceLabel(section.source) }} · {{ section.placement === 'system' ? '主系统段' : '动态注入段' }} · 约 {{ section.estimatedTokens }} token</li></ul>
            <p>选入记忆 {{ selected.assembly.memoryCount }} 条，ID：{{ selected.assembly.memoryIds.join('、') || '无' }}</p>
            <p>开局模式投影：{{ selected.sourceProjectionApplied ? '已应用' : '未应用' }}</p>
          </details>
          <details v-if="selected.assembly?.worldbook">
            <summary>本次世界书扫描</summary>
            <p>扫描器 v{{ selected.assembly.worldbook.version }} · 扫描 {{ selected.assembly.worldbook.scanned }} 条 / 激活 {{ selected.assembly.worldbook.activated }} 条。</p>
            <p>预算 {{ selected.assembly.worldbook.budgetUsed }} / {{ selected.assembly.worldbook.budgetLimit }} {{ selected.assembly.worldbook.budgetUnit === 'characters' ? '字符（旧版）' : '估算 token' }}。</p>
            <p v-if="selected.assembly.worldbook.version === 2">消息窗口 {{ selected.assembly.worldbook.scanMessageCount }}，最多 {{ selected.assembly.worldbook.maxRecursionDepth }} 次扫描迭代。</p>
            <p v-else>旧版没有逐条排除记录，不用新版重新扫描补造原因。</p>
            <p v-if="selected.assembly.worldbook.constantBudgetOverflow">常驻规则超出世界书软预算；最终请求仍受模型容量限制。</p>
            <ul><li v-for="decision in selected.assembly.worldbook.decisions" :key="decision.entryId"><code>{{ decision.entryId }}</code> · {{ reasonLabel(decision.reason) }}<small v-if="decision.unsupported?.length">未实现的计时字段：{{ decision.unsupported.join('、') }}</small></li></ul>
            <p v-if="selected.assembly.worldbook.omittedDecisions">另 {{ selected.assembly.worldbook.omittedDecisions }} 条诊断未保留，不影响实际扫描。</p>
          </details>
          <details>
            <summary>版本与请求指纹</summary>
            <p>上游请求体：{{ selected.transport.bodyBytes }} 字节；SHA-256：<code>{{ selected.transport.bodySha256 }}</code></p>
            <p>世界书快照：<code>{{ selected.assembly?.worldbook?.revision ?? '未记录' }}</code></p>
            <p>身份快照：<code>{{ selected.snapshots.identityRevision ?? '未冻结' }}</code></p>
          </details>
        </article>
      </template>
    </div>
  </StoryWorkspaceDrawer>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import StoryWorkspaceDrawer from './StoryWorkspaceDrawer.vue';
import { promptTraceApi } from '../../services/prompt-trace.api';
import type { PromptTrace } from '../../../types/prompt-trace';
const props = defineProps<{ chatId: string; ownerId: string; returnFocus?: HTMLElement }>();
const visible = defineModel<boolean>({ required: true });
const traces = ref<PromptTrace[]>([]);
const loading = ref(false);
const error = ref('');
const selectedId = ref('');
const retention = ref({ hours: 24, limit: 10 });
const selected = computed(() => traces.value.find(trace => trace.id === selectedId.value));
let sequence = 0;
async function load() {
  const ticket = ++sequence;
  const chatId = props.chatId, ownerId = props.ownerId;
  traces.value = []; selectedId.value = ''; error.value = ''; loading.value = true;
  try {
    const result = await promptTraceApi.list(chatId);
    if (ticket !== sequence || !visible.value || chatId !== props.chatId || ownerId !== props.ownerId) return;
    traces.value = result.traces;
    selectedId.value = result.traces[0]?.id ?? '';
    retention.value = { hours: result.retentionHours, limit: result.limit };
  } catch {
    if (ticket === sequence) error.value = '诊断暂时无法读取，请重试。';
  } finally { if (ticket === sequence) loading.value = false; }
}
watch(() => [visible.value, props.chatId, props.ownerId], () => {
  sequence++; traces.value = []; error.value = ''; selectedId.value = ''; loading.value = false;
  if (visible.value && props.chatId && props.ownerId) void load();
}, { immediate: true });
onBeforeUnmount(() => { sequence++; });
const formatTime = (time: string) => new Date(time).toLocaleString();
const sources: Record<string, string> = { card: '角色设定', examples: '示例对话', memories: '检索记忆', emotion: '情绪', behavior_guidelines: '行为指引', assembled_system: '组装后系统提示词（含适用的平台协议）', history: '历史消息', continuity_note: '开场连续性提示', context_auxiliary: '上下文辅助（摘要或省略说明）', saved_story_state: '已保存剧情状态', depth_injection: '深度注入（细分来源未记录）', dynamic_context: '动态上下文', author_note: '作者注释', post_history_instructions: '历史后指令', card_depth_prompt: '角色深度指令', 'worldbook_persona.ANTop': '世界书 / 游玩身份 · ANTop' };
const sourceLabel = (source: string) => sources[source] ?? (source.startsWith('worldbook.') ? `世界书 · ${source.slice(10)}` : '来源未记录');
const reasons: Record<string, string> = { included_in_prompt: '已选入', disabled: '已停用', keyword_not_matched: '关键词或窗口未满足', probability_check_failed: '概率未通过', delay_not_reached: '未达到延迟', token_budget_exceeded: '超出选择预算', recursion_disabled: '禁止递归激活', character_filter: '角色筛选排除' };
const reasonLabel = (reason: string) => reasons[reason] ?? reason;
</script>
<style scoped>
.prompt-trace-view { font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
p { color: var(--text-secondary); }
label, select { display: block; width: 100%; margin-block: 8px; }
select, button { padding: 8px; color: var(--text-primary); background: var(--bg-base); border: 1px solid var(--border-default); border-radius: 6px; }
dt { color: var(--text-secondary); margin-top: 10px; }
dd { margin-left: 0; }
details { border-top: 1px solid var(--border-default); padding-block: 12px; }
summary { cursor: pointer; font-weight: 600; }
ul, ol { padding-left: 20px; }
li { margin-block: 8px; }
small { display: block; color: var(--text-secondary); }
</style>
