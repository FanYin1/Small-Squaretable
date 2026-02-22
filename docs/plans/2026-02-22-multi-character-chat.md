# Iteration 21: Multi-Character Chat

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Enable group chats with multiple AI characters that take turns responding, each with their own personality, memory, and emotion state.

**Architecture:** A new `chat_characters` join table links multiple characters to a single chat. Messages gain a `characterId` column to identify which character sent each assistant message. A `GroupChatOrchestrator` service manages turn-taking: after a user message, it selects which character(s) should respond based on configurable strategies (round-robin, relevance-based, or all). Each character gets its own system prompt built with its own memory/emotion context. WebSocket events are extended with `characterId` so the frontend can render per-character avatars and names. The frontend chat store and components are updated to handle multiple characters per chat.

**Tech Stack:** PostgreSQL + Drizzle ORM, Hono.js, Vue 3 + Pinia + Element Plus, WebSocket, Vitest

---

### Task 1: Add chat_characters join table and extend messages schema

**Files:**
- Create: `src/db/schema/chat-characters.ts`
- Modify: `src/db/schema/chats.ts` — add characterId to messages
- Modify: `src/db/schema/index.ts` — add export

**What to do:**

1. Create `src/db/schema/chat-characters.ts`:

```ts
import { pgTable, uuid, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { chats } from './chats';
import { characters } from './characters';

export const chatCharacters = pgTable('chat_characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueIdx: uniqueIndex('idx_chat_characters_unique').on(table.chatId, table.characterId),
  chatIdx: index('idx_chat_characters_chat').on(table.chatId),
}));

export type ChatCharacter = typeof chatCharacters.$inferSelect;
export type NewChatCharacter = typeof chatCharacters.$inferInsert;
```

2. In `src/db/schema/chats.ts`, add a `characterId` column to the `messages` table (nullable — null for user/system messages, set for assistant messages):

```ts
characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
```

Import `characters` from `./characters`. This column identifies which character sent each assistant message.

3. In `src/db/schema/index.ts`, add: `export * from './chat-characters';`

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'chat-characters|chats\.ts' | head -10`

**Commit:** `feat(db): add chat_characters join table and message characterId`

---

### Task 2: Create chat-characters repository

**Files:**
- Create: `src/db/repositories/chat-character.repository.ts`

**What to do:**

Create a repository for the `chat_characters` join table:

```ts
import { eq, and } from 'drizzle-orm';
import { db } from '../index';
import { chatCharacters } from '../schema/chat-characters';
import { characters } from '../schema/characters';
import type { ChatCharacter, NewChatCharacter } from '../schema/chat-characters';

class ChatCharacterRepository {
  async addCharacter(chatId: string, characterId: string, sortOrder = 0): Promise<ChatCharacter> {
    const [result] = await db.insert(chatCharacters)
      .values({ chatId, characterId, sortOrder })
      .onConflictDoNothing()
      .returning();
    return result;
  }

  async removeCharacter(chatId: string, characterId: string): Promise<void> {
    await db.delete(chatCharacters).where(
      and(eq(chatCharacters.chatId, chatId), eq(chatCharacters.characterId, characterId))
    );
  }

  async getCharacters(chatId: string) {
    return await db
      .select({
        id: characters.id,
        name: characters.name,
        avatarUrl: characters.avatarUrl,
        cardData: characters.cardData,
        sortOrder: chatCharacters.sortOrder,
      })
      .from(chatCharacters)
      .innerJoin(characters, eq(chatCharacters.characterId, characters.id))
      .where(eq(chatCharacters.chatId, chatId))
      .orderBy(chatCharacters.sortOrder);
  }

  async getCharacterIds(chatId: string): Promise<string[]> {
    const rows = await db
      .select({ characterId: chatCharacters.characterId })
      .from(chatCharacters)
      .where(eq(chatCharacters.chatId, chatId));
    return rows.map(r => r.characterId);
  }
}

export const chatCharacterRepository = new ChatCharacterRepository();
```

Read `src/db/repositories/activity.repository.ts` for the repository pattern.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'chat-character' | head -10`

