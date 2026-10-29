<script setup lang="ts">
import { adaptationFindingMessages, adaptationInitialMessages, adaptationRuntimeMessages,
  type StoryAdaptationReport } from '../../../types/story-adaptation';
import { ritualScope } from '../../../types/story-ritual';
import { storyRuleScopeMessages } from '../../../types/story-rule-scope';

defineProps<{ report: StoryAdaptationReport; saved?: boolean }>();
</script>

<template>
  <details class="adaptation-report" :data-testid="saved ? 'saved-adaptation-report' : 'adaptation-report'">
    <summary><strong>兼容情况</strong><span>{{ saved ? '开局时的记录' : '当前所选开场' }}</span></summary>
    <p :role="['invalid', 'conflict'].includes(report.runtime) ? 'alert' : undefined">{{ adaptationRuntimeMessages[report.runtime] }}</p>
    <dl><div><dt>初始状态</dt><dd>{{ adaptationInitialMessages[report.initial] }}</dd></div>
      <div><dt>持续机制</dt><dd v-if="report.ruleScope">{{ storyRuleScopeMessages[report.ruleScope] }}</dd>
        <dd v-else-if="report.findings.length"><ul><li v-for="finding in report.findings" :key="finding.code">{{ adaptationFindingMessages[finding.code] }}</li></ul></dd>
        <dd v-else-if="report.turnEffect">{{ ritualScope(report.turnEffect) }}</dd>
        <dd v-else-if="report.runtime === 'adapted'">已校验的赋值、增减、条件与一次性触发，按本次冻结版本运行。</dd>
        <dd v-else-if="report.runtime === 'native'">按本次冻结的原生规则运行；其他第三方机制仍需验证。</dd>
        <dd v-else>没有可确认的第三方机制适配结论。</dd></div></dl>
    <p v-if="saved" class="report-meta">随本次开局保存 · 报告 v{{ report.version }} · 不随原卡后续编辑而改变</p>
    <p v-else class="report-meta">{{ report.runtime === 'unsupported' ? '剧情体验可继续；数值玩法尚未适配。' : '只运行已支持的规则，不执行作者脚本。' }}</p>
  </details>
</template>

<style scoped>
.adaptation-report { padding: 10px 0; margin: 8px 0 16px; border-block: 1px solid var(--border-default); color: var(--text-secondary); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
summary { cursor: pointer; min-height: 44px; padding: 10px 0; box-sizing: border-box; }
summary strong { color: var(--text-primary); font-weight: 600; margin-inline-end: 12px; }
summary span, .report-meta { font-size: 12px; }
summary:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 3px; }
p { margin: 8px 0; }
dl { margin: 12px 0; }
dl > div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; margin: 10px 0; }
dt { color: var(--text-primary); }
dd { margin: 0; }
ul { margin: 0; padding-inline-start: 16px; }
li + li { margin-top: 6px; }
</style>
