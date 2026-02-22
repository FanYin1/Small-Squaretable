# Iteration 23: Chat Experience Optimization

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Enhance the chat experience with message search, chat export, conversation rollback, message bookmarks, and chat templates — making conversations more navigable, portable, and reusable.

**Architecture:** Five features layered on the existing chat system. Message search adds an ILIKE query endpoint + search UI in the sidebar. Chat export serializes conversations to JSON/Markdown/TXT. Rollback adds a "rollback to here" action that deletes messages after a given point. Bookmarks use a new `message_bookmarks` table with toggle UI on messages. Chat templates use a new `chat_templates` table with a template selector in the welcome page.

**Tech Stack:** PostgreSQL + Drizzle ORM, Hono.js + Zod, Vue 3 + Pinia + Element Plus, Vitest

---

### Task 1: Add message search to repository and API

**Files:**
- Modify: `src/db/repositories/message.repository.ts`
- Modify: `src/server/routes/chats.ts`

**What to do:**

1. Add a `searchByChatId` method to `MessageRepository`:

```ts
async searchByChatId(chatId: string, query: string, limit = 50): Promise<Message[]> {
  return this.db.select().from(messages)
    .where(and(
      eq(messages.chatId, chatId),
      sql`${messages.content} ILIKE ${'%' + query + '%'}`
    ))
    .orderBy(desc(messages.sentAt))
    .limit(limit);
}
```

2. Add a search endpoint to `chats.ts`:

```ts
// GET /:id/messages/search?q=keyword&limit=50
```

Validation schema:
```ts
const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
```

Endpoint: `GET /:id/messages/search` — authMiddleware, ownership check (fetch chat, verify userId), zValidator('query', searchQuerySchema), call `messageRepository.searchByChatId()`, return `ApiResponse` with messages array.

Follow the existing IDOR pattern from `GET /:id/messages` in `chats.ts`.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'message.repository|chats\.ts' | head -5`

**Commit:** `feat(server): add message search endpoint with ILIKE query`

---

### Task 2: Add chat export endpoint

**Files:**
- Modify: `src/server/routes/chats.ts`

**What to do:**

Add a `GET /:id/export` endpoint that exports the full chat in one of three formats.

Validation schema:
```ts
const exportQuerySchema = z.object({
  format: z.enum(['json', 'markdown', 'txt']).default('json'),
});
```

Logic:
1. Auth + ownership check (same pattern as GET /:id)
2. Fetch chat metadata via `chatRepository.findByIdAndTenant()`
3. Fetch ALL messages via `messageRepository.findByChatId(chatId)` (no pagination)
4. Format based on `format` param:

**JSON format:**
```json
{
  "chat": { "id": "...", "title": "...", "characterName": "...", "createdAt": "..." },
  "messages": [
    { "role": "user", "content": "...", "sentAt": "..." },
    { "role": "assistant", "content": "...", "characterId": "...", "sentAt": "..." }
  ],
  "exportedAt": "..."
}
```

**Markdown format:**
```markdown
# Chat: {title}
Created: {date}

---

**You**: {content}

**{characterName}**: {content}

---
Exported at {date}
```

**TXT format:**
```
Chat: {title}
Created: {date}
---
[You]: {content}
[{characterName}]: {content}
---
Exported at {date}
```

Set response headers:
- `Content-Type`: `application/json`, `text/markdown`, or `text/plain`
- `Content-Disposition`: `attachment; filename="chat-{id}.{ext}"`

For JSON, use `c.json()`. For markdown/txt, use `c.text()` with appropriate headers.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'chats\.ts' | head -5`

**Commit:** `feat(server): add chat export endpoint (JSON/Markdown/TXT)`

---

### Task 3: Add conversation rollback endpoint

**Files:**
- Modify: `src/db/repositories/message.repository.ts`
- Modify: `src/server/routes/chats.ts`

**What to do:**

1. Add a `deleteAfter` method to `MessageRepository`:

```ts
async deleteAfter(chatId: string, messageId: number): Promise<number> {
  const result = await this.db.delete(messages)
    .where(and(
      eq(messages.chatId, chatId),
      gt(messages.id, messageId)
    ))
    .returning();
  return result.length;
}
```

2. Add a rollback endpoint:

`POST /:id/rollback` — authMiddleware, ownership check, body: `{ messageId: number }`.

