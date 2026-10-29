<script setup lang="ts">
import { computed } from 'vue';
import { worldbookPurposeLabels, type StoryDiagnostics } from '../../../types/story-diagnostics';
const props = defineProps<{ report: StoryDiagnostics; frozen?: boolean }>();
const dependencyProblems = computed(() => props.report.books.dependencies.filter(status => status !== 'bound'));
const purposeText = computed(() => props.report.books.purposes.map(purpose => worldbookPurposeLabels[purpose]).join('、'));
const dependencyLabels = { disabled: '已绑定的资料已停用', empty: '已绑定的资料没有启用条目', unbound: '声明的资料尚未绑定', ambiguous: '同名绑定不唯一，需作者复核' };
</script>

<template>
  <div class="story-diagnostics" aria-label="设定与身份支持情况">
    <p>{{ frozen ? '本次开局时' : '当前' }}绑定 {{ report.books.bound }} 份资料，其中 {{ report.books.active }} 份有启用条目。按各自触发规则使用，不会自动加入其他世界书。</p>
    <p v-if="report.books.disabled || report.books.empty">{{ report.books.disabled }} 份已停用，{{ report.books.empty }} 份没有启用条目。</p>
    <ul v-if="dependencyProblems.length" class="dependency-problems"><li v-for="(status, index) in dependencyProblems" :key="index">{{ dependencyLabels[status as keyof typeof dependencyLabels] }}。请作者在角色编辑页核对绑定；本平台不会按名称自动补齐。</li></ul>
    <p v-else-if="report.books.dependencies.length">已找到命名声明对应的启用资料；这不代表全部外部依赖或玩法已验证。</p>
    <p v-if="report.books.purposes.length">作者声明用途：{{ purposeText }}。用途说明不会改变资料触发或执行方式。</p>
    <p v-if="report.books.undeclaredPurpose">部分资料未声明用途，可能是背景、常识、风格或规则；不会据此要求你重新选择世界。</p>
    <p v-if="report.identity.status === 'fixed_name'">作者固定玩家称呼为「{{ report.identity.fixedName }}」。请选择相同称呼的人设；修改账户或人设不会改写已有故事。</p>
    <p v-else-if="report.identity.status === 'invalid'" role="alert">作者的身份声明无效，暂时不能新开故事，请作者修正。</p>
    <p v-else>作者未提供可校验的固定称呼。文字中的身份、经历与关系尚未自动核对；自选人设不代表能够覆盖作者设定。</p>
    <p v-if="report.multipleCharacters">这是多人物故事，各人物资料分别冻结和使用；此诊断不代表人物知情隔离或群体玩法已经完整适配。</p>
  </div>
</template>

<style scoped>
.story-diagnostics { overflow-wrap: anywhere; font-size: 14px; line-height: 1.9; color: var(--text-secondary); }
.dependency-problems { padding-left: 20px; }
</style>