**Commit:** `feat(db): add chat-character repository`

---

### Task 3: Create group chat orchestrator service

**Files:**
- Create: `src/server/services/group-chat.service.ts`
- Create: `src/server/services/group-chat.service.spec.ts`

**What to do:**

1. Create `src/server/services/group-chat.service.ts` — the orchestrator that decides which characters respond:

```ts
import { chatCharacterRepository } from '../../db/repositories/chat-character.repository';
import { characterRepository } from '../../db/repositories/character.repository';
import { logger } from './logger.service';

const groupLogger = logger.child({ module: 'group-chat' });

export type TurnStrategy = 'round_robin' | 'all' | 'random';

export class GroupChatService {
  /**
   * Determine which characters should respond to the next user message.
   * Returns character IDs in response order.
   */
  async selectRespondents(
    chatId: string,
    strategy: TurnStrategy = 'round_robin',
    lastResponderId?: string
  ): Promise<string[]> {
    const characterIds = await chatCharacterRepository.getCharacterIds(chatId);
    if (characterIds.length === 0) return [];
    if (characterIds.length === 1) return characterIds;

    switch (strategy) {
      case 'all':
        return characterIds;
      case 'random': {
        const idx = Math.floor(Math.random() * characterIds.length);
        return [characterIds[idx]];
      }
      case 'round_robin':
      default: {
        if (!lastResponderId) return [characterIds[0]];
        const lastIdx = characterIds.indexOf(lastResponderId);
        const nextIdx = (lastIdx + 1) % characterIds.length;
        return [characterIds[nextIdx]];
      }
    }
  }

  /**
   * Check if a chat is a group chat (has multiple characters).
   */
  async isGroupChat(chatId: string): Promise<boolean> {
    const ids = await chatCharacterRepository.getCharacterIds(chatId);
    return ids.length > 1;
  }

  /**
   * Get all characters for a chat with their details.
   */
  async getChatCharacters(chatId: string) {
    return chatCharacterRepository.getCharacters(chatId);
  }

  /**
   * Add a character to a chat.
   */
  async addCharacter(chatId: string, characterId: string, sortOrder = 0) {
    return chatCharacterRepository.addCharacter(chatId, characterId, sortOrder);
  }

  /**
   * Remove a character from a chat.
   */
  async removeCharacter(chatId: string, characterId: string) {
    return chatCharacterRepository.removeCharacter(chatId, characterId);
  }
}

export const groupChatService = new GroupChatService();
```

2. Create `src/server/services/group-chat.service.spec.ts` with tests:
- "selectRespondents round_robin returns next character after last responder"
- "selectRespondents round_robin wraps around to first character"
- "selectRespondents round_robin returns first when no lastResponderId"
- "selectRespondents all returns all characters"
- "selectRespondents returns single character for single-character chat"
- "isGroupChat returns true for multiple characters"
- "isGroupChat returns false for single character"

Mock `chatCharacterRepository`.

**Verification:**
Run: `npx vitest run src/server/services/group-chat.service.spec.ts`

**Commit:** `feat(server): add group chat orchestrator service`

---

### Task 4: Extend chat creation API for multi-character

**Files:**
- Modify: `src/types/chat.ts` — update createChatSchema
- Modify: `src/server/routes/chats.ts` — handle characterIds array
- Modify: `src/server/services/chat.service.ts` — update create method

**What to do:**

1. In `src/types/chat.ts`, update `createChatSchema` to accept either a single `characterId` or an array `characterIds`:

```ts
export const createChatSchema = z.object({
  characterId: z.string().uuid().optional(),
  characterIds: z.array(z.string().uuid()).min(1).max(10).optional(),
  title: z.string().max(500).optional(),
}).refine(
  (data) => data.characterId || data.characterIds,
  { message: 'Either characterId or characterIds is required' }
);
```

2. In `src/server/routes/chats.ts`, find the POST `/` handler. After creating the chat, if `characterIds` is provided, insert into `chat_characters` for each. If only `characterId` is provided, insert a single row into `chat_characters` (backwards compatible). Also set `chat.characterId` to the first character for backwards compatibility.

