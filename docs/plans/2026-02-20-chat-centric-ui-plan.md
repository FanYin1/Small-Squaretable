# Chat-Centric UI Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the frontend from a Dashboard-centric layout to a Chat-centric layout (like Claude/ChatGPT), with character roleplay enhancements (avatars, emotion tags).

**Architecture:** Replace `DashboardLayout` + `LeftSidebar` with a new `ChatLayout` that has a conversation-list sidebar (~280px) with bottom nav icons, and a centered message area (max-width 900px). Messages switch from bubble-style to full-width blocks. Login redirects to `/chat` instead of `/dashboard`. New deps: `highlight.js` + `katex` for enhanced markdown rendering.

**Tech Stack:** Vue 3, TypeScript, Element Plus, highlight.js, KaTeX, CSS variables

**Design Doc:** `docs/plans/2026-02-20-chat-centric-ui-redesign.md`

---

### Task 1: Install new dependencies (highlight.js + katex)

**Files:**
- Modify: `package.json`

**What to do:**
1. Run `npm install highlight.js katex`
2. Run `npm install -D @types/katex` (highlight.js has built-in types)
3. Run `npx vitest run` — all 1412 tests should pass (no code changes)

**Commit:** `chore: add highlight.js and katex dependencies for enhanced markdown rendering`

---

### Task 2: Create `MarkdownRenderer.vue` component

**Files:**
- Create: `src/client/components/chat/MarkdownRenderer.vue`

**What to do:**

Create a new Vue component that wraps `marked` + `DOMPurify` + `highlight.js` + `katex`:

```vue
<template>
  <div class="markdown-content" v-html="renderedHtml"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
// Register common languages only (tree-shake)
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

// KaTeX preprocessing: replace $...$ and $$...$$ before marked processes them
function preprocessKatex(text: string): string {
  // Block math: $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, math) => {
    try {
      return `<div class="katex-block">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="katex-block katex-error">${math}</div>`;
    }
  });
  // Inline math: $...$
  text = text.replace(/\$([^\$\n]+?)\$/g, (_match, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `<span class="katex-error">${math}</span>`;
    }
  });
  return text;
}

// Configure marked with highlight.js
const renderer = new marked.Renderer();
const originalCodeRenderer = renderer.code;

renderer.code = function({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = language !== 'plaintext'
    ? hljs.highlight(text, { language }).value
    : text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const langLabel = lang || '';
  return `<div class="code-block"><div class="code-header"><span class="code-lang">${langLabel}</span><button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">Copy</button></div><pre><code class="hljs language-${language}">${highlighted}</code></pre></div>`;
};

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer,
});

const renderedHtml = computed(() => {
  if (!props.content) return '';
  const preprocessed = preprocessKatex(props.content);
  const html = marked.parse(preprocessed) as string;
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['button'],
    ADD_ATTR: ['onclick'],
  });
});
</script>

<style>
/* Import highlight.js theme */
@import 'highlight.js/styles/github.css' (prefers-color-scheme: light);
@import 'highlight.js/styles/github-dark.css' (prefers-color-scheme: dark);
/* Import katex styles */
@import 'katex/dist/katex.min.css';
</style>
```

Add scoped styles for `.code-block`, `.code-header`, `.code-copy-btn`, `.katex-block`, etc. Style the code block with a header bar showing language label + copy button, rounded corners, and proper dark/light theme support.

**Commit:** `feat: create MarkdownRenderer component with highlight.js + katex`

---

### Task 3: Create `ChatLayout.vue` — new main layout

**Files:**
- Create: `src/client/components/layout/ChatLayout.vue`

**What to do:**

Create a new layout component that replaces `DashboardLayout` for the chat page. Structure:

```
┌─────────────────┬──────────────────────────────────┐
│ Sidebar (280px) │  Main content area (flex-1)      │
│                 │                                    │
│ [+ New Chat]    │  <slot />                         │
│ [Search...]     │                                    │
│                 │                                    │
│ Chat list       │                                    │
│ (grouped)       │                                    │
│                 │                                    │
│ ─────────────── │                                    │
│ [🏪][🎭][⚙️][👤]│                                    │
└─────────────────┴──────────────────────────────────┘
```

Key implementation details:
- `display: flex` container, full viewport height
- Left sidebar: `width: 280px`, collapsible to `0px` via toggle button
- Sidebar contains: `ChatSidebar` (conversation list) + bottom nav icons
- Bottom nav icons: 4 icon buttons (Market, MyCharacters, Settings, UserMenu)
- Mobile (<768px): sidebar hidden by default, opens as drawer overlay
- Mobile: show `BottomTabBar` at bottom (already exists)
- Include theme toggle + language switch in sidebar bottom area
- Include `ConnectionIndicator`, `DeviceIndicator`, `NotificationBell` in the chat header area (passed via slot or integrated)

The sidebar collapse state should be stored in `localStorage` for persistence.

**Commit:** `feat: create ChatLayout with sidebar + bottom nav icons`

---

### Task 4: Redesign `MessageBubble.vue` — full-width blocks

**Files:**
- Modify: `src/client/components/chat/MessageBubble.vue` (385 lines → rewrite)

**What to do:**

Replace the current bubble-style messages with full-width block style:

**Assistant messages:**
- Left-aligned avatar (36px circle) + character name + emotion tag (emoji + text)
- Full-width content area using `MarkdownRenderer` (from Task 2)
- Hover shows: [Copy] [Regenerate] + timestamp
- Background: none (or `#fafafa` light / `#1a1a1a` dark)

