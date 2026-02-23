# Iteration 39: Advanced Chat Features — Tests + Summary Generation + Template Management UI

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add test coverage for existing bookmark/branching/template features, add LLM-based conversation summary generation, and add a chat template management UI.

**Architecture:** 5 tasks. T1 adds backend route tests for bookmarks + branching. T2 adds frontend store tests for bookmarks + chat templates. T3 adds conversation summary generation (server endpoint + LLM call). T4 adds chat template management UI (create/edit/delete page). T5 runs final verification. T1-T4 are independent.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Vitest

---

### Task 1: Add backend route tests for bookmarks and branching

**Files:**
- Create: `src/server/routes/chat-bookmarks.spec.ts`
- Create: `src/server/routes/chat-branches.spec.ts`

**What to do:**

The bookmark and branching endpoints exist in `src/server/routes/chats.ts` but have no tests.

**Bookmark endpoints** (in chats.ts):
- `GET /chats/bookmarks` — list user bookmarks (line 180)
- `POST /chats/:id/messages/:messageId/bookmark` — create bookmark (line 766)
- `DELETE /chats/:id/messages/:messageId/bookmark` — delete bookmark (line 852)

**Branching endpoints** (in chats.ts):
- `GET /chats/:id/branches/:messageId` — get siblings for a message (line 579)

1. Create `chat-bookmarks.spec.ts` with ~5 tests:
- List bookmarks returns user's bookmarks
- Create bookmark returns 201
- Create duplicate bookmark returns 409
- Delete bookmark returns 200
- List bookmarks with pagination

Mock: `messageBookmarkRepository` (findByUser, findByMessage, create, deleteByMessage), `messageRepository` (findById), `chatRepository` (findById), auth middleware.

2. Create `chat-branches.spec.ts` with ~3 tests:
- Get siblings returns sibling messages
- Get siblings for message with no parent returns single message
- Returns 404 for non-existent message

Mock: `messageRepository` (findById, findSiblings), `chatRepository` (findById), auth middleware.

Follow the mocking patterns from existing route tests like `character-versions.spec.ts`.

**Tests:** 8 total
**Commit:** `test(chat): add bookmark and branching route tests`

---

### Task 2: Add frontend store tests for bookmarks and chat templates

**Files:**
- Create: `src/client/stores/bookmark.spec.ts`
- Create: `src/client/stores/chatTemplate.spec.ts`

**What to do:**

1. `bookmark.spec.ts` — ~5 tests:
- `fetchBookmarks` populates bookmarks and bookmarkedMessageIds
- `toggleBookmark` removes bookmark when already bookmarked
- `toggleBookmark` adds bookmark when not bookmarked
- `isBookmarked` returns correct boolean
- Handles API errors gracefully

Mock `chatApi.getBookmarks`, `chatApi.bookmarkMessage`, `chatApi.unbookmarkMessage`.

2. `chatTemplate.spec.ts` — ~4 tests:
- `fetchTemplates` populates ownTemplates and publicTemplates
- `createTemplate` adds to ownTemplates
- `deleteTemplate` removes from ownTemplates
- `useTemplate` calls API

Mock `chatTemplateApi` methods.

**Tests:** 9 total
**Commit:** `test(client): add bookmark and chat template store tests`

---

### Task 3: Add conversation summary generation

**Files:**
- Modify: `src/server/routes/chats.ts`
- Modify: `src/server/services/chat.service.ts`

**What to do:**

The `chats` table has a `summary` field but no generation logic. Add an endpoint that generates a summary using the LLM.

1. In `chat.service.ts`, add a `generateSummary` method:
```ts
async generateSummary(chatId: string, userId: string): Promise<string> {
  const messages = await messageRepository.findByChatId(chatId, { limit: 100 });
  if (messages.length === 0) {
    throw new AppError('No messages to summarize', 400, 'NO_MESSAGES');
  }

  // Build conversation text
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  // Call LLM for summary
  const response = await llmService.chatCompletion({
    model: getDefaultModel(),
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant. Summarize the following conversation in 2-3 sentences. Focus on the key topics discussed and any conclusions reached.',
      },
      {
        role: 'user',
        content: conversationText,
      },
    ],
    stream: false,
    temperature: 0.3,
    n: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
  });

  const summary = response.choices?.[0]?.message?.content || 'Unable to generate summary';

  // Save summary to chat
  await chatRepository.update(chatId, { summary });

  return summary;
}
```

