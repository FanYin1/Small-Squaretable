<template>
  <el-popover
    v-model:visible="open"
    placement="top-end"
    trigger="click"
    :width="320"
    :show-arrow="false"
    :disabled="disabled || busy"
    popper-class="story-model-popover"
    @after-enter="focusSelected"
  >
    <template #reference>
      <button ref="trigger" type="button" class="model-picker-trigger"
        :disabled="disabled || busy" aria-haspopup="dialog" :aria-expanded="open"
        :aria-label="`${t('modelPicker.choose')}: ${modelValue || t('modelPicker.unavailable')}`"
        :title="modelValue || t('modelPicker.unavailable')"
        @keydown.esc.stop.prevent="close(true)">
        <el-icon><Cpu /></el-icon>
        <span class="model-picker-name">{{ busy ? t('modelPicker.switching') : modelValue || t('modelPicker.unavailable') }}</span>
        <el-icon class="model-picker-chevron"><ArrowDown /></el-icon>
      </button>
    </template>
    <section ref="panel" class="model-picker-panel" role="dialog" :aria-label="t('modelPicker.choose')"
      @keydown.esc.stop.prevent="close(true)">
      <header class="model-picker-heading">{{ t('modelPicker.choose') }}</header>
      <p v-if="loading" class="model-picker-empty" role="status">{{ t('modelPicker.loading') }}</p>
      <div v-else-if="error" class="model-picker-error" role="alert">
        <span>{{ error }}</span>
        <button type="button" @click="emit('refresh')">{{ t('modelPicker.retry') }}</button>
      </div>
      <input v-if="expanded" v-model="query" type="search" class="model-picker-search"
        :placeholder="t('modelPicker.search')" :aria-label="t('modelPicker.search')" />
      <div class="model-picker-list" role="menu" :aria-label="t('modelPicker.choose')" @keydown="navigate">
        <button v-for="model in visibleModels" :key="model.id" type="button"
          class="model-picker-option" role="menuitemradio" :aria-checked="model.id === modelValue"
          :disabled="disabled || busy || loading" @click="select(model.id)">
          <el-icon class="model-picker-check"><Check v-if="model.id === modelValue" /></el-icon>
          <span class="model-picker-copy">
            <span class="model-picker-title">{{ model.id }}</span>
            <span class="model-picker-description">{{ t('modelPicker.context', { size: formatTokens(model.contextWindow) }) }}</span>
          </span>
          <span v-if="model.id === modelValue" class="model-picker-badge">{{ t('modelPicker.current') }}</span>
        </button>
      </div>
      <p v-if="!loading && !error && !visibleModels.length" class="model-picker-empty" role="status">
        {{ models.length ? t('modelPicker.noMatches') : t('modelPicker.unavailable') }}
      </p>
      <button v-if="models.length > 5 && !expanded" type="button" class="model-picker-more" @click="showAll">
        {{ t('modelPicker.more', { count: models.length }) }} <span aria-hidden="true">→</span>
      </button>
      <footer class="model-picker-footnote">{{ t('modelPicker.nextTurn') }}</footer>
    </section>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowDown, Check, Cpu } from '@element-plus/icons-vue';
import type { ModelMeta } from '@client/services/llm.api';

const props = defineProps<{ models: ModelMeta[]; modelValue: string; disabled?: boolean; busy?: boolean; loading?: boolean; error?: string }>();
const emit = defineEmits<{ select: [model: string]; refresh: [] }>();
const { t } = useI18n();
const open = ref(false);
const expanded = ref(false);
const query = ref('');
const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const visibleModels = computed(() => {
  if (expanded.value) return props.models.filter(model => model.id.toLowerCase().includes(query.value.trim().toLowerCase()));
  const first = props.models.slice(0, 5);
  const current = props.models.find(model => model.id === props.modelValue);
  if (current && !first.includes(current)) first[first.length - 1] = current;
  return first;
});
function formatTokens(tokens: number) {
  return tokens >= 1_000_000 ? `${Number((tokens / 1_000_000).toFixed(2))}M`
    : tokens >= 1000 ? `${Number((tokens / 1000).toFixed(1))}K` : String(tokens);
}
function close(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) trigger.value?.focus();
}
function select(id: string) {
  if (props.disabled || props.busy || props.loading) return;
  close(true);
  if (id !== props.modelValue) emit('select', id);
}
function focusSelected() {
  if (!open.value) return;
  const selected = panel.value?.querySelector<HTMLElement>('[aria-checked="true"]')
    ?? panel.value?.querySelector<HTMLElement>('.model-picker-option');
  selected?.scrollIntoView?.({ block: 'nearest' });
  selected?.focus();
}
async function showAll() {
  expanded.value = true;
  await nextTick();
  panel.value?.querySelector('input')?.focus();
}
function navigate(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const options = Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('.model-picker-option:not(:disabled)') ?? []);
  if (!options.length) return;
  event.preventDefault();
  const index = options.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
    : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  options[next]?.focus();
}
watch(open, value => {
  if (value) emit('refresh');
  else { expanded.value = false; query.value = ''; }
});
watch(() => props.loading, async value => { if (!value) { await nextTick(); focusSelected(); } });
watch(() => props.disabled || props.busy, value => { if (value) close(); });
</script>

