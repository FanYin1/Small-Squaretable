<template>
  <div v-if="hasScripts" class="era-script-runner" style="display:none">
    <iframe
      :key="chatId"
      ref="iframeRef"
      :srcdoc="srcdocContent"
      sandbox="allow-scripts"
      style="width:0;height:0;border:none;position:absolute;left:-9999px"
      @load="onIframeLoad"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * EraScriptRunner — Hidden iframe that executes tavern_helper scripts.
 *
 * Loads ERA tavern_helper scripts in a sandboxed iframe with a SillyTavern
 * API compatibility shim. Bridges ERA events between the script and the
 * parent page (which relays to status bar iframes).
 *
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { generateSillyTavernShim } from '@client/utils/sillytavern-shim';
import { buildCardSandboxDocument, flattenCardVariables } from '../../utils/card-sandbox';
import {
  updateVariables,
  mergeVariables,
  deleteVariables,
  fetchVariables,
  registerIframe,
  unregisterIframe,
} from '@client/utils/era-bridge';

interface TavernHelperScript {
  name: string;
  type: string;
  enabled: boolean;
  content: string;
}

interface Props {
  scripts: TavernHelperScript[];
  charName: string;
  userName: string;
  chatId: string;
}

const props = defineProps<Props>();
const iframeRef = ref<HTMLIFrameElement | null>(null);
let contextVersion = 0;
watch(() => [props.chatId, props.scripts], () => { contextVersion++; }, { flush: 'sync', deep: true });
watch(iframeRef, (frame, previous) => {
  if (previous) unregisterIframe(previous);
  if (frame) registerIframe(frame);
});

const hasScripts = computed(() => {
  return props.scripts.some(s => s.enabled && s.type === 'script');
});

const srcdocContent = computed(() => {
  if (!hasScripts.value) return '';

  const shim = generateSillyTavernShim({
    charName: props.charName,
    userName: props.userName,
    chatId: props.chatId,
  });

  // Build HTML document with shim + all enabled scripts
  const scriptTags = props.scripts
    .filter(s => s.enabled && s.type === 'script')
    // 必须转义：原样的结束标签会提前结束 SFC 的 <script> 块
    // eslint-disable-next-line no-useless-escape
    .map(s => `<script type="module">${s.content}<\/script>`)
    .join('\n');

  return buildCardSandboxDocument(`<!doctype html>
<html><head><meta charset="UTF-8">${shim}</head>
<body>${scriptTags}</body></html>`, true);
});

function onMessage(event: MessageEvent) {
  if (event.origin !== 'null') return;
  if (!iframeRef.value) return;
  if (event.source !== iframeRef.value.contentWindow) return;

  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'era-script-event':
      try { handleScriptEvent(data.event, data.payload); }
      catch { iframeRef.value.contentWindow?.postMessage({ type: 'era-event', event: 'era:error', payload: 'INVALID_VARIABLE_OPERATION' }, '*'); }
      break;
    case 'era-getVar':
      handleGetVar(data.requestId, data.payload);
      break;
    case 'era-getChatMessages':
      handleGetChatMessages(data.requestId, data.payload);
      break;
    case 'era-shim-ready':
      onShimReady();
      break;
  }
}

function handleScriptEvent(event: string, payload: unknown) {
  if (event === 'era:insertByObject' || event === 'era:updateByObject') {
    mergeVariables(flattenCardVariables(payload));
  } else if (event === 'era:insertByPath') {
    const { path, value } = payload as { path: string; value: unknown };
    if (typeof path !== 'string') throw new Error('INVALID_VARIABLE_PATH');
    mergeVariables(flattenCardVariables({ [path]: value }));
  } else if (event === 'era:updateByPath') {
    const { path, value } = payload as { path: string; value: unknown };
    if (typeof path !== 'string') throw new Error('INVALID_VARIABLE_PATH');
    mergeVariables(flattenCardVariables({ [path]: value }));
  } else if (event === 'era:deleteByPath') {
    const { path } = payload as { path: string };
    if (typeof path !== 'string') throw new Error('INVALID_VARIABLE_PATH');
    flattenCardVariables({ [path]: null });
    deleteVariables([path]);
  } else if (event === 'era:forceSync') {
    // Re-fetch all variables from server
    void onShimReady();
  }
  // Relay writeDone events to status bar iframes (handled by era-bridge)
}

async function handleGetVar(requestId: string, payload: { name: string }) {
  if (!iframeRef.value?.contentWindow) return;
  const frame = iframeRef.value.contentWindow;
  const version = contextVersion;
  if (typeof requestId !== 'string' || typeof payload?.name !== 'string') return;
  try {
    const vars = await fetchVariables(props.chatId);
    if (version !== contextVersion || frame !== iframeRef.value?.contentWindow) return;
    const value = vars[payload.name] ?? '';
    frame.postMessage({
      type: 'era-response',
      requestId,
      result: value,
    }, '*');
  } catch {
    if (version !== contextVersion || frame !== iframeRef.value?.contentWindow) return;
    frame.postMessage({
      type: 'era-response',
      requestId,
      error: 'Failed to get variable',
    }, '*');
  }
}

async function handleGetChatMessages(requestId: string, _payload: { index: number }) {
  if (!iframeRef.value?.contentWindow) return;
  iframeRef.value.contentWindow.postMessage({
    type: 'era-response',
    requestId,
    error: 'UNSUPPORTED_API: getChatMessages is unavailable in the legacy card bridge',
  }, '*');
}

async function onShimReady() {
  const version = contextVersion;
  const frame = iframeRef.value?.contentWindow;
  if (props.chatId) {
    try {
      const vars = await fetchVariables(props.chatId);
      if (version === contextVersion && frame === iframeRef.value?.contentWindow) updateVariables(vars);
    } catch {
      if (version === contextVersion && frame === iframeRef.value?.contentWindow) frame?.postMessage({ type: 'era-event', event: 'era:error', payload: 'VARIABLES_UNAVAILABLE' }, '*');
    }
  }
}

function onIframeLoad() {
  // iframe loaded, shim will send era-shim-ready when initialized
}

onMounted(() => {
  window.addEventListener('message', onMessage);
});

onBeforeUnmount(() => {
  contextVersion++;
  if (iframeRef.value) unregisterIframe(iframeRef.value);
  window.removeEventListener('message', onMessage);
});
</script>