Check the actual `ChatCompletionRequest` type in `src/types/llm.ts` to ensure all required fields are provided.

2. In `chats.ts`, add the endpoint:
```ts
chatRoutes.post('/:id/summary', authMiddleware(), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');

  // Verify chat ownership
  const chat = await chatRepository.findById(chatId);
  if (!chat || chat.userId !== user.id) {
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Chat not found' },
      meta: { timestamp: new Date().toISOString() },
    }, 404);
  }

  const summary = await chatService.generateSummary(chatId, user.id);

  return c.json<ApiResponse>({
    success: true,
    data: { summary },
    meta: { timestamp: new Date().toISOString() },
  });
});
```

3. Also add a `GET /:id/summary` endpoint that returns the stored summary without regenerating.

**Tests:** ~3 tests in `src/server/routes/chat-summary.spec.ts`
- Generate summary calls LLM and saves to chat
- Returns 404 for non-existent chat
- Returns 400 for chat with no messages

Mock: `llmService.chatCompletion`, `messageRepository.findByChatId`, `chatRepository` (findById, update).

**Commit:** `feat(chat): add conversation summary generation endpoint`

---

### Task 4: Add chat template management UI

**Files:**
- Create: `src/client/pages/ChatTemplates.vue`
- Modify: `src/client/router/index.ts`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

The chat template backend and store exist, but there's no dedicated management page (only WelcomePage shows templates for use). Add a page for creating/editing/deleting templates.

1. Create `ChatTemplates.vue` with:
- List of user's templates with name, description, tags
- Create button that opens a dialog with form (name, description, systemPrompt, firstMessage, tags, isPublic)
- Edit button per template (same dialog, pre-filled)
- Delete button per template with confirmation
- Use `useChatTemplateStore` for data
- Use `DashboardLayout` wrapper

2. Add route in `router/index.ts`:
```ts
{
  path: '/chat-templates',
  name: 'ChatTemplates',
  component: () => import('@client/pages/ChatTemplates.vue'),
  meta: { requiresAuth: true },
}
```

3. Add i18n keys under `chatTemplates` section:
- en-US: `"title": "Chat Templates"`, `"create": "Create Template"`, `"edit": "Edit Template"`, `"name": "Name"`, `"description": "Description"`, `"systemPrompt": "System Prompt"`, `"firstMessage": "First Message"`, `"tags": "Tags"`, `"isPublic": "Public"`, `"deleteConfirm": "Delete this template?"`, `"createSuccess": "Template created"`, `"updateSuccess": "Template updated"`, `"deleteSuccess": "Template deleted"`
- zh-CN: corresponding Chinese translations

4. Add a link to the templates page in the chat sidebar or navigation.

**Tests:** ~2 tests in `src/client/pages/ChatTemplates.spec.ts`
- Renders template list
- Create template dialog opens

**Commit:** `feat(ui): add chat template management page`

---

### Task 5: Final verification

**What to do:**

1. Run `npx vitest run` — expect 1880+ tests passing, 0 failures (excluding pre-existing MessageInput failures)
2. Run `npx tsc --noEmit` — expect 0 errors
3. Verify:
   - Bookmark route tests pass
   - Branch route tests pass
   - Summary generation endpoint works
   - Chat template management page renders

**Commit:** None (verification only).

---

## Verification

After all tasks:
- `npx vitest run` — 1880+ tests passing
- `npx tsc --noEmit` — 0 errors
- Bookmark and branching routes tested
- Bookmark and chat template stores tested
- Summary generation via LLM
- Chat template management UI