<style scoped>
.model-picker-trigger { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; max-width: 240px; padding: 0 12px; border: 0; border-radius: 24px; background: var(--bg-subtle); color: var(--text-primary); cursor: pointer; font: inherit; font-size: 13px; }
.model-picker-trigger:hover { background: var(--bg-hover); }
.model-picker-trigger:disabled { opacity: .55; cursor: not-allowed; }
.model-picker-trigger:focus-visible, .model-picker-option:focus-visible, .model-picker-more:focus-visible { outline: 2px solid var(--accent, #756039); outline-offset: -2px; }
.model-picker-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-picker-trigger .el-icon { flex-shrink: 0; }
.model-picker-chevron { font-size: 11px; }
:global(.story-model-popover.el-popover.el-popper) { width: min(320px, calc(100vw - 24px)) !important; padding: 6px; border-radius: 16px; background: #fffefa; color: #302f2a; border: 1px solid #e3e1d7; box-shadow: 0 8px 28px #302f2a20, 0 2px 6px #302f2a0d; }
:global([data-theme='dark'] .story-model-popover.el-popover.el-popper) { background: #252824; color: #ecebe2; border-color: #373b33; box-shadow: 0 8px 28px #0005; }
.model-picker-panel { --picker-muted: #6d6c61; --picker-hover: #efeee8; --picker-line: #e3e1d7; --picker-badge: #e9e3d5; --picker-accent: #756039; max-height: min(520px, calc(100dvh - 160px)); overflow-y: auto; overscroll-behavior: contain; }
:global([data-theme='dark'] .story-model-popover .model-picker-panel) { --picker-muted: #b1b2a5; --picker-hover: #34382f; --picker-line: #373b33; --picker-badge: #393528; --picker-accent: #d6bd87; }
.model-picker-heading { padding: 8px 12px; font-size: 12px; color: var(--picker-muted); }
.model-picker-option { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 64px; padding: 10px 8px; border: 0; border-radius: 10px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.model-picker-option:hover, .model-picker-option:focus-visible { background: var(--picker-hover); }
.model-picker-check { flex: 0 0 16px; color: var(--picker-accent); }
.model-picker-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
.model-picker-title { font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.model-picker-description { font-size: 12px; color: var(--picker-muted); }
.model-picker-badge { flex-shrink: 0; padding: 3px 6px; border-radius: 8px; background: var(--picker-badge); color: var(--picker-accent); font-size: 10px; }
.model-picker-search { box-sizing: border-box; width: calc(100% - 16px); min-height: 40px; margin: 4px 8px 8px; padding: 8px 10px; background: transparent; color: inherit; border: 1px solid var(--picker-line); border-radius: 8px; font: inherit; font-size: 16px; }
.model-picker-more { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 44px; padding: 10px 14px; border: 0; border-top: 1px solid var(--picker-line); background: transparent; color: inherit; cursor: pointer; font: inherit; font-size: 13px; }
.model-picker-footnote, .model-picker-empty { margin: 0; padding: 8px 12px; color: var(--picker-muted); font-size: 11px; line-height: 1.5; }
.model-picker-error { padding: 8px 12px; font-size: 12px; line-height: 1.5; }
.model-picker-error button { margin-left: 8px; min-height: 44px; background: transparent; color: inherit; border: 0; text-decoration: underline; cursor: pointer; }
@media (max-width: 759px) { .model-picker-trigger { max-width: 190px; } }
</style>