3. In `src/server/services/chat.service.ts`, update the `create` method if needed to support the new schema.

Read `src/server/routes/chats.ts` and `src/types/chat.ts` first.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'chats\.(ts|service)' | head -10`

**Commit:** `feat(server): extend chat creation for multi-character support`

---

### Task 5: Extend WebSocket handler for multi-character responses

**Files:**
- Modify: `src/server/routes/websocket.ts` — multi-character response loop
- Modify: `src/types/websocket.ts` — add characterId to message events

**What to do:**

1. In `src/types/websocket.ts`, add `characterId` and `characterName` to `ASSISTANT_MESSAGE_CHUNK` and `ASSISTANT_MESSAGE_DONE` data types:

```ts
// In AssistantMessageChunk:
data: {
  chatId: string;
  messageId: string;
  chunk: string;
  index: number;
  characterId?: string;
  characterName?: string;
};

// In AssistantMessageDone:
data: {
  chatId: string;
  messageId: string;
  totalTokens?: number;
  characterId?: string;
  characterName?: string;
};
```

2. In `src/server/routes/websocket.ts`, find the `handleUserMessage` function. Modify it to:

a. Check if the chat has multiple characters (via `groupChatService.isGroupChat(chatId)`).
b. If single character: keep existing behavior (backwards compatible).
c. If group chat:
   - Call `groupChatService.selectRespondents(chatId, 'round_robin', lastResponderId)` to get which character(s) should respond.
   - For each responding character, sequentially:
     - Build the system prompt for that character (using `chatService.buildEnhancedSystemPrompt()`)
     - Call the LLM with that character's prompt
     - Stream the response with `characterId` and `characterName` in the chunk/done events
     - Save the message with the character's ID in the `characterId` column
   - Track the last responder ID for round-robin.

Read `src/server/routes/websocket.ts` carefully to understand the existing flow before modifying.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'websocket|websocket\.ts' | head -10`

**Commit:** `feat(server): extend WebSocket for multi-character responses`

---

### Task 6: Add group chat management API endpoints

**Files:**
- Modify: `src/server/routes/chats.ts` — add character management endpoints

**What to do:**

Add endpoints to manage characters in a chat:

```ts
// GET /:id/characters — list characters in a chat
// POST /:id/characters — add a character to a chat
// DELETE /:id/characters/:characterId — remove a character from a chat
```

All require `authMiddleware()`. The POST endpoint should accept `{ characterId: string }` in the body.

Read `src/server/routes/chats.ts` for the existing route patterns.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'chats\.ts' | head -10`

**Commit:** `feat(server): add group chat character management endpoints`

---

### Task 7: Update frontend chat store for multi-character

**Files:**
- Modify: `src/client/stores/chat.ts`
- Modify: `src/client/services/chat.api.ts` (if it exists, or wherever chat API calls are made)

**What to do:**

1. In the chat store, change `currentCharacter` from a single ref to an array:
```ts
const chatCharacters = ref<Character[]>([]);
```

Keep `currentCharacter` as a computed that returns the first character (backwards compatible).

2. Update `setCurrentChat()` to fetch all characters for the chat. Add a new API call to `GET /chats/:id/characters` and populate `chatCharacters`.

3. Update the WebSocket message handlers for `ASSISTANT_MESSAGE_CHUNK` and `ASSISTANT_MESSAGE_DONE` to handle the new `characterId` and `characterName` fields. Store them on the streaming message so the UI can show which character is speaking.

4. Add `streamingCharacterId` and `streamingCharacterName` refs for the currently streaming character.

5. Add API methods for group chat management:
```ts
getChatCharacters: (chatId: string) => api.get(`/chats/${chatId}/characters`),
addChatCharacter: (chatId: string, characterId: string) => api.post(`/chats/${chatId}/characters`, { characterId }),
removeChatCharacter: (chatId: string, characterId: string) => api.delete(`/chats/${chatId}/characters/${characterId}`),
```

Read `src/client/stores/chat.ts` first to understand the current structure.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'chat\.ts' | head -10`

**Commit:** `feat(client): update chat store for multi-character support`

---

### Task 8: Update frontend chat components

