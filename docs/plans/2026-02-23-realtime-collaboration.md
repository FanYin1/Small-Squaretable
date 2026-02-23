# Iteration 35: Real-Time Collaboration & Group Chat Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete the half-implemented typing indicators and read receipts, add chat ownership verification to WebSocket join, add configurable group chat turn strategy, and add per-user connection limits — making the real-time system functional and secure.

**Architecture:** 6 tasks in dependency order. T1 fixes the WebSocket join_chat security gap. T2 completes typing indicators end-to-end. T3 implements read receipts with DB persistence. T4 adds configurable group chat strategy. T5 adds per-user WebSocket connection limits. T6 runs final verification. T1-T5 are independent.

**Tech Stack:** TypeScript strict, Hono.js, ws (WebSocket), Drizzle ORM, PostgreSQL, Vue 3, Vitest

---

### Task 1: Verify chat ownership on WebSocket join_chat

**Files:**
- Modify: `src/server/routes/websocket.ts` (handleJoinChat)
- Modify: `src/server/routes/websocket.spec.ts`

**What to do:**

The `handleJoinChat` handler calls `websocketService.joinChat(clientId, chatId)` without verifying the user owns the chat. A client that knows a chatId could join another tenant's chat room and receive messages.

1. **websocket.ts** — in `handleJoinChat`, add ownership check before joining:
```ts
async function handleJoinChat(clientId: string, data: { chatId: string }) {
  const clientInfo = websocketService.getClientInfo(clientId);
  if (!clientInfo) return;

  // Verify chat ownership
  const chat = await chatRepository.findById(data.chatId);
  if (!chat || chat.userId !== clientInfo.userId) {
    websocketService.sendToClient(clientId, {
      type: WSMessageType.ERROR,
      timestamp: new Date().toISOString(),
      data: { code: 'FORBIDDEN', message: 'You do not have access to this chat' },
    });
    return;
  }

  websocketService.joinChat(clientId, data.chatId);
}
```

Import `chatRepository` from `@/db/repositories/chat.repository`. Check if `chatRepository` has a `findById` method — if not, use the appropriate method (e.g., `getById`, `findOne`).

If `getClientInfo` doesn't exist on `websocketService`, check the service for the equivalent method to get client info by clientId.

**Tests**: ~3 tests
- join_chat succeeds for chat owner
- join_chat rejects non-owner with FORBIDDEN error
- join_chat rejects non-existent chat

**Commit:** `fix(ws): verify chat ownership on join_chat to prevent cross-tenant access`

---

### Task 2: Complete typing indicators end-to-end

**Files:**
- Modify: `src/client/stores/chat.ts` (send typing events)
- Modify: `src/client/components/chat/MessageInput.vue` (trigger typing)
- Modify: `src/client/components/chat/ChatWindow.vue` (display remote typing)
- Modify: `src/server/routes/websocket.ts` (add typing timeout)

**What to do:**

The typing indicator protocol exists (TYPING_START/STOP, USER_TYPING) and the server handler works, but the client never sends typing events and the UI doesn't display remote typing state.

1. **chat.ts store** — add typing state tracking:
```ts
// Add to state
const typingUsers = ref<Map<string, { userId: string; userName: string; timeout: ReturnType<typeof setTimeout> }>>(new Map());

// Add method to send typing events
function sendTypingStart() {
  const chatId = currentChatId.value;
  if (!chatId || !wsClient) return;
  wsClient.sendTyping(chatId, true);
}

function sendTypingStop() {
  const chatId = currentChatId.value;
  if (!chatId || !wsClient) return;
  wsClient.sendTyping(chatId, false);
}

// Handle incoming typing events (in the WS message handler)
// On 'userTyping' event:
function handleUserTyping(data: { chatId: string; userId: string; userName?: string; isTyping?: boolean }) {
  if (data.chatId !== currentChatId.value) return;
  const key = data.userId;

  // Clear existing timeout
  const existing = typingUsers.value.get(key);
  if (existing) clearTimeout(existing.timeout);

  if (data.isTyping !== false) {
    // Auto-clear after 5 seconds if no stop event
    const timeout = setTimeout(() => {
      typingUsers.value.delete(key);
    }, 5000);
    typingUsers.value.set(key, { userId: data.userId, userName: data.userName || 'Someone', timeout });
  } else {
    typingUsers.value.delete(key);
  }
}
```

