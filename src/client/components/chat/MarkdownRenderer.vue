<template>
  <div class="markdown-content">
    <template v-for="(seg, i) in displaySegments" :key="i">
      <div v-if="seg.type === 'markdown'" v-html="seg.html" @click="handleContentClick"></div>
      <SandboxedHtml v-else :html="seg.html" :variables="eraVars" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';
import { applyMarkdownOnlyScripts, type RegexScript } from '@client/utils/regex-scripts';
import SandboxedHtml from './SandboxedHtml.vue';
import { eraVariables as eraVars } from '@client/utils/era-bridge';

// Configure DOMPurify hook to sanitize dangerous CSS in style attributes
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'style' && data.attrValue) {
    // Remove dangerous CSS: expressions, url() with javascript/data, position fixed/absolute for overlay attacks
    let css = data.attrValue;
    css = css.replace(/expression\s*\(/gi, '');
    css = css.replace(/url\s*\(\s*['"]?\s*javascript:/gi, 'url(');
    css = css.replace(/url\s*\(\s*['"]?\s*data:/gi, 'url(');
    css = css.replace(/-moz-binding\s*:/gi, '');
    css = css.replace(/behavior\s*:/gi, '');
    // Block position:fixed which could overlay the entire page
    css = css.replace(/position\s*:\s*fixed/gi, 'position:relative');
    data.attrValue = css;
  }
});

// Scope <style> blocks to .markdown-content to prevent CSS leaking
DOMPurify.addHook('afterSanitizeElements', (node) => {
  if (node.nodeName === 'STYLE' && node.textContent) {
    let css = node.textContent;
    // Remove dangerous CSS constructs
    css = css.replace(/@import\b[^;]*;?/gi, '');
    css = css.replace(/expression\s*\(/gi, '');
    css = css.replace(/url\s*\(\s*['"]?\s*javascript:/gi, 'url(');
    // Scope all selectors under .markdown-content
    css = css.replace(
      /([^{}@]+)\{/g,
      (match, selectors: string) => {
        // Don't scope @keyframes or @media rules
        if (selectors.trim().startsWith('@')) return match;
        const scoped = selectors
          .split(',')
          .map((s: string) => `.markdown-content ${s.trim()}`)
          .join(', ');
        return `${scoped} {`;
      },
    );
    node.textContent = css;
  }
});
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import katex from 'katex';

// Register highlight.js languages (tree-shaken)
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);

interface Props {
  content: string;
  streaming?: boolean;
  regexScripts?: RegexScript[];
}

interface ContentSegment {
  type: 'markdown' | 'html';
  html: string;
}

const props = withDefaults(defineProps<Props>(), {
  streaming: false,
});

const { t } = useI18n();

// Build a custom renderer for code blocks
const renderer = new Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : '';
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : escapeHtml(text);
  const langLabel = language || 'text';
  const copyLabel = t('common.copy');

  return `<div class="code-block">
    <div class="code-header">
      <span class="code-lang">${langLabel}</span>
      <button class="code-copy-btn" data-copy-text="${encodeURIComponent(text)}">${copyLabel}</button>
    </div>
    <pre><code class="hljs${language ? ` language-${language}` : ''}">${highlighted}</code></pre>
  </div>`;
};

function handleContentClick(event: MouseEvent): void {
  const btn = (event.target as HTMLElement).closest('.code-copy-btn') as HTMLElement | null;
  if (!btn) return;
  const encoded = btn.dataset.copyText;
  if (!encoded) return;
  navigator.clipboard.writeText(decodeURIComponent(encoded));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Close unclosed code fences during streaming so marked doesn't
 * render partial fences as inline code or plain text.
 */
function closeUnfinishedCodeBlocks(text: string): string {
  const fencePattern = /^(`{3,})/gm;
  let openFence: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(text)) !== null) {
    if (!openFence) {
      openFence = match[1];
    } else {
      openFence = null;
    }
  }
  if (openFence) {
    return text + '\n' + openFence;
  }
  return text;
}

function renderMarkdown(content: string): string {
  let text = content;

  // Strip ERA framework XML blocks that are functional, not display content
  text = text.replace(/<(?:VariableInsert|VariableEdit|VariableDelete|era_data|variablethink)[\s>][\s\S]*?<\/(?:VariableInsert|VariableEdit|VariableDelete|era_data|variablethink)>/gi, '');

  // KaTeX preprocessing: replace math expressions BEFORE marked processes them
  // Block math: $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex) => {
    try {
      return `<div class="katex-block">${katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="katex-block"><code>${escapeHtml(tex.trim())}</code></div>`;
    }
  });

  // Inline math: $...$  (but not $$)
  text = text.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_match, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `<code>${escapeHtml(tex.trim())}</code>`;
    }
  });

  const html = marked.use({ renderer, breaks: true, gfm: true }).parse(text) as string;

  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['button', 'details', 'summary'],
    ADD_ATTR: ['data-copy-text', 'style'],
    ALLOW_ARIA_ATTR: true,
    // Allow safe inline HTML elements commonly used by SillyTavern character cards
    ALLOWED_TAGS: [
      // Standard markdown output
      'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup',
      'a', 'img', 'blockquote', 'pre', 'code',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
      // Rich HTML used by character cards
      'div', 'span', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
      'details', 'summary', 'figure', 'figcaption', 'mark', 'small', 'abbr', 'cite',
      'ruby', 'rt', 'rp', 'wbr',
      // SillyTavern character card status panels
      'font', 'style',
      // Custom elements for code blocks
      'button',
      // KaTeX output
      'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac',
      'mover', 'munder', 'msqrt', 'mtext', 'mspace', 'mtable', 'mtr', 'mtd',
      'annotation',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height',
      'class', 'id', 'style', 'role', 'aria-label', 'aria-hidden', 'aria-expanded',
      'data-copy-text', 'open', 'colspan', 'rowspan', 'align', 'valign',
      'target', 'rel', 'loading',
      // <font> tag attributes used by SillyTavern character cards
      'color', 'face', 'size',
    ],
    // Block dangerous CSS properties
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onsubmit', 'onchange'],
  });
}

/**
 * Detect and extract full HTML documents from text.
 * Returns segments: markdown text parts and HTML document parts.
 * Handles both code-fenced (```html ... ```) and raw (<!doctype html>) formats.
 */
function extractHtmlDocuments(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];

  // Pattern: code-fenced HTML documents or raw HTML documents
  const htmlDocPattern = /(?:```html\s*\n)?(<!doctype\s+html>[\s\S]*?<\/html>)(?:\s*\n```)?/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = htmlDocPattern.exec(text)) !== null) {
    // Text before this HTML document
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      segments.push({ type: 'markdown', html: before });
    }
    // The HTML document itself
    segments.push({ type: 'html', html: match[1] });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last HTML document
  const after = text.slice(lastIndex);
  if (after.trim()) {
    segments.push({ type: 'markdown', html: after });
  }

  // If no HTML documents found, return single markdown segment
  if (segments.length === 0) {
    segments.push({ type: 'markdown', html: text });
  }

  return segments;
}

/**
 * Process content into display segments.
 * Applies regex_scripts first, then splits into markdown/html segments.
 */
function processContent(content: string, regexScripts?: RegexScript[]): ContentSegment[] {
  // Apply markdownOnly regex_scripts
  let text = applyMarkdownOnlyScripts(content, regexScripts);

  // Check if regex_scripts produced any HTML documents
  const segments = extractHtmlDocuments(text);

  // Render markdown segments through the existing pipeline
  return segments.map(seg => {
    if (seg.type === 'html') return seg;
    return { type: 'markdown' as const, html: renderMarkdown(seg.html) };
  });
}

// --- Non-streaming: synchronous computed ---
const renderedSegments = computed<ContentSegment[]>(() => {
  if (props.streaming) return [];
  return processContent(props.content, props.regexScripts);
});

// --- Streaming: RAF-debounced rendering ---
const streamingSegments = ref<ContentSegment[]>([]);
let rafId: number | null = null;
let pendingContent = '';

function scheduleStreamingRender() {
  if (rafId !== null) return; // already scheduled
  rafId = requestAnimationFrame(() => {
    rafId = null;
    const content = closeUnfinishedCodeBlocks(pendingContent);
    // During streaming, render as single markdown segment (no iframe extraction)
    streamingSegments.value = [{ type: 'markdown', html: renderMarkdown(applyMarkdownOnlyScripts(content, props.regexScripts)) }];
  });
}

watch(() => props.content, (newContent) => {
  if (!props.streaming) return;
  pendingContent = newContent;
  scheduleStreamingRender();
});

// When streaming ends (prop switches to false), do a final clean render
watch(() => props.streaming, (isStreaming, wasStreaming) => {
  if (wasStreaming && !isStreaming) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    streamingSegments.value = [];
  }
});

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
});

// Pick the right segments source
const displaySegments = computed<ContentSegment[]>(() => {
  return props.streaming ? streamingSegments.value : renderedSegments.value;
});
</script>

<style>
/*
 * 两条 @import 必须留在整个 style 块最顶端，中间不要插入任何规则。
 *
 * CSS 规范要求 @import 先于其他语句。一旦它被挤到某条规则之后，构建时 postcss
 * 会打出 `@import must precede all other statements` 并直接把这条 @import 丢掉，
 * 不是警告而是丢弃。本文件开发过程中就踩过：katex 那条落到了中间，生产产物里
 * .katex 规则从 392 条掉到 1 条，公式排版整个失效，而开发服务器照常渲染——
 * 也就是说这个问题在 dev 下看不出来，只有 vite build 的产物里才暴露。
 *
 * 顺序也有讲究：先 highlight.js 再 katex，下面的深色覆盖规则要能压住 github.css。
 */
@import 'highlight.js/styles/github.css';
@import 'katex/dist/katex.min.css';

/* highlight.js 深色主题覆盖：两份主题都加载，靠选择器特异性切换 */
[data-theme="dark"] .code-block .hljs,
.dark .code-block .hljs {
  background: #0d1117;
  color: #c9d1d9;
}

[data-theme="dark"] .code-block .hljs-keyword,
.dark .code-block .hljs-keyword { color: #ff7b72; }
[data-theme="dark"] .code-block .hljs-string,
.dark .code-block .hljs-string { color: #a5d6ff; }
[data-theme="dark"] .code-block .hljs-comment,
.dark .code-block .hljs-comment { color: #8b949e; }
[data-theme="dark"] .code-block .hljs-number,
.dark .code-block .hljs-number { color: #79c0ff; }
[data-theme="dark"] .code-block .hljs-title,
.dark .code-block .hljs-title { color: #d2a8ff; }

/* Code block container */
.code-block {
  border-radius: 8px;
  border: 1px solid var(--border-default);
  margin: 8px 0;
  overflow: hidden;
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--surface-hover);
  padding: 6px 12px;
  font-size: 12px;
}

.code-lang {
  color: var(--text-secondary);
}

.code-copy-btn {
  padding: 2px 8px;
  font-size: 12px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.code-copy-btn:hover {
  background: var(--accent);
  color: var(--text-inverse);
}

/* KaTeX block */
.katex-block {
  display: block;
  text-align: center;
  margin: 12px 0;
}

/* Markdown content typography */
.markdown-content p {
  margin: 0 0 8px 0;
}

.markdown-content p:last-child {
  margin-bottom: 0;
}

.markdown-content pre {
  margin: 0;
}

.markdown-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}

.markdown-content th,
.markdown-content td {
  border: 1px solid var(--border-default);
  padding: 8px 12px;
}

.markdown-content th {
  background-color: var(--surface-hover);
}

.markdown-content blockquote {
  border-left: 4px solid var(--accent);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--text-secondary);
}

.markdown-content img {
  max-width: 100%;
  border-radius: 8px;
}

.markdown-content a {
  color: var(--accent-text);
  text-decoration: none;
}

.markdown-content a:hover {
  text-decoration: underline;
}

/* Collapsible details/summary (used by SillyTavern character cards) */
.markdown-content details {
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 8px 0;
  background: var(--bg-surface);
}

.markdown-content details[open] {
  padding-bottom: 12px;
}

.markdown-content summary {
  cursor: pointer;
  font-weight: 500;
  padding: 4px 0;
  user-select: none;
}

.markdown-content summary:hover {
  color: var(--accent-text);
}

/* Ensure inline HTML from character cards doesn't break layout */
.markdown-content div,
.markdown-content section {
  max-width: 100%;
  overflow-wrap: break-word;
}

/* Constrain images and media within messages */
.markdown-content * {
  max-width: 100%;
  box-sizing: border-box;
}
</style>