**Files:**
- Modify: `src/client/components/chat/MessageBubble.vue` — show per-message character info
- Modify: `src/client/components/chat/ChatWindow.vue` — show multiple characters in header
- Modify: `src/client/components/chat/WelcomePage.vue` — allow multi-character selection

**What to do:**

1. In `MessageBubble.vue`:
- Accept `characterId`, `characterName`, `characterAvatar` as optional props (for assistant messages)
- For assistant messages in group chats, show the character's avatar and name above the message content
- Read the component first to see how it currently handles character info

2. In `ChatWindow.vue`:
- Update the header to show multiple character avatars (stacked/overlapping) when it's a group chat
- Show character count (e.g., "3 characters")
- Add a button to manage characters (add/remove) — opens a dialog

3. In `WelcomePage.vue`:
- Allow selecting multiple characters when creating a new chat
- Add a toggle or mode switch: "Single Character" vs "Group Chat"
- When group chat mode is selected, allow picking 2-10 characters
- Pass `characterIds` array to the create chat action

Read all three components first to understand their current structure.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'MessageBubble|ChatWindow|WelcomePage' | head -10`

**Commit:** `feat(client): update chat components for multi-character display`

---

### Task 9: Add i18n keys for multi-character chat

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

Add `groupChat` section to both locale files:

en-US.json:
```json
{
  "groupChat": {
    "title": "Group Chat",
    "singleMode": "Single Character",
    "groupMode": "Group Chat",
    "selectCharacters": "Select Characters",
    "characters": "{count} characters",
    "addCharacter": "Add Character",
    "removeCharacter": "Remove Character",
    "removeConfirm": "Remove this character from the chat?",
    "maxCharacters": "Maximum 10 characters per chat",
    "manageCharacters": "Manage Characters",
    "turnStrategy": "Response Mode",
    "roundRobin": "Take Turns",
    "allRespond": "All Respond",
    "randomRespond": "Random"
  }
}
```

zh-CN.json:
```json
{
  "groupChat": {
    "title": "群聊",
    "singleMode": "单角色",
    "groupMode": "群聊",
    "selectCharacters": "选择角色",
    "characters": "{count} 个角色",
    "addCharacter": "添加角色",
    "removeCharacter": "移除角色",
    "removeConfirm": "从聊天中移除此角色？",
    "maxCharacters": "每个聊天最多 10 个角色",
    "manageCharacters": "管理角色",
    "turnStrategy": "回复模式",
    "roundRobin": "轮流回复",
    "allRespond": "全部回复",
    "randomRespond": "随机回复"
  }
}
```

**Verification:**
Run: `npx vitest run 2>&1 | tail -5`

**Commit:** `feat(i18n): add multi-character chat translations (en-US + zh-CN)`

---

### Task 10: Final verification and docs update

**What to do:**

1. Run `npx tsc --noEmit` — expect 0 errors
2. Run `npx vitest run` — expect all tests passing
3. Run `npm run build` — expect clean production build
4. Update `ROADMAP.md` — add Iteration 21 entry:
```markdown
### 迭代 21: 多角色聊天 ✅ (2026-02-22)
- ✅ **群聊架构** — chat_characters 关联表, messages.characterId 字段
- ✅ **轮流编排** — GroupChatOrchestrator (round_robin/all/random 策略)
- ✅ **多角色创建** — 创建聊天时支持 characterIds 数组 (最多 10 个)
- ✅ **WebSocket 扩展** — 流式响应携带 characterId/characterName
- ✅ **角色管理 API** — GET/POST/DELETE /chats/:id/characters
- ✅ **前端适配** — 多角色头像、消息气泡角色标识、群聊模式选择
- ✅ **i18n** — groupChat.* 键 (en-US + zh-CN)
```

**Commit:** `docs: update ROADMAP.md for Iteration 21 (multi-character chat)`

---

## Verification

After all tasks:
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — all tests passing
- `npm run build` — production build succeeds
- Single-character chats still work (backwards compatible)
- Group chats can be created with multiple characters
- Characters take turns responding in group chats
- Each message shows which character sent it
- Characters can be added/removed from existing chats