```ts
const rollbackSchema = z.object({
  messageId: z.number().int().positive(),
});
```

Logic:
1. Verify chat ownership
2. Verify the target message belongs to this chat (`messageRepository.findById()`, check `chatId` matches)
3. Call `messageRepository.deleteAfter(chatId, messageId)` to delete all messages after the target
4. Return `{ deletedCount: N }` in ApiResponse

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'message.repository|chats\.ts' | head -5`

**Commit:** `feat(server): add conversation rollback endpoint`

---

### Task 4: Create message bookmarks schema, repository, and routes

**Files:**
- Create: `src/db/schema/message-bookmarks.ts`
- Modify: `src/db/schema/index.ts` — add export
- Create: `src/db/repositories/message-bookmark.repository.ts`
- Modify: `src/server/routes/chats.ts` — add bookmark endpoints

**What to do:**

1. Schema (`message-bookmarks.ts`):

```ts
import { pgTable, uuid, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { messages } from './chats';

export const messageBookmarks = pgTable('message_bookmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageId: integer('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type MessageBookmark = typeof messageBookmarks.$inferSelect;
export type NewMessageBookmark = typeof messageBookmarks.$inferInsert;
```

2. Add `export * from './message-bookmarks';` to `src/db/schema/index.ts`.

3. Repository (`message-bookmark.repository.ts`):

```ts
// Methods:
// findByUser(userId, limit?, offset?) — paginated, ordered by createdAt DESC
// findByMessage(userId, messageId) — check if bookmarked
// create(data: NewMessageBookmark) — insert
// delete(id, userId) — delete with ownership check
// deleteByMessage(userId, messageId) — toggle off
// countByUser(userId) — total count
```

4. Add bookmark endpoints to `chats.ts`:

- `POST /:id/messages/:messageId/bookmark` — create bookmark (auth, verify message belongs to chat)
- `DELETE /:id/messages/:messageId/bookmark` — remove bookmark
- `GET /bookmarks` — list user's bookmarks across all chats (auth, paginated)

The `GET /bookmarks` endpoint should join with messages to return message content and chatId.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'bookmark|chats\.ts' | head -5`

**Commit:** `feat: add message bookmarks schema, repository, and API routes`

---

### Task 5: Create chat templates schema, repository, and routes

**Files:**
- Create: `src/db/schema/chat-templates.ts`
- Modify: `src/db/schema/index.ts` — add export
- Create: `src/db/repositories/chat-template.repository.ts`
- Create: `src/server/routes/chat-templates.ts`
- Modify: `src/server/index.ts` — mount route

**What to do:**

1. Schema (`chat-templates.ts`):

```ts
import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const chatTemplates = pgTable('chat_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt'),
  firstMessage: text('first_message'),
  tags: jsonb('tags').default([]).notNull(),
  isPublic: boolean('is_public').default(false).notNull(),
  usageCount: integer('usage_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Import `integer` from `drizzle-orm/pg-core`.

2. Add export to `src/db/schema/index.ts`.

3. Repository with methods: `findById`, `findByUser`, `findPublic(limit, offset)`, `create`, `update`, `delete`, `incrementUsageCount`.

4. Routes (`chat-templates.ts`) mounted at `/api/v1/chat-templates`:

- `GET /` — list user's templates + public templates
- `POST /` — create template (auth, zValidator)
- `GET /:id` — get template
- `PATCH /:id` — update template (auth, ownership)
- `DELETE /:id` — delete template (auth, ownership)
- `POST /:id/use` — increment usage count, return template data for chat creation

Validation schemas:
```ts
const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  systemPrompt: z.string().max(10000).optional(),
  firstMessage: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(10).default([]),
  isPublic: z.boolean().default(false),
});
```

5. Mount in `src/server/index.ts`:
```ts
import { chatTemplatesRouter } from './routes/chat-templates';
app.route('/api/v1/chat-templates', chatTemplatesRouter);
```

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'chat-template|index\.ts' | head -5`

**Commit:** `feat: add chat templates schema, repository, and API routes`

---

### Task 6: Frontend — message search UI and chat API updates

**Files:**
- Modify: `src/client/services/chat.api.ts` — add search, export, rollback, bookmark, template methods
- Modify: `src/client/stores/chat.ts` — add search state and actions

**What to do:**

1. Add new methods to `chat.api.ts`:

```ts
// Search
searchMessages: (chatId: string, q: string, limit?: number) =>
  api.get<Message[]>(`/chats/${chatId}/messages/search`, { params: { q, limit } }),

// Export
exportChat: (chatId: string, format: 'json' | 'markdown' | 'txt') =>
  api.getRaw(`/chats/${chatId}/export?format=${format}`),

// Rollback
rollbackChat: (chatId: string, messageId: number) =>
  api.post<{ deletedCount: number }>(`/chats/${chatId}/rollback`, { messageId }),

// Bookmarks
bookmarkMessage: (chatId: string, messageId: string) =>
  api.post(`/chats/${chatId}/messages/${messageId}/bookmark`),
unbookmarkMessage: (chatId: string, messageId: string) =>
  api.delete(`/chats/${chatId}/messages/${messageId}/bookmark`),
getBookmarks: (params?: { limit?: number; offset?: number }) =>
  api.get<any[]>('/chats/bookmarks', { params }),
```

For `exportChat`, add a `getRaw` method to the api helper that returns the raw Response (not parsed JSON), or use `fetch` directly. The caller will handle blob download.

2. Add search state to `chat.ts` store:

```ts
const searchResults = ref<Message[]>([]);
const searchQuery = ref('');
const searching = ref(false);

async function searchMessages(query: string) {
  if (!currentChatId.value || !query.trim()) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    const res = await chatApi.searchMessages(currentChatId.value, query);
    searchResults.value = res;
  } catch { searchResults.value = []; }
  finally { searching.value = false; }
}

function clearSearch() {
  searchQuery.value = '';
  searchResults.value = [];
}
```

Return `searchResults`, `searchQuery`, `searching`, `searchMessages`, `clearSearch` from the store.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'chat\.api|chat\.ts' | head -5`

**Commit:** `feat(client): add chat search, export, rollback, bookmark API methods and search store state`

---

### Task 7: Frontend — chat export and rollback UI in ChatWindow

**Files:**
- Modify: `src/client/components/chat/ChatWindow.vue`
- Modify: `src/client/components/chat/MessageBubble.vue`

**What to do:**

1. **ChatWindow dropdown menu** — add export and search commands:

In the `<el-dropdown-menu>` (currently has "rename" and "delete"), add:
```html
<el-dropdown-item command="search">{{ t('chat.searchMessages') }}</el-dropdown-item>
<el-dropdown-item command="export-json">{{ t('chat.exportJson') }}</el-dropdown-item>
<el-dropdown-item command="export-md">{{ t('chat.exportMarkdown') }}</el-dropdown-item>
<el-dropdown-item command="export-txt">{{ t('chat.exportText') }}</el-dropdown-item>
```

Add `handleMenuCommand` cases:
- `search`: toggle a search bar visibility ref
- `export-json`/`export-md`/`export-txt`: call `chatApi.exportChat()`, create a Blob, trigger download via `URL.createObjectURL` + hidden `<a>` click

2. **Search bar** — add a collapsible search input below the header:

```html
<div v-if="showSearch" class="chat-search-bar">
  <el-input v-model="chatStore.searchQuery" :placeholder="t('chat.searchMessages')"
    clearable @input="debouncedSearch" :prefix-icon="Search" />
  <span v-if="chatStore.searchResults.length">{{ chatStore.searchResults.length }} {{ t('chat.results') }}</span>
</div>
```

When search results exist, highlight/scroll to matching messages or show a results overlay.

3. **MessageBubble rollback** — add a "Rollback" action button for user messages:

```html
<button class="action-btn" @click="handleRollback" :aria-label="t('chat.rollbackToHere')">
  {{ t('chat.rollbackToHere') }}
</button>
```

Add `rollback` emit: `(e: 'rollback', messageId: string): void`.

In ChatWindow, handle the rollback event:
```ts
const handleRollback = async (messageId: string) => {
  const confirmed = await ElMessageBox.confirm(t('chat.rollbackConfirm'), t('common.confirm'));
  if (confirmed) {
    await chatApi.rollbackChat(currentChat.value.id, Number(messageId));
    await chatStore.fetchMessages(currentChat.value.id);
  }
};
```

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'ChatWindow|MessageBubble' | head -5`

**Commit:** `feat(client): add chat export, search bar, and rollback UI`

---

