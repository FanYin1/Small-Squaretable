<script setup lang="ts">
import { nextTick, onScopeDispose, ref, useId, watch } from 'vue';
import { Close } from '@element-plus/icons-vue';
const props = defineProps<{ open: boolean; title: string; returnFocus?: HTMLElement }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const id = useId();
const panel = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();
let previousFocus: HTMLElement | null = null;
let appWasInert = false;
let overflow = '';
let active = false;
function release() {
  if (!active) return;
  const app = document.getElementById('app');
  if (app) app.inert = appWasInert;
  document.body.style.overflow = overflow;
  active = false;
}
function close() { emit('update:open', false); }
function trap(event: KeyboardEvent) {
  const controls = [...(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]') ?? [])].filter(el => el.getClientRects().length && el.tabIndex >= 0 && el.checkVisibility?.({ visibilityProperty: true }) !== false);
  const first = controls[0], last = controls.at(-1);
  if (!first) { event.preventDefault(); panel.value?.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || !panel.value?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !panel.value?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
watch(() => props.open, async open => {
  if (open && !active) {
    previousFocus = props.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const app = document.getElementById('app');
    appWasInert = app?.inert ?? false;
    overflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = 'hidden';
    active = true;
  } else if (!open) release();
  await nextTick();
  if (props.open !== open) return;
  if (open) closeButton.value?.focus({ preventScroll: true });
  else if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
}, { immediate: true, flush: 'sync' });
onScopeDispose(release);
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="story-workspace-layer" @keydown.esc.stop.prevent="close" @keydown.tab="trap">
      <button type="button" class="story-workspace-backdrop" tabindex="-1" aria-label="返回故事" @click="close" />
      <aside ref="panel" class="story-workspace-drawer" role="dialog" aria-modal="true" :aria-labelledby="id" tabindex="-1">
        <header class="workspace-drawer-heading"><h2 :id="id">{{ title }}</h2><button ref="closeButton" type="button" aria-label="返回故事" @click="close"><Close /></button></header>
        <div class="workspace-drawer-content"><slot /></div>
      </aside>
    </div>
  </Teleport>
</template>
<style scoped>
.story-workspace-layer { position:fixed; inset:0; z-index:2000; display:flex; justify-content:flex-end; }
.story-workspace-backdrop { position:absolute; inset:0; border:0; background:#10181083; cursor:pointer; }
.story-workspace-drawer { position:relative; width:min(480px, 94vw); height:100%; min-width:0; display:flex; flex-direction:column; background:var(--bg-base); color:var(--text-primary); box-shadow:var(--shadow-lg); }
.workspace-drawer-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 24px; border-bottom:1px solid var(--border-default); flex:none; }
.workspace-drawer-heading h2 { margin:0; font-size:18px; font-weight:500; }
.workspace-drawer-heading button { display:grid; place-items:center; width:40px; height:40px; border:0; border-radius:8px; background:transparent; color:inherit; cursor:pointer; }
.workspace-drawer-heading button:hover { background:var(--bg-subtle); }
.workspace-drawer-heading svg { width:20px; }
.workspace-drawer-content { padding:24px; overflow:auto; min-height:0; flex:1; }
</style>
