# Iteration 45: Chat Enhancement (聊天增强)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add emoji reactions on messages, reply-to-message threading, and enhanced message action tests.

**Architecture:** 5 tasks. T1 adds message reactions (schema + API + UI). T2 adds reply-to-message threading (UI for quoting a message). T3 adds message pin functionality. T4 adds component interaction tests for MessageBubble. T5 runs final verification. T1 and T2 are independent.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Add message reactions

**Files:**
- Create: `src/db/schema/message-reactions.ts`
- Modify: `src/db/schema/index.ts`
- Modify: `src/server/routes/chats.ts`
- Modify: `src/client/stores/chat.ts`
- Modify: `src/client/components/chat/MessageBubble.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Create `message-reactions.ts` schema:
```ts
import { pgTable, uuid, bigint, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { messages } from './chats';
import { users } from './users';

export const messageReactions = pgTable('message_reactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: bigint('message_id', { mode: 'bigint' }).notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: varchar('emoji', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueReaction: uniqueIndex('unique_reaction_idx').on(table.messageId, table.userId, table.emoji),
}));
```

2. Export from `src/db/schema/index.ts`.

3. Add endpoints to `src/server/routes/chats.ts`:

```ts
// POST /:id/messages/:messageId/reactions — Toggle reaction
chatRoutes.post('/:id/messages/:messageId/reactions', authMiddleware(), async (c) => {
  const user = c.get('user');
  const messageId = c.req.param('messageId');
  const { emoji } = await c.req.json();

  // Check if reaction exists
  const existing = await db.select().from(messageReactions)
    .where(and(
      eq(messageReactions.messageId, BigInt(messageId)),
      eq(messageReactions.userId, user.id),
      eq(messageReactions.emoji, emoji),
    )).limit(1);

  if (existing.length > 0) {
    // Remove reaction
    await db.delete(messageReactions).where(eq(messageReactions.id, existing[0].id));
    return c.json<ApiResponse>({ success: true, data: { action: 'removed' }, meta: { timestamp: new Date().toISOString() } });
  } else {
    // Add reaction
    await db.insert(messageReactions).values({
      messageId: BigInt(messageId),
      userId: user.id,
      emoji,
    });
    return c.json<ApiResponse>({ success: true, data: { action: 'added' }, meta: { timestamp: new Date().toISOString() } });
  }
});

// GET /:id/messages/:messageId/reactions — Get reactions for a message
chatRoutes.get('/:id/messages/:messageId/reactions', authMiddleware(), async (c) => {
  const messageId = c.req.param('messageId');
  const reactions = await db.select().from(messageReactions)
    .where(eq(messageReactions.messageId, BigInt(messageId)));

  // Group by emoji
  const grouped: Record<string, { emoji: string; count: number; userIds: string[] }> = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
    grouped[r.emoji].count++;
    grouped[r.emoji].userIds.push(r.userId);
  }

  return c.json<ApiResponse>({
    success: true,
    data: Object.values(grouped),
    meta: { timestamp: new Date().toISOString() },
  });
});
```

4. Add to chat store:
```ts
// In state
reactions: new Map<string, Array<{ emoji: string; count: number; userIds: string[] }>>(),

// Actions
async toggleReaction(chatId: string, messageId: string, emoji: string) { ... },
async fetchReactions(chatId: string, messageId: string) { ... },
```

5. In `MessageBubble.vue`, add a reaction bar below each message:
- Show existing reactions as small emoji badges with counts
- Add a "+" button to open an emoji picker (simple preset: 👍 ❤️ 😂 😮 😢 🎉)
- Clicking an existing reaction toggles it

6. Add i18n keys under `chat`:
- en-US: `"reactions": "Reactions"`, `"addReaction": "Add Reaction"`
- zh-CN: `"reactions": "表情回应"`, `"addReaction": "添加回应"`

**Tests:** ~2 tests in `src/server/routes/chat-reactions.spec.ts`
- Toggle reaction adds then removes
- Get reactions returns grouped data

**Commit:** `feat(chat): add message reactions`

---

### Task 2: Add reply-to-message quoting

**Files:**
- Modify: `src/client/stores/chat.ts`
- Modify: `src/client/components/chat/MessageBubble.vue`
- Modify: `src/client/components/chat/MessageInput.vue`
- Modify: `src/client/components/chat/ChatWindow.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

The `messages` table already has `extra` (jsonb) field. We'll store `replyTo: { messageId, content, role }` in the `extra` field when replying to a message.

1. Add to chat store:
```ts
// State
replyingTo: null as { messageId: string; content: string; role: string } | null,

// Actions
setReplyTo(message: { id: string; content: string; role: string } | null) {
  this.replyingTo = message ? { messageId: message.id, content: message.content, role: message.role } : null;
},
```