Expose `typingUsers`, `sendTypingStart`, `sendTypingStop` from the store.

2. **MessageInput.vue** — add debounced typing events:
```ts
let typingTimeout: ReturnType<typeof setTimeout> | null = null;
let isTyping = false;

function handleInput() {
  const chatStore = useChatStore();

  if (!isTyping) {
    isTyping = true;
    chatStore.sendTypingStart();
  }

  // Reset the stop timer
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    chatStore.sendTypingStop();
  }, 2000);
}

// Call handleInput on input event of the textarea
// Also send stop on submit/blur
```

Wire `handleInput` to the textarea's `@input` event. Send `sendTypingStop()` when the message is submitted.

3. **ChatWindow.vue** — display typing indicator from remote users:
```html
<!-- After the message list, before the input -->
<div v-if="typingUserNames.length > 0" class="typing-indicator">
  <span class="typing-dots">
    <span></span><span></span><span></span>
  </span>
  <span class="typing-text">{{ typingUserNames.join(', ') }} {{ typingUserNames.length === 1 ? 'is' : 'are' }} typing...</span>
</div>
```

```ts
const chatStore = useChatStore();
const typingUserNames = computed(() => {
  return Array.from(chatStore.typingUsers.values()).map(u => u.userName);
});
```

4. **websocket.ts server** — the existing `handleTyping` already broadcasts. Enhance it to include `isTyping` boolean in the broadcast:
```ts
// In handleTyping, include whether it's start or stop:
const isTyping = parsed.type === WSMessageType.TYPING_START;
websocketService.broadcastToChat(clientInfo.chatId, {
  type: WSMessageType.USER_TYPING,
  timestamp: new Date().toISOString(),
  data: {
    chatId: clientInfo.chatId,
    userId: clientInfo.userId,
    userName: clientInfo.displayName || 'User',
    isTyping,
  },
}, clientId); // exclude sender
```

**Tests**: ~4 tests
- Typing start broadcasts USER_TYPING with isTyping=true
- Typing stop broadcasts USER_TYPING with isTyping=false
- Typing broadcast excludes the sender
- Typing broadcast includes userId and userName

**Commit:** `feat(ws): complete typing indicators with client send, debounce, and remote display`

---

### Task 3: Implement read receipts with DB persistence

**Files:**
- Create: `src/db/migrations/0027_chat_read_receipts.sql`
- Modify: `src/db/schema/chats.ts` (add lastReadMessageId column)
- Modify: `src/server/routes/websocket.ts` (handle CHAT_READ message)
- Modify: `src/server/services/websocket.service.ts` (add helper if needed)
- Modify: `src/client/stores/chat.ts` (send read receipts, track unread)
- Create: `src/server/routes/websocket-read-receipts.spec.ts`

**What to do:**

The `CHAT_READ` message type is defined but the server has no handler. Read state is not persisted.

1. **Migration** (`0027_chat_read_receipts.sql`):
```sql
-- Add last_read_message_id to chats for read receipt tracking
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_read_message_id BIGINT;

-- Add unread_count as a computed-friendly column (updated on message insert and read receipt)
ALTER TABLE chats ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;
```

2. **chats.ts schema** — add the new columns:
```ts
lastReadMessageId: bigint('last_read_message_id', { mode: 'number' }),
unreadCount: integer('unread_count').default(0).notNull(),
```

3. **websocket.ts** — add `CHAT_READ` handler in the message switch:
```ts
case WSMessageType.CHAT_READ:
  await handleChatRead(clientId, parsed.data);
  break;
```

