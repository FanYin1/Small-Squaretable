<template>
  <div class="markdown-content" v-html="renderedHtml"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';
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
}

const props = defineProps<Props>();

// Build a custom renderer for code blocks
const renderer = new Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : '';
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : escapeHtml(text);
  const langLabel = language || 'text';

  return `<div class="code-block">
    <div class="code-header">
      <span class="code-lang">${langLabel}</span>
      <button class="code-copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(text)}'))">Copy</button>
    </div>
    <pre><code class="hljs${language ? ` language-${language}` : ''}">${highlighted}</code></pre>
  </div>`;
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const renderedHtml = computed(() => {
  let content = props.content;

  // KaTeX preprocessing: replace math expressions BEFORE marked processes them
  // Block math: $$...$$
  content = content.replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex) => {
    try {
      return `<div class="katex-block">${katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="katex-block"><code>${escapeHtml(tex.trim())}</code></div>`;
    }
  });

  // Inline math: $...$  (but not $$)
  content = content.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_match, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `<code>${escapeHtml(tex.trim())}</code>`;
    }
  });

  const html = marked.use({ renderer, breaks: true, gfm: true }).parse(content) as string;

  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['button'],
    ADD_ATTR: ['onclick'],
  });
});
</script>

<style>
/* highlight.js themes */
@import 'highlight.js/styles/github.css' (prefers-color-scheme: light);
@import 'highlight.js/styles/github-dark.css' (prefers-color-scheme: dark);

/* KaTeX styles */
@import 'katex/dist/katex.min.css';

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
  background: var(--surface-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.code-copy-btn:hover {
  background: var(--accent-purple);
  color: #fff;
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
  border-left: 4px solid var(--accent-purple);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--text-secondary);
}

.markdown-content img {
  max-width: 100%;
  border-radius: 8px;
}

.markdown-content a {
  color: var(--accent-purple);
  text-decoration: none;
}

.markdown-content a:hover {
  text-decoration: underline;
}
</style>
