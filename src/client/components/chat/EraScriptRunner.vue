<template>
  <div v-if="hasScripts" class="era-script-runner" style="display:none">
    <iframe
      ref="iframeRef"
      :srcdoc="srcdocContent"
      sandbox="allow-scripts allow-same-origin"
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
 * Security: allow-same-origin is needed for ESM CDN imports. The iframe
 * content is character card data (not user input), and the sandbox still
 * prevents navigation, form submission, and popups.
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { generateSillyTavernShim } from '@client/utils/sillytavern-shim';
import {
  updateVariables,
  mergeVariables,
  deleteVariables,
  fetchVariables,
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
    .map(s => `<script type="module">${s.content}<\/script>`)
    .join('\n');

  return `<!doctype html>
<html><head><meta charset="UTF-8">${shim}</head>
<body>${scriptTags}</body></html>`;
});

function onMessage(event: MessageEvent) {
  if (!iframeRef.value) return;
  if (event.source !== iframeRef.value.contentWindow) return;

  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'era-script-event':
      handleScriptEvent(data.event, data.payload);
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
  // ERA variable operations — bridge to our variable store
  if (event === 'era:insertByObject' || event === 'era:updateByObject') {
    const obj = payload as Record<string, unknown>;
    const flat = flattenObject(obj);
    mergeVariables(flat);
  } else if (event === 'era:insertByPath') {
    const { path, value } = payload as { path: string; value: unknown };
    mergeVariables({ [path]: typeof value === 'string' ? value : JSON.stringify(value) });
  } else if (event === 'era:updateByPath') {
    const { path, value } = payload as { path: string; value: unknown };
    mergeVariables({ [path]: typeof value === 'string' ? value : JSON.stringify(value) });
  } else if (event === 'era:deleteByPath') {
    const { path } = payload as { path: string };
    deleteVariables([path]);
  } else if (event === 'era:forceSync') {
    // Re-fetch all variables from server
    if (props.chatId) {
      fetchVariables(props.chatId).then(vars => updateVariables(vars));
    }
  }
  // Relay writeDone events to status bar iframes (handled by era-bridge)
}

async function handleGetVar(requestId: string, payload: { name: string }) {
  if (!iframeRef.value?.contentWindow) return;
  try {
    const vars = await fetchVariables(props.chatId);
    const value = vars[payload.name] ?? '';
    iframeRef.value.contentWindow.postMessage({
      type: 'era-response',
      requestId,
      result: value,
    }, '*');
  } catch {
    iframeRef.value.contentWindow.postMessage({
      type: 'era-response',
      requestId,
      error: 'Failed to get variable',
    }, '*');
  }
}

async function handleGetChatMessages(requestId: string, _payload: { index: number }) {
  if (!iframeRef.value?.contentWindow) return;
  // Return empty array — full message access not implemented yet
  iframeRef.value.contentWindow.postMessage({
    type: 'era-response',
    requestId,
    result: [],
  }, '*');
}

async function onShimReady() {
  // Send initial variables to the script
  if (props.chatId) {
    const vars = await fetchVariables(props.chatId);
    updateVariables(vars);
  }
}

function onIframeLoad() {
  // iframe loaded, shim will send era-shim-ready when initialized
}

/**
 * Flatten a nested object to dot-notation key-value pairs.
 */
function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }
  return result;
}

onMounted(() => {
  window.addEventListener('message', onMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
});
</script>