2. In `MessageBubble.vue`, add a "Reply" action button (next to Copy, Bookmark, etc.):
```vue
<el-tooltip :content="t('chat.reply')">
  <el-button link @click="$emit('reply', { id: message.id, content: message.content, role: message.role })">
    <el-icon><ChatLineSquare /></el-icon>
  </el-button>
</el-tooltip>
```

Also, if the message has `extra?.replyTo`, show a quoted preview above the message content:
```vue
<div v-if="message.extra?.replyTo" class="reply-quote" @click="$emit('scrollToMessage', message.extra.replyTo.messageId)">
  <div class="reply-quote-role">{{ message.extra.replyTo.role }}</div>
  <div class="reply-quote-content">{{ truncate(message.extra.replyTo.content, 100) }}</div>
</div>
```

3. In `MessageInput.vue`, show a reply preview bar above the input when `replyingTo` is set:
```vue
<div v-if="chatStore.replyingTo" class="reply-preview">
  <div class="reply-preview-content">
    {{ t('chat.replyingTo') }}: {{ truncate(chatStore.replyingTo.content, 80) }}
  </div>
  <el-button link @click="chatStore.setReplyTo(null)">
    <el-icon><Close /></el-icon>
  </el-button>
</div>
```

4. Modify `sendMessage` in the store to include `replyTo` in the `extra` field when `replyingTo` is set:
```ts
const extra = this.replyingTo ? { replyTo: this.replyingTo } : undefined;
// Include extra in the API call body
this.replyingTo = null; // Clear after sending
```

5. In `ChatWindow.vue`, handle the `reply` event from MessageBubble:
```vue
<MessageBubble @reply="chatStore.setReplyTo($event)" />
```

6. Add i18n keys under `chat`:
- en-US: `"reply": "Reply"`, `"replyingTo": "Replying to"`
- zh-CN: `"reply": "回复"`, `"replyingTo": "回复"`

**Tests:** ~2 tests in `src/client/components/chat/MessageBubble.spec.ts` (add to existing file)
- Shows reply quote when message has replyTo in extra
- Emits reply event when reply button clicked

**Commit:** `feat(chat): add reply-to-message quoting`

---

### Task 3: Add message pinning

**Files:**
- Modify: `src/server/routes/chats.ts`
- Modify: `src/client/stores/chat.ts`
- Modify: `src/client/components/chat/MessageBubble.vue`
- Modify: `src/client/components/chat/ChatWindow.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

Use the existing `extra` jsonb field on messages to store `pinned: true`.

1. Add endpoints:
```ts
// POST /:id/messages/:messageId/pin — Pin a message
// DELETE /:id/messages/:messageId/pin — Unpin a message
// GET /:id/pinned — List pinned messages in a chat
```

Pin/unpin updates the message's `extra` field: `{ ...existing, pinned: true/false }`.

List pinned: query messages where `extra->>'pinned' = 'true'`.

2. Add to chat store: `pinnedMessages`, `fetchPinnedMessages`, `togglePin`.

3. In `MessageBubble.vue`, add a "Pin" action and show a pin indicator on pinned messages.

4. In `ChatWindow.vue`, add a "Pinned Messages" button in the header that opens a drawer/popover showing pinned messages.

5. Add i18n keys under `chat`:
- en-US: `"pin": "Pin"`, `"unpin": "Unpin"`, `"pinnedMessages": "Pinned Messages"`, `"noPinnedMessages": "No pinned messages"`
- zh-CN: `"pin": "置顶"`, `"unpin": "取消置顶"`, `"pinnedMessages": "置顶消息"`, `"noPinnedMessages": "暂无置顶消息"`

**Tests:** ~2 tests in `src/server/routes/chat-pin.spec.ts`
- Pin message returns success
- List pinned messages returns pinned items

**Commit:** `feat(chat): add message pinning`

---

### Task 4: Add MessageBubble interaction tests

**Files:**
- Modify: `src/client/components/chat/MessageBubble.spec.ts`

**What to do:**

Read the existing test file. Add ~4 new tests:
1. Emits delete event when delete button clicked
2. Emits regenerate event for assistant messages
3. Shows bookmark toggle button
4. Shows reaction bar when reactions exist

Follow existing test patterns in the file.

**Commit:** `test(chat): add MessageBubble interaction tests`

---

### Task 5: Final verification

**What to do:**

1. Run `npx vitest run` — expect 1960+ tests passing
2. Run `npx tsc --noEmit` — expect 0 errors

**Commit:** None (verification only).

---

## Verification

After all tasks:
- `npx vitest run` — 1960+ tests passing
- `npx tsc --noEmit` — 0 errors
- Message reactions (toggle emoji, grouped display)
- Reply-to quoting (quote preview, reply bar in input)
- Message pinning (pin/unpin, pinned list)
- MessageBubble interaction tests