Implement `handleChatRead`:
```ts
async function handleChatRead(clientId: string, data: { chatId: string; lastReadMessageId: string }) {
  const clientInfo = websocketService.getClientInfo(clientId);
  if (!clientInfo) return;

  // Update read state in DB
  await db.update(chats)
    .set({
      lastReadMessageId: Number(data.lastReadMessageId),
      unreadCount: 0,
    })
    .where(and(eq(chats.id, data.chatId), eq(chats.userId, clientInfo.userId)));

  // Broadcast to user's other devices
  websocketService.sendToUser(clientInfo.userId, {
    type: WSMessageType.CHAT_READ,
    timestamp: new Date().toISOString(),
    data: {
      chatId: data.chatId,
      lastReadMessageId: data.lastReadMessageId,
    },
  }, clientId); // exclude sender
}
```

Import `chats` schema, `db`, `and`, `eq` as needed.

4. **Increment unread count on new message** — in `handleUserMessage` (or wherever assistant messages are saved), after saving the message, increment `unreadCount` on the chat:
```ts
await db.update(chats)
  .set({ unreadCount: sql`${chats.unreadCount} + 1` })
  .where(eq(chats.id, chatId));
```

This should happen when an assistant message is saved (not user messages, since the user is already reading).

5. **chat.ts client store** — send read receipt when user views a chat:
```ts
// When joining a chat or when new messages arrive while chat is visible:
function markChatAsRead(chatId: string, lastMessageId: string) {
  if (!wsClient) return;
  wsClient.sendChatRead(chatId, lastMessageId);
  // Optimistically update local state
  const chat = chats.value.find(c => c.id === chatId);
  if (chat) chat.unreadCount = 0;
}
```

Call `markChatAsRead` when:
- User opens/joins a chat (after messages load)
- New messages arrive while the chat is already open

6. **ChatSidebar.vue** — display unread count badge on chat items (if not already present). Check if the sidebar already shows `unreadCount` — if so, it should now work with the DB-backed value.

**Tests**: ~5 tests
- CHAT_READ handler updates lastReadMessageId in DB
- CHAT_READ handler sets unreadCount to 0
- CHAT_READ broadcasts to user's other devices
- CHAT_READ rejects if user doesn't own the chat
- Assistant message increments unreadCount

**Commit:** `feat(ws): implement read receipts with DB persistence and cross-device sync`

---

### Task 4: Configurable group chat turn strategy

