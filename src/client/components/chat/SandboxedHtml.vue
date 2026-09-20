<template>
  <div class="sandboxed-html-container" :style="containerStyle">
    <iframe
      ref="iframeRef"
      :srcdoc="srcdocContent"
      sandbox="allow-scripts allow-same-origin"
      class="sandboxed-iframe"
      :style="iframeStyle"
      @load="onIframeLoad"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';

interface Props {
  html: string;
  chatId?: string;
  variables?: Record<string, string>;
  height?: string;
}

const props = withDefaults(defineProps<Props>(), {
  height: '400px',
});

const iframeRef = ref<HTMLIFrameElement | null>(null);
const dynamicHeight = ref<number>(0);

/**
 * PostMessage bridge shim injected into the iframe.
 * Provides eventOn/eventEmit functions that bridge to the parent page.
 * Also provides lodash _.get for ERA status bar compatibility.
 */
const BRIDGE_SHIM = `
<script>
// CRITICAL: Define lodash shim IMMEDIATELY before any other code runs
// This must be synchronous and at the very top to prevent "_ is not defined" errors
(function() {
  // Define lodash shim first
  if (!window._) {
    window._ = {
      get: function(obj, path, def) {
        if (obj == null) return def;
        var keys = typeof path === 'string' ? path.split('.') : path;
        var result = obj;
        for (var i = 0; i < keys.length; i++) {
          if (result == null) return def;
          result = result[keys[i]];
        }
        return result === undefined ? def : result;
      },
      isEmpty: function(val) {
        if (val == null) return true;
        if (Array.isArray(val) || typeof val === 'string') return val.length === 0;
        return Object.keys(val).length === 0;
      }
    };
  }

  // Define z as an alias for lodash (some scripts may use 'z' instead of '_')
  if (!window.z) {
    window.z = window._;
  }

  // Event bridge for ERA compatibility
  var _handlers = {};
  window.eventOn = function(name, fn) {
    if (!_handlers[name]) _handlers[name] = [];
    _handlers[name].push(fn);
  };
  window.eventEmit = function(name, data) {
    window.parent.postMessage({ type: 'era-event', event: name, payload: data }, '*');
  };
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'era-event' && _handlers[e.data.event]) {
      _handlers[e.data.event].forEach(function(fn) { fn(e.data.payload); });
    }
  });

  // Report height to parent for auto-sizing
  var _lastH = 0;
  function reportHeight() {
    var h = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
    if (h !== _lastH) { _lastH = h; window.parent.postMessage({ type: 'era-resize', height: h }, '*'); }
  }
  new MutationObserver(reportHeight).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  setInterval(reportHeight, 1000);
})();
<\/script>
`;

/**
 * Build the srcdoc content by injecting the bridge shim into the HTML.
 * Insert the shim right after <head> or at the start of the document.
 */
const srcdocContent = computed(() => {
  let html = props.html;
  // Strip markdown code fence wrapper if present
  html = html.replace(/^```html\s*\n/i, '').replace(/\n```\s*$/i, '');

  // Inject bridge shim after <head> tag
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = html.indexOf(headMatch[0]) + headMatch[0].length;
    return html.slice(0, idx) + BRIDGE_SHIM + html.slice(idx);
  }
  // Fallback: inject at start
  return BRIDGE_SHIM + html;
});

const containerStyle = computed(() => ({
  width: '100%',
  minHeight: dynamicHeight.value > 0 ? `${dynamicHeight.value}px` : props.height,
}));

const iframeStyle = computed(() => ({
  width: '100%',
  height: dynamicHeight.value > 0 ? `${dynamicHeight.value}px` : props.height,
  border: 'none',
  borderRadius: '8px',
  overflow: 'hidden',
}));

function onMessage(event: MessageEvent) {
  if (!iframeRef.value) return;
  // Only accept messages from our iframe
  if (event.source !== iframeRef.value.contentWindow) return;

  if (event.data?.type === 'era-resize') {
    dynamicHeight.value = Math.min(event.data.height, 800);
  } else if (event.data?.type === 'era-event') {
    // Handle era:requestWriteDone — send current variables to iframe
    if (event.data.event === 'era:requestWriteDone' && props.variables) {
      sendVariablesToIframe(props.variables);
    }
  }
}

function sendVariablesToIframe(vars: Record<string, string>) {
  if (!iframeRef.value?.contentWindow) return;
  // Build a statWithoutMeta object from flat key-value pairs
  const stat = unflattenVars(vars);
  iframeRef.value.contentWindow.postMessage({
    type: 'era-event',
    event: 'era:writeDone',
    payload: {
      statWithoutMeta: stat,
      stat: stat,
      actions: { apply: true, rollback: false, resync: false, api: false, apiWrite: false },
    },
  }, '*');
}

/**
 * Convert flat dot-notation keys to nested object.
 * e.g. { "player.hp": "100", "player.name": "Alice" } → { player: { hp: "100", name: "Alice" } }
 */
function unflattenVars(vars: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(vars)) {
    const parts = key.split('.');
    let current: Record<string, unknown> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    // Try to parse JSON values back to their original types
    try {
      current[parts[parts.length - 1]] = JSON.parse(value);
    } catch {
      current[parts[parts.length - 1]] = value;
    }
  }
  return result;
}

function onIframeLoad() {
  // Send initial variables when iframe loads
  if (props.variables && Object.keys(props.variables).length > 0) {
    // Small delay to let the iframe's bridge shim initialize
    setTimeout(() => sendVariablesToIframe(props.variables!), 100);
  }
}

// Watch for variable changes and push to iframe
watch(() => props.variables, (newVars) => {
  if (newVars) sendVariablesToIframe(newVars);
}, { deep: true });

onMounted(() => {
  window.addEventListener('message', onMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
});
</script>

<style scoped>
.sandboxed-html-container {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  margin: 8px 0;
  background: var(--bg-surface, #1a1a2e);
}

.sandboxed-iframe {
  display: block;
}
</style>