**User messages:**
- Right-aligned "You" label (no avatar)
- Full-width text with `white-space: pre-wrap`
- Hover shows: [Edit] + timestamp
- Background: `#f5f5f5` light / `#222` dark

**Both:**
- Messages separated by 1px line (`#e5e5e5` light / `#333` dark)
- Content area centered with `max-width: 900px; margin: 0 auto`
- Fade-in animation on new messages
- Remove all bubble-related CSS (border-radius, gradient borders, purple backgrounds)

Replace the inline `marked.parse()` + `DOMPurify.sanitize()` calls with `<MarkdownRenderer :content="message.content" />`.

Keep all existing event emits (`@delete`, `@edit`, `@regenerate`, `@save-edit`, `@cancel-edit`) and editing mode logic.

**Commit:** `feat: redesign MessageBubble to full-width block style with MarkdownRenderer`

---

### Task 5: Redesign `MessageInput.vue` — Claude-style input

**Files:**
- Modify: `src/client/components/chat/MessageInput.vue` (170 lines)

**What to do:**

Redesign the input area to match Claude/ChatGPT style:

```
┌────────────────────────────────────┐
│ 📎  Message...              [Send] │
└────────────────────────────────────┘
Shift+Enter for new line
```

Changes:
- Replace `el-input` textarea with a native `<textarea>` or keep `el-input` but restyle
- Centered container with `max-width: 900px; margin: 0 auto`
- Rounded pill shape (`border-radius: 24px`)
- Attachment icon (📎) on the left (placeholder for future file upload)
- Send button integrated inside the input on the right
- Remove the separate footer row with char count (move to tooltip or remove)
- Remove token estimate display
- Keep `Shift+Enter for new line` hint below

**Commit:** `feat: redesign MessageInput to Claude-style centered pill input`

---

### Task 6: Restructure `ChatSidebar.vue` — add bottom nav

**Files:**
- Modify: `src/client/components/chat/ChatSidebar.vue` (457 lines)

**What to do:**

The sidebar already has the conversation list with search and grouping. Add:

1. **Bottom navigation section** — 4 icon buttons with tooltips:
   - 🏪 Market → `router.push({ name: 'Market' })`
   - 🎭 My Characters → `router.push({ name: 'MyCharacters' })`
   - ⚙️ Settings → `router.push({ name: 'Profile' })` (settings hub)
   - 👤 User avatar → dropdown menu (Profile, Security, Account, Subscription, Plugins, Developer, Analytics, Admin [if admin], Logout)

2. **Sidebar collapse toggle** — button to collapse sidebar to 0px width

3. **Style updates:**
   - Background: `var(--sidebar-bg)` or `#f9f9f9` light / `#171717` dark
   - Width: `280px` (not the old 320px from Chat.vue)
   - Bottom nav: `border-top: 1px solid var(--border-default)`, icons in a row with `gap: 8px`