**Files:**
- Modify: `src/db/schema/chats.ts` (add groupStrategy to metadata or as column)
- Modify: `src/server/services/group-chat.service.ts`
- Modify: `src/server/routes/chats.ts` (endpoint to update strategy)
- Modify: `src/server/routes/websocket.ts` (use chat's strategy instead of hardcoded)
- Modify: `src/client/stores/chat.ts` (expose strategy)

**What to do:**

Group chat currently hardcodes `round_robin` strategy in the WebSocket handler. Make it configurable per chat.

1. **chats.ts schema** — the `metadata` jsonb column already exists. Store `groupStrategy` in metadata. No schema change needed.

2. **group-chat.service.ts** — add method to get/set strategy:
```ts
async getStrategy(chatId: string): Promise<'round_robin' | 'all' | 'random'> {
  const [chat] = await this.db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId));
  const meta = chat?.metadata as Record<string, unknown> | null;
  return (meta?.groupStrategy as string) || 'round_robin';
}

async setStrategy(chatId: string, strategy: 'round_robin' | 'all' | 'random'): Promise<void> {
  const [chat] = await this.db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId));
  const meta = (chat?.metadata as Record<string, unknown>) || {};
  await this.db.update(chats).set({
    metadata: { ...meta, groupStrategy: strategy },
  }).where(eq(chats.id, chatId));
}
```

3. **chats.ts route** — add `PATCH /:id/group-strategy`:
```ts
const groupStrategySchema = z.object({
  strategy: z.enum(['round_robin', 'all', 'random']),
});

chatRoutes.patch('/:id/group-strategy', authMiddleware(), zValidator('json', groupStrategySchema), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const { strategy } = c.req.valid('json');

  // Verify ownership
  const chat = await chatRepository.findById(chatId);
  if (!chat || chat.userId !== user.id) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Chat not found' } }, 404);
  }

  await groupChatService.setStrategy(chatId, strategy);
  return c.json({ success: true, data: { strategy }, meta: { timestamp: new Date().toISOString() } });
});
```

4. **websocket.ts** — in `handleGroupChatResponse`, replace hardcoded strategy:
```ts
// Before:
const respondents = await groupChatService.selectRespondents(chatId, 'round_robin', lastResponderId);
// After:
const strategy = await groupChatService.getStrategy(chatId);
const respondents = await groupChatService.selectRespondents(chatId, strategy, lastResponderId);
```

**Tests**: ~4 tests
- getStrategy returns 'round_robin' by default
- setStrategy updates metadata
- PATCH /group-strategy updates strategy
- PATCH /group-strategy rejects non-owner

**Commit:** `feat(chat): add configurable group chat turn strategy`

---

### Task 5: Per-user WebSocket connection limit

**Files:**
- Modify: `src/server/services/websocket.service.ts`
- Modify: `src/server/services/websocket.service.spec.ts`

**What to do:**

Currently there's no limit on how many WebSocket connections a single user can open. Add a per-user connection limit.

1. **websocket.service.ts** — add connection limit check:
```ts
private readonly MAX_CONNECTIONS_PER_USER = 5;

addClient(clientId: string, ws: WebSocket, info: WSClientInfo): boolean {
  // Check connection limit
  const userConnections = this.getClientsByUserId(info.userId);
  if (userConnections.length >= this.MAX_CONNECTIONS_PER_USER) {
    // Close the oldest connection
    const oldest = userConnections.sort((a, b) =>
      a.info.connectedAt.getTime() - b.info.connectedAt.getTime()
    )[0];
    if (oldest) {
      this.sendToClient(oldest.id, {
        type: 'error',
        timestamp: new Date().toISOString(),
        data: { code: 'CONNECTION_REPLACED', message: 'Connection replaced by new device' },
      });
      this.removeClient(oldest.id);
    }
  }

  this.clients.set(clientId, { ws, info });
  return true;
}
```

Add `getClientsByUserId` helper if it doesn't exist:
```ts
getClientsByUserId(userId: string): Array<{ id: string; info: WSClientInfo }> {
  const result: Array<{ id: string; info: WSClientInfo }> = [];
  for (const [id, client] of this.clients) {
    if (client.info.userId === userId) {
      result.push({ id, info: client.info });
    }
  }
  return result;
}
```

2. Check how `addClient` is currently called in `websocket.ts` and adjust the call site if the return type changes.

**Tests**: ~3 tests
- Allows connections up to the limit
- Evicts oldest connection when limit exceeded
- getClientsByUserId returns correct clients

**Commit:** `feat(ws): add per-user WebSocket connection limit with oldest eviction`

---

### Task 6: i18n + final verification

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Add i18n keys for new UI strings:
```json
{
  "chat": {
    "typing": "{name} is typing...",
    "typingMultiple": "{names} are typing...",
    "connectionReplaced": "Connection replaced by another device",
    "groupStrategy": "Turn Strategy",
    "groupStrategyRoundRobin": "Round Robin",
    "groupStrategyAll": "All Characters",
    "groupStrategyRandom": "Random"
  }
}
```

Add corresponding zh-CN translations.

2. Run full verification:
   - `npx vitest run` — expect 1812+ tests passing, 0 failures
   - `npx tsc --noEmit` — expect 0 errors

**Commit:** `chore: iteration 35 verification — realtime collaboration enhancement`

---

## Verification

After all tasks:
- `npx vitest run` — 1812+ tests passing, 0 failures
- `npx tsc --noEmit` — 0 errors
- WebSocket join_chat verifies chat ownership
- Typing indicators work end-to-end (client sends, server broadcasts, UI displays)
- Read receipts persist to DB and sync across devices
- Group chat strategy is configurable per chat
- Per-user WebSocket connection limit evicts oldest connection
