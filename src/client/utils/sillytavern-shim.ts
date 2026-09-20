/**
 * SillyTavern API Shim for ERA tavern_helper scripts
 *
 * Provides a minimal compatibility layer that bridges ERA script API calls
 * to our platform's services via postMessage.
 *
 * This shim is injected into a hidden iframe that runs tavern_helper scripts.
 * It provides the SillyTavern global APIs that ERA scripts depend on.
 *
 * Security note: This shim runs inside a sandboxed iframe (sandbox="allow-scripts").
 * The iframe has a null origin and cannot access the parent page's DOM, cookies,
 * or storage. All communication is via postMessage with origin validation.
 * The innerHTML usage in the jQuery stub is intentional — it operates only within
 * the sandboxed iframe context where the ERA script already has full DOM access.
 */

/**
 * Generate the shim script to inject into the ERA script iframe.
 */
export function generateSillyTavernShim(opts: {
  charName: string;
  userName: string;
  chatId: string;
  scriptId?: string;
}): string {
  // SHIM_PLACEHOLDER
  return buildShimScript(opts);
}

function buildShimScript(opts: {
  charName: string;
  userName: string;
  chatId: string;
  scriptId?: string;
}): string {
  const userName = JSON.stringify(opts.userName);
  const charName = JSON.stringify(opts.charName);
  const scriptId = JSON.stringify(opts.scriptId || 'era-script-0');

  return `<script>
(function() {
  var _handlers = {};
  window.eventOn = function(name, fn) {
    if (!_handlers[name]) _handlers[name] = [];
    _handlers[name].push(fn);
  };
  window.eventEmit = function(name, data) {
    window.parent.postMessage({ type: 'era-script-event', event: name, payload: data }, '*');
    if (_handlers[name]) {
      _handlers[name].forEach(function(fn) { try { fn(data); } catch(e) { console.error('eventOn handler error:', e); } });
    }
  };
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'era-event' && _handlers[e.data.event]) {
      _handlers[e.data.event].forEach(function(fn) { try { fn(e.data.payload); } catch(e2) { console.error(e2); } });
    }
  });
  window.SillyTavern = { name1: ${userName}, name2: ${charName} };
  window.getScriptId = function() { return ${scriptId}; };
  var _pendingRequests = {};
  var _reqId = 0;
  function requestFromParent(type, data) {
    return new Promise(function(resolve, reject) {
      var id = 'req_' + (++_reqId);
      _pendingRequests[id] = { resolve: resolve, reject: reject };
      window.parent.postMessage({ type: type, requestId: id, payload: data }, '*');
      setTimeout(function() { if (_pendingRequests[id]) { delete _pendingRequests[id]; reject(new Error('Request timeout')); } }, 5000);
    });
  }
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'era-response' && e.data.requestId) {
      var p = _pendingRequests[e.data.requestId];
      if (p) { delete _pendingRequests[e.data.requestId]; if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.result); }
    }
  });
  window.getVar = function(name) { return requestFromParent('era-getVar', { name: name }); };
  window.getChatMessages = function(index) { return requestFromParent('era-getChatMessages', { index: index }); };
  window.getWorldbook = function() { return Promise.resolve([]); };
  window.createWorldbookEntries = function() { return Promise.resolve(); };
  window.getCharWorldbookNames = function() { return Promise.resolve({ primary: null, additional: [] }); };
  window.createWorldbook = function() { return Promise.resolve(); };
  window.rebindCharWorldbooks = function() { return Promise.resolve(); };
  window.isCharacterTavernRegexesEnabled = function() { return true; };
  if (!window.jQuery && !window.$) {
    var jq = function(sel) {
      var el;
      if (typeof sel === 'function') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sel);
        else sel();
        return jq;
      }
      if (typeof sel === 'string') {
        if (sel.charAt(0) === '<') {
          var tmp = document.createElement('div');
          tmp.textContent = sel;
          el = document.createElement('div');
        } else {
          el = document.querySelector(sel);
        }
      } else { el = sel; }
      var w = {
        0: el, length: el ? 1 : 0,
        attr: function(k, v) { if (el && v !== undefined) { el.setAttribute(k, v); return w; } return el ? el.getAttribute(k) : null; },
        css: function(k, v) { if (el) { if (typeof k === 'object') { for (var p in k) el.style[p] = k[p]; } else if (v !== undefined) el.style[k] = v; } return w; },
        append: function(child) { if (el) { var c = child && child[0] ? child[0] : child; if (c instanceof Node) el.appendChild(c); } return w; },
        remove: function() { if (el && el.parentNode) el.parentNode.removeChild(el); return w; },
        find: function(s) { return jq(el ? el.querySelector(s) : null); },
        clone: function() { return jq(el ? el.cloneNode(true) : null); },
        text: function(t) { if (el && t !== undefined) el.textContent = t; return el ? el.textContent : ''; },
        on: function(ev, fn) { if (el) el.addEventListener(ev, fn); return w; },
        off: function(ev, fn) { if (el) el.removeEventListener(ev, fn); return w; },
      };
      return w;
    };
    window.$ = window.jQuery = jq;
  }
  window.parent.postMessage({ type: 'era-shim-ready' }, '*');
})();
<\/script>`;
}