Keep all existing functionality: search, grouped chat list, rename/delete actions.

**Commit:** `feat: add bottom nav icons and collapse toggle to ChatSidebar`

---

### Task 7: Create `WelcomePage.vue` — new chat character selection

**Files:**
- Create: `src/client/components/chat/WelcomePage.vue`

**What to do:**

Create the inline welcome page shown when no chat is selected or [+ New Chat] is clicked:

```
┌────────────────────────────────────────────┐
│                                            │
│        Start a new conversation            │
│        Choose a character to chat with     │
│                                            │
│        [🔍 Search characters...     ]      │
│                                            │
│        Recent Characters                   │
│        ┌──────┐ ┌──────┐ ┌──────┐         │
│        │ 🎭   │ │ 🧙   │ │ 🤖   │         │
│        │ Luna │ │ Aria │ │ Rex  │         │
│        │ 温柔 │ │ 智慧 │ │ 幽默 │         │
│        └──────┘ └──────┘ └──────┘         │
│                                            │
│        [Browse Market →]                   │
│                                            │
└────────────────────────────────────────────┘
```

Implementation:
- Fetch user's characters via `characterApi.getCharacters()`
- Search input filters characters in real-time
- Character cards: avatar + name + short description/tagline
- Click a character → emit `@select-character` with characterId
- "Browse Market" link → `router.push({ name: 'Market' })`
- If no characters: show "Create your first character" CTA
- Centered layout with `max-width: 600px`

**Commit:** `feat: create WelcomePage for inline character selection`

---

### Task 8: Restructure `Chat.vue` — integrate new layout

**Files:**
- Modify: `src/client/pages/Chat.vue` (592 lines → major rewrite)

**What to do:**

Replace the current `DashboardLayout`-wrapped structure with `ChatLayout`:

**Before:**
```vue
<DashboardLayout>
  <div class="chat-page">
    <div class="sidebar-container">...</div>
    <div class="chat-window-container">...</div>
    <el-dialog v-model="showNewChatDialog">...</el-dialog>
  </div>
</DashboardLayout>
```

**After:**
```vue
<ChatLayout>
  <!-- Main area: either WelcomePage or ChatWindow -->
  <WelcomePage
    v-if="!currentChatId"
    @select-character="handleSelectCharacter"
  />
  <ChatWindow
    v-else
    :current-chat="currentChat"
  />
</ChatLayout>
```

Key changes:
- Remove `DashboardLayout` import, use `ChatLayout`
- Remove the `el-dialog` for new chat (replaced by `WelcomePage`)
- Remove the inline sidebar container (now inside `ChatLayout`)
- The `ChatSidebar` is now rendered inside `ChatLayout`, not `Chat.vue`
- `Chat.vue` becomes a thin wrapper that decides between `WelcomePage` and `ChatWindow`
- Move sidebar event handlers (`@new-chat`, `@select-chat`) into `ChatLayout` or keep in `Chat.vue` via provide/inject
- Remove the 16 `console.log` statements (replace with logger or remove)

**Commit:** `feat: restructure Chat.vue to use ChatLayout with inline WelcomePage`

---

### Task 9: Update `ChatWindow.vue` header for new layout

**Files:**
- Modify: `src/client/components/chat/ChatWindow.vue` (811 lines)

**What to do:**

Update the chat header to match the new design:

**Before:** Character avatar + name + intelligence drawer toggle + dropdown menu
**After:** Character name + emotion tag + [Memory] [Debug] buttons on the right

Changes:
- Simplify header: character name (bold) + emotion emoji/text on the left
- Right side: `ConnectionIndicator` + `NotificationBell` + [Memory] button + [Debug] button + dropdown menu (rename/delete)
- Remove the `DataAnalysis` icon toggle for intelligence drawer — replace with explicit [Memory] and [Debug] buttons
- Keep the intelligence drawer (`el-drawer`) but trigger it from the new buttons
- Update the streaming message rendering to use `MarkdownRenderer` instead of inline `marked.parse()`

**Commit:** `feat: update ChatWindow header for chat-centric layout`

---

### Task 10: Update routes — chat as default landing page

**Files:**
- Modify: `src/client/router/routes.ts` (lines 48-56)
- Modify: `src/client/router/index.ts` (lines 44-55)