### Task 8: Frontend — bookmark toggle and bookmarks panel

**Files:**
- Modify: `src/client/components/chat/MessageBubble.vue` — add bookmark toggle
- Create: `src/client/stores/bookmark.ts` — bookmark Pinia store
- Modify: `src/client/components/chat/ChatSidebar.vue` — add bookmarks section

**What to do:**

1. **Bookmark store** (`bookmark.ts`):

```ts
export const useBookmarkStore = defineStore('bookmark', () => {
  const bookmarks = ref<BookmarkItem[]>([]);
  const bookmarkedMessageIds = ref<Set<string>>(new Set());
  const loading = ref(false);

  async function fetchBookmarks() { ... }
  async function toggleBookmark(chatId: string, messageId: string) { ... }
  function isBookmarked(messageId: string): boolean { ... }

  return { bookmarks, bookmarkedMessageIds, loading, fetchBookmarks, toggleBookmark, isBookmarked };
});
```

2. **MessageBubble bookmark toggle** — add a bookmark button to message actions:

```html
<button
  :class="['action-btn', { 'action-btn--active': bookmarkStore.isBookmarked(message.id) }]"
  @click="handleBookmark"
  :aria-label="t('chat.bookmarkMessage')"
>
  {{ bookmarkStore.isBookmarked(message.id) ? t('chat.bookmarked') : t('chat.bookmark') }}
</button>
```

3. **ChatSidebar bookmarks section** — add a "Bookmarks" tab or section at the bottom of the sidebar:

Add a toggle between "Chats" and "Bookmarks" views in the sidebar. When "Bookmarks" is active, show a list of bookmarked messages with:
- Message content preview (truncated)
- Chat title
- Timestamp
- Click navigates to that chat and scrolls to the message

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'bookmark|MessageBubble|ChatSidebar' | head -5`

**Commit:** `feat(client): add bookmark toggle on messages and bookmarks panel in sidebar`

---

### Task 9: Frontend — chat templates UI

**Files:**
- Create: `src/client/services/chat-template.api.ts`
- Create: `src/client/stores/chatTemplate.ts`
- Modify: `src/client/components/chat/WelcomePage.vue` — add template selector

**What to do:**

1. **API service** (`chat-template.api.ts`):

```ts
export const chatTemplateApi = {
  getTemplates: () => api.get<ChatTemplate[]>('/chat-templates'),
  createTemplate: (data: CreateTemplateInput) => api.post<ChatTemplate>('/chat-templates', data),
  updateTemplate: (id: string, data: Partial<CreateTemplateInput>) => api.patch<ChatTemplate>(`/chat-templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/chat-templates/${id}`),
  useTemplate: (id: string) => api.post<ChatTemplate>(`/chat-templates/${id}/use`),
};
```

2. **Pinia store** (`chatTemplate.ts`):

```ts
export const useChatTemplateStore = defineStore('chatTemplate', () => {
  const templates = ref<ChatTemplate[]>([]);
  const loading = ref(false);

  async function fetchTemplates() { ... }
  async function createTemplate(data) { ... }
  async function deleteTemplate(id) { ... }

  return { templates, loading, fetchTemplates, createTemplate, deleteTemplate };
});
```

3. **WelcomePage template selector** — add a "Templates" section above or below the character grid:

```html
<div v-if="templates.length > 0" class="templates-section">
  <div class="section-title">{{ t('chat.templates') }}</div>
  <div class="template-grid">
    <div v-for="tpl in templates" :key="tpl.id" class="template-card" @click="useTemplate(tpl)">
      <span class="template-name">{{ tpl.name }}</span>
      <span class="template-desc">{{ tpl.description }}</span>
      <div class="template-tags">
        <el-tag v-for="tag in tpl.tags" :key="tag" size="small">{{ tag }}</el-tag>
      </div>
    </div>
  </div>
</div>
```

When a template is clicked:
1. Call `chatTemplateApi.useTemplate(id)` to increment usage
2. If the template has a `firstMessage`, emit a special event or create the chat with the first message pre-populated
3. Navigate to the new chat

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'chat-template|chatTemplate|WelcomePage' | head -5`

**Commit:** `feat(client): add chat templates API, store, and template selector in WelcomePage`

---

### Task 10: Add i18n keys for all new features

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

Add keys to the `chat` section:

```json
{
  "chat": {
    "searchMessages": "Search messages",
    "results": "results",
    "noSearchResults": "No messages found",
    "exportJson": "Export as JSON",
    "exportMarkdown": "Export as Markdown",
    "exportText": "Export as Text",
    "exportSuccess": "Chat exported successfully",
    "exportFailed": "Failed to export chat",
    "rollbackToHere": "Rollback to here",
    "rollbackConfirm": "Delete all messages after this point? This cannot be undone.",
    "rollbackSuccess": "Rolled back successfully, {count} messages removed",
    "rollbackFailed": "Failed to rollback",
    "bookmark": "Bookmark",
    "bookmarked": "Bookmarked",
    "bookmarkMessage": "Bookmark this message",
    "unbookmarkMessage": "Remove bookmark",
    "bookmarks": "Bookmarks",
    "noBookmarks": "No bookmarks yet",
    "templates": "Templates",
    "noTemplates": "No templates yet",
    "createTemplate": "Create Template",
    "templateName": "Template Name",
    "templateDescription": "Description",
    "templateSystemPrompt": "System Prompt",
    "templateFirstMessage": "First Message",
    "templateTags": "Tags",
    "templatePublic": "Public",
    "templateCreated": "Template created",
    "templateDeleted": "Template deleted",
    "useTemplate": "Use Template"
  }
}
```

Add corresponding zh-CN translations:

```json
{
  "chat": {
    "searchMessages": "搜索消息",
    "results": "条结果",
    "noSearchResults": "未找到消息",
    "exportJson": "导出为 JSON",
    "exportMarkdown": "导出为 Markdown",
    "exportText": "导出为文本",
    "exportSuccess": "聊天导出成功",
    "exportFailed": "导出失败",
    "rollbackToHere": "回溯到此处",
    "rollbackConfirm": "删除此消息之后的所有消息？此操作不可撤销。",
    "rollbackSuccess": "回溯成功，已删除 {count} 条消息",
    "rollbackFailed": "回溯失败",
    "bookmark": "收藏",
    "bookmarked": "已收藏",
    "bookmarkMessage": "收藏此消息",
    "unbookmarkMessage": "取消收藏",
    "bookmarks": "收藏夹",
    "noBookmarks": "暂无收藏",
    "templates": "模板",
    "noTemplates": "暂无模板",
    "createTemplate": "创建模板",
    "templateName": "模板名称",
    "templateDescription": "描述",
    "templateSystemPrompt": "系统提示词",
    "templateFirstMessage": "首条消息",
    "templateTags": "标签",
    "templatePublic": "公开",
    "templateCreated": "模板已创建",
    "templateDeleted": "模板已删除",
    "useTemplate": "使用模板"
  }
}
```

**Verification:**
Run: `node -e "JSON.parse(require('fs').readFileSync('src/client/i18n/locales/en-US.json'))"`

**Commit:** `feat(i18n): add chat search, export, rollback, bookmark, and template translations`

---

### Task 11: Final verification and docs update

**What to do:**

1. Run `npx tsc --noEmit` — expect 0 errors
2. Run `npx vitest run` — expect all tests passing
3. Run `npm run build` — expect clean production build
4. Update `ROADMAP.md` — add Iteration 23 entry:
```markdown
### 迭代 23: 聊天体验优化 ✅ (2026-02-22)
- ✅ **消息搜索** — ILIKE 全文搜索 + 聊天窗口搜索栏
- ✅ **聊天导出** — JSON/Markdown/TXT 三种格式导出
- ✅ **对话回溯** — 回溯到指定消息 (删除后续消息)
- ✅ **消息收藏** — message_bookmarks 表 + 收藏切换 + 侧边栏收藏面板
- ✅ **聊天模板** — chat_templates 表 + CRUD API + 欢迎页模板选择器
- ✅ **i18n** — chat.* 新增 30+ 键 (en-US + zh-CN)
```

**Commit:** `docs: update ROADMAP.md for Iteration 23 (chat experience optimization)`

---

## Verification

After all tasks:
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — all tests passing
- `npm run build` — production build succeeds
- Messages can be searched within a chat via the search bar
- Chats can be exported as JSON, Markdown, or TXT files
- Users can rollback a conversation to any message
- Messages can be bookmarked/unbookmarked with a sidebar bookmarks panel
- Chat templates can be created, browsed, and used to start new conversations