**What to do:**

1. In `routes.ts`:
   - Change Dashboard route to redirect to `/chat`:
     ```ts
     {
       path: '/dashboard',
       name: 'Dashboard',
       redirect: { name: 'Chat' },
       meta: { requiresAuth: true, guestOnly: false },
     },
     ```
   - Remove `loadDashboard` import (line 6)

2. In `index.ts`:
   - Line 46: Change `next({ name: 'Dashboard' })` → `next({ name: 'Chat' })`
   - Line 55: Change `next({ name: 'Dashboard' })` → `next({ name: 'Chat' })`

**Commit:** `feat: make /chat the default authenticated landing page`

---

### Task 11: Update dark mode CSS variables

**Files:**
- Modify: `src/client/styles/variables.css` (or wherever CSS variables are defined)

**What to do:**

Add/update CSS variables for the new chat-centric design:

| Variable | Light | Dark |
|----------|-------|------|
| `--chat-bg` | `#ffffff` | `#0d0d0d` |
| `--chat-sidebar-bg` | `#f9f9f9` | `#171717` |
| `--chat-user-msg-bg` | `#f5f5f5` | `#222222` |
| `--chat-divider` | `#e5e5e5` | `#333333` |
| `--chat-assistant-msg-bg` | `#fafafa` | `#1a1a1a` |

Keep existing CSS variable system intact. These are additive.

**Commit:** `style: add chat-centric CSS variables for light/dark mode`

---

### Task 12: Update E2E tests for new routing

**Files:**
- Modify: `e2e/intelligence.spec.ts` (line 50)
- Modify: any other E2E tests that `waitForURL(/\/dashboard/)` after login

**What to do:**

1. In `intelligence.spec.ts` line 50:
   - Change `await page.waitForURL(/\/dashboard|\\/$/, { timeout: 15000 })` → `await page.waitForURL(/\/chat|\/dashboard|\\/$/, { timeout: 15000 })`

2. Search all E2E files for `waitForURL` patterns referencing `/dashboard` and update them to also accept `/chat`.

3. Run `npx vitest run` — all unit tests should pass.

**Commit:** `test: update E2E tests for chat-centric routing`

---

### Task 13: Cleanup — remove deprecated files

**Files:**
- Delete: `src/client/pages/Dashboard.vue`
- Delete: `src/client/components/layout/DashboardLayout.vue`
- Delete: `src/client/components/layout/LeftSidebar.vue`
- Modify: any files that import the deleted components (update or remove imports)

**What to do:**

1. Search for all imports of `Dashboard.vue`, `DashboardLayout.vue`, `LeftSidebar.vue`
2. Remove or update those imports:
   - `routes.ts`: Remove `loadDashboard` import (if not already done in Task 10)
   - Any page that uses `<DashboardLayout>` as wrapper: switch to `ChatLayout` or a generic layout
   - Check: Market.vue, MyCharacters.vue, Profile.vue, Subscription.vue, etc. — these pages currently use `DashboardLayout`. They should continue to use it OR switch to a simpler wrapper. **Decision: Keep `DashboardLayout` for non-chat pages for now, only delete if all pages are migrated.** If other pages still import `DashboardLayout`, do NOT delete it yet — only delete `LeftSidebar.vue` (replaced by ChatSidebar bottom nav) and `Dashboard.vue` (replaced by redirect).
3. Delete the files that are no longer imported anywhere
4. Run `npx vitest run` — all tests should pass
5. Run `npm run build` — verify production build succeeds

**Commit:** `chore: remove deprecated Dashboard.vue and update imports`

---

### Task 14: Final verification + docs update

**Files:**
- Modify: `ROADMAP.md` — add Iteration 13 section
- Modify: `CLAUDE.md` — update status

**What to do:**

1. Run `npx vitest run` — confirm all tests pass
2. Run `npm run build` — confirm production build succeeds
3. Verify no TypeScript errors: `npx tsc --noEmit`
4. Update `ROADMAP.md` with Iteration 13 (Chat-Centric UI Redesign) section
5. Update `CLAUDE.md` status to "Iteration 13 Complete"

**Commit:** `docs: update ROADMAP.md and CLAUDE.md for Iteration 13 (Chat-Centric UI Redesign)`
