# Iteration 30: Collaboration & Sharing

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add character share links, chat snapshot sharing, collaborative character editing, and public character templates.

**Architecture:** 4 features built bottom-up: DB schema + migrations first, then server routes, then client UI. Character share links use a `shareToken` column on the existing `characters` table. Chat snapshots use a new `chat_snapshots` table storing frozen message JSON. Collaborative editing uses a `character_collaborators` junction table with role-based permissions. Character templates use a new `character_templates` table with full card data. All share/snapshot public endpoints are unauthenticated; collaboration requires `team_collaboration` feature gate.

**Tech Stack:** TypeScript strict, Hono.js, Drizzle ORM, PostgreSQL, Vue 3, Element Plus, Pinia

---

### Task 1: DB schema + migration for share tokens, snapshots, collaborators, character templates

**Files:**
- Create: `src/db/migrations/0022_collaboration_sharing.sql`
- Modify: `src/db/schema/characters.ts` (add `shareToken` column)
- Create: `src/db/schema/chat-snapshots.ts`
- Create: `src/db/schema/character-collaborators.ts`
- Create: `src/db/schema/character-templates.ts`

**What to do:**

1. **Migration `0022_collaboration_sharing.sql`:**
```sql
-- Character share tokens
ALTER TABLE characters ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_characters_share_token ON characters(share_token) WHERE share_token IS NOT NULL;

-- Character fork lineage
ALTER TABLE characters ADD COLUMN IF NOT EXISTS forked_from_id UUID REFERENCES characters(id) ON DELETE SET NULL;

-- Chat snapshots
CREATE TABLE IF NOT EXISTS chat_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_token VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(500),
  messages JSONB NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  character_name VARCHAR(255),
  character_avatar TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_snapshots_share_token ON chat_snapshots(share_token);
CREATE INDEX IF NOT EXISTS idx_chat_snapshots_user_id ON chat_snapshots(user_id);

-- Character collaborators
CREATE TABLE IF NOT EXISTS character_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(character_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_character_collaborators_character_id ON character_collaborators(character_id);
CREATE INDEX IF NOT EXISTS idx_character_collaborators_user_id ON character_collaborators(user_id);

-- Character templates (full card templates, not chat templates)
CREATE TABLE IF NOT EXISTS character_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  avatar_url TEXT,
  card_data JSONB NOT NULL,
  category VARCHAR(50),
  tags TEXT[],
  is_public BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_character_templates_is_public ON character_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_character_templates_category ON character_templates(category);
```

2. **`src/db/schema/characters.ts`** — Add two columns after `isNsfw`:
```ts
shareToken: varchar('share_token', { length: 64 }),
forkedFromId: uuid('forked_from_id').references(() => characters.id, { onDelete: 'set null' }),
```

3. **`src/db/schema/chat-snapshots.ts`** — New schema file:
```ts
import { pgTable, uuid, varchar, text, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';
import { chats } from './chats';
import { users } from './users';

export const chatSnapshots = pgTable('chat_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  shareToken: varchar('share_token', { length: 64 }).notNull().unique(),
  title: varchar('title', { length: 500 }),
  messages: jsonb('messages').notNull().default([]),
  messageCount: integer('message_count').notNull().default(0),
  characterName: varchar('character_name', { length: 255 }),
  characterAvatar: text('character_avatar'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ChatSnapshot = typeof chatSnapshots.$inferSelect;
export type NewChatSnapshot = typeof chatSnapshots.$inferInsert;
```

4. **`src/db/schema/character-collaborators.ts`** — New schema file:
```ts
import { pgTable, uuid, varchar, timestamp, unique } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';

export const characterCollaborators = pgTable('character_collaborators', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default('editor'),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueCollaborator: unique().on(table.characterId, table.userId),
}));

export type CharacterCollaborator = typeof characterCollaborators.$inferSelect;
export type NewCharacterCollaborator = typeof characterCollaborators.$inferInsert;
```

5. **`src/db/schema/character-templates.ts`** — New schema file:
```ts
import { pgTable, uuid, varchar, text, jsonb, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const characterTemplates = pgTable('character_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  avatarUrl: text('avatar_url'),
  cardData: jsonb('card_data').notNull(),
  category: varchar('category', { length: 50 }),
  tags: text('tags').array(),
  isPublic: boolean('is_public').default(true).notNull(),
  usageCount: integer('usage_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CharacterTemplate = typeof characterTemplates.$inferSelect;
export type NewCharacterTemplate = typeof characterTemplates.$inferInsert;
```

Run: `npx tsc --noEmit 2>&1 | grep -E 'chat-snapshots|character-collaborators|character-templates|characters\.ts'` — should be clean.

**Commit:** `feat(db): add schema for share tokens, chat snapshots, collaborators, character templates`

---

### Task 2: Server routes — character share links + chat snapshots

**Files:**
- Modify: `src/server/routes/characters.ts` (add share/unshare + shared access endpoints)
- Modify: `src/server/routes/chats.ts` (add snapshot create/list/delete endpoints)
- Create: `src/server/routes/share.ts` (public endpoints for shared content)
- Modify: `src/server/index.ts` (register share routes)

**What to do:**

1. **characters.ts** — Add 3 endpoints after the existing fork endpoint:

- `POST /:id/share` — Generate a share token (crypto.randomBytes(32).toString('hex')), save to `characters.shareToken`, return the token. Requires ownership. Gated by `requireFeature('character_share')`.
- `DELETE /:id/share` — Set `shareToken` to null. Requires ownership.
- `GET /shared/:token` — Public (no auth required). Look up character by shareToken, return character data. Increment viewCount.

2. **chats.ts** — Add 3 endpoints:

- `POST /:id/snapshot` — Create a chat snapshot. Fetch all messages for the chat, freeze them as JSON in `chat_snapshots.messages`. Generate shareToken (crypto.randomBytes(32).toString('hex')). Optional `title` and `expiresAt` in body. Return snapshot with shareToken.
- `GET /:id/snapshots` — List snapshots for a chat (owner only).
- `DELETE /snapshots/:snapshotId` — Delete a snapshot (owner only).

3. **share.ts** — New public route file with 2 endpoints (no auth middleware):

- `GET /character/:token` — Look up character by shareToken, return public character data.
- `GET /snapshot/:token` — Look up chat snapshot by shareToken, check expiry, return snapshot data (title, messages, characterName, characterAvatar, messageCount).

4. **index.ts** — Register share routes:
```ts
import { shareRoutes } from './routes/share';
// No CSRF, no tenant middleware for public share routes
app.route('/api/v1/share', shareRoutes);
```
Add `/api/v1/share` to publicPaths array.

Run: `npx tsc --noEmit 2>&1 | grep -E 'characters\.ts|chats\.ts|share\.ts|index\.ts'` — should be clean.

**Commit:** `feat(server): add character share links and chat snapshot sharing endpoints`

---

### Task 3: Server routes — character collaborators + character templates

**Files:**
- Create: `src/server/routes/character-collaborators.ts`
- Create: `src/server/routes/character-templates.ts`
- Modify: `src/server/routes/characters.ts` (add permission check for collaborators on PATCH)
- Modify: `src/server/index.ts` (register new routes)

**What to do:**

1. **character-collaborators.ts** — New route file with 4 endpoints, all gated by `requireFeature('team_collaboration')`:

- `POST /characters/:id/collaborators` — Invite a collaborator. Body: `{ userId: string, role: 'editor' | 'viewer' }`. Only character owner can invite. Insert into `character_collaborators`.
- `GET /characters/:id/collaborators` — List collaborators for a character. Owner or collaborator can view.
- `PATCH /characters/:id/collaborators/:userId` — Update collaborator role. Owner only.
- `DELETE /characters/:id/collaborators/:userId` — Remove collaborator. Owner or self-remove.

2. **character-templates.ts** — New route file with CRUD + browse:

- `GET /` — List public templates with pagination, optional category/tag filters.
- `GET /:id` — Get template by ID.
- `POST /` — Create template (auth required). Body: `{ name, description, cardData, category, tags, isPublic }`.
- `PATCH /:id` — Update template (creator only).
- `DELETE /:id` — Delete template (creator only).
- `POST /:id/use` — Increment usageCount, return template data for pre-filling character editor.

3. **characters.ts** — Modify the PATCH `/:id` handler to also allow collaborators with 'editor' role to edit. Check `character_collaborators` table if the user is not the owner.

4. **index.ts** — Register routes:
```ts
import { characterCollaboratorRoutes } from './routes/character-collaborators';
import { characterTemplateRoutes } from './routes/character-templates';
app.use('/api/v1/character-collaborators', tenantMiddleware({ publicPaths }));
app.use('/api/v1/character-collaborators', csrfProtection());
app.use('/api/v1/character-templates', tenantMiddleware({ publicPaths }));
app.use('/api/v1/character-templates', csrfProtection());
app.route('/api/v1/character-collaborators', characterCollaboratorRoutes);
app.route('/api/v1/character-templates', characterTemplateRoutes);
```

Run: `npx tsc --noEmit 2>&1 | grep -E 'character-collaborators|character-templates|characters\.ts|index\.ts'` — should be clean.

**Commit:** `feat(server): add character collaborator and template routes`

---

### Task 4: Client types + API services

**Files:**
- Modify: `src/client/types/index.ts` (add share/snapshot/collaborator/template types)
- Create: `src/client/services/share.api.ts`
- Create: `src/client/services/collaborator.api.ts`
- Create: `src/client/services/character-template.api.ts`

**What to do:**

1. **types/index.ts** — Add interfaces:
```ts
export interface ChatSnapshot {
  id: string;
  chatId: string;
  shareToken: string;
  title?: string;
  messages: Message[];
  messageCount: number;
  characterName?: string;
  characterAvatar?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface CharacterCollaborator {
  id: string;
  characterId: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  role: 'editor' | 'viewer';
  createdAt: string;
}

export interface CharacterTemplate {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  cardData: CharacterCardData;
  category?: string;
  tags?: string[];
  isPublic: boolean;
  usageCount: number;
  creatorId?: string;
  createdAt: string;
}
```

Also add `shareToken?: string` and `forkedFromId?: string` to the `Character` interface.

2. **share.api.ts** — API service:
```ts
// generateShareLink(characterId) → POST /characters/:id/share
// revokeShareLink(characterId) → DELETE /characters/:id/share
// getSharedCharacter(token) → GET /share/character/:token
// createSnapshot(chatId, { title?, expiresAt? }) → POST /chats/:id/snapshot
// listSnapshots(chatId) → GET /chats/:id/snapshots
// deleteSnapshot(snapshotId) → DELETE /chats/snapshots/:snapshotId
// getSnapshot(token) → GET /share/snapshot/:token
```

3. **collaborator.api.ts** — API service:
```ts
// inviteCollaborator(characterId, { userId, role }) → POST /character-collaborators/characters/:id/collaborators
// listCollaborators(characterId) → GET /character-collaborators/characters/:id/collaborators
// updateCollaboratorRole(characterId, userId, role) → PATCH /character-collaborators/characters/:id/collaborators/:userId
// removeCollaborator(characterId, userId) → DELETE /character-collaborators/characters/:id/collaborators/:userId
```

4. **character-template.api.ts** — API service:
```ts
// listTemplates({ page, limit, category }) → GET /character-templates
// getTemplate(id) → GET /character-templates/:id
// createTemplate(data) → POST /character-templates
// updateTemplate(id, data) → PATCH /character-templates/:id
// deleteTemplate(id) → DELETE /character-templates/:id
// useTemplate(id) → POST /character-templates/:id/use
```

Run: `npx tsc --noEmit 2>&1 | grep -E 'share\.api|collaborator\.api|character-template\.api|types/index'` — should be clean.

**Commit:** `feat(client): add types and API services for sharing, collaboration, templates`

---

### Task 5: Client UI — share dialogs + snapshot viewer

**Files:**
- Create: `src/client/components/character/ShareDialog.vue`
- Create: `src/client/pages/SharedCharacter.vue`
- Create: `src/client/pages/SnapshotViewer.vue`
- Modify: `src/client/components/chat/ChatWindow.vue` (add snapshot button)
- Modify: `src/client/pages/CharacterDetail.vue` (add share button)
- Modify: `src/client/router/routes.ts` (add public routes)

**What to do:**

1. **ShareDialog.vue** — El-dialog component:
   - Shows current share link if shareToken exists (with copy button)
   - "Generate Link" button calls `shareApi.generateShareLink()`
   - "Revoke Link" button calls `shareApi.revokeShareLink()`
   - Uses `navigator.clipboard.writeText()` for copy

2. **SharedCharacter.vue** — Public page for `/share/character/:token`:
   - Fetches character via `shareApi.getSharedCharacter(token)`
   - Displays character card (name, avatar, description, tags)
   - "Fork to My Characters" button (requires login, calls existing fork endpoint)

3. **SnapshotViewer.vue** — Public page for `/share/snapshot/:token`:
   - Fetches snapshot via `shareApi.getSnapshot(token)`
   - Read-only message list (reuse MessageBubble styling)
   - Shows character name/avatar, message count, creation date
   - If expired, show "This snapshot has expired" message

4. **ChatWindow.vue** — Add "Create Snapshot" button in the export dropdown (next to existing JSON/TXT export):
   - Opens a small dialog for title + optional expiry
   - Calls `shareApi.createSnapshot()`
   - Shows the share link with copy button

5. **CharacterDetail.vue** — Add "Share" button (visible to character owner):
   - Opens ShareDialog component

6. **routes.ts** — Add public routes:
```ts
const loadSharedCharacter = () => import('../pages/SharedCharacter.vue');
const loadSnapshotViewer = () => import('../pages/SnapshotViewer.vue');
// Add routes:
{ path: '/share/character/:token', name: 'SharedCharacter', component: loadSharedCharacter, meta: { requiresAuth: false } }
{ path: '/share/snapshot/:token', name: 'SnapshotViewer', component: loadSnapshotViewer, meta: { requiresAuth: false } }
```

Run: `npx tsc --noEmit` — should be clean.

**Commit:** `feat(client): add share dialogs, shared character page, snapshot viewer`

---

### Task 6: Client UI — collaborator panel + template gallery

**Files:**
- Create: `src/client/components/character/CollaboratorPanel.vue`
- Create: `src/client/pages/CharacterTemplates.vue`
- Modify: `src/client/pages/CharacterEditor.vue` (add collaborator panel + template selection)
- Modify: `src/client/router/routes.ts` (add template gallery route)
- Modify: `src/client/components/layout/BottomTabBar.vue` (no changes needed if nav already covers it)

**What to do:**

1. **CollaboratorPanel.vue** — El-card component for managing collaborators:
   - List current collaborators with role badges
   - "Invite" button opens user search (email or display name)
   - Role dropdown (editor/viewer) per collaborator
   - Remove button per collaborator
   - Only visible to character owner, gated by `team_collaboration` feature

2. **CharacterTemplates.vue** — Template gallery page:
   - Grid of template cards with avatar, name, description, category, usage count
   - Category filter tabs
   - "Use Template" button navigates to CharacterEditor with template data pre-filled via query param or route state
   - Pagination

3. **CharacterEditor.vue** — Two additions:
   - If route has `templateId` query param, fetch template and pre-fill form fields
   - Add CollaboratorPanel below the editor form (only for existing characters, only for owner)

4. **routes.ts** — Add:
```ts
const loadCharacterTemplates = () => import('../pages/CharacterTemplates.vue');
{ path: '/character-templates', name: 'CharacterTemplates', component: loadCharacterTemplates, meta: { requiresAuth: false } }
```

Run: `npx tsc --noEmit` — should be clean.

**Commit:** `feat(client): add collaborator panel and character template gallery`

---

### Task 7: i18n + final verification

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`
- Modify: `ROADMAP.md`

**What to do:**

1. Add i18n keys to both locale files under a new `share` section and extend existing sections:
```json
"share": {
  "shareLink": "Share Link",
  "generateLink": "Generate Link",
  "revokeLink": "Revoke Link",
  "copyLink": "Copy Link",
  "linkCopied": "Link copied to clipboard",
  "shareCharacter": "Share Character",
  "sharedCharacter": "Shared Character",
  "forkToMine": "Fork to My Characters",
  "snapshotExpired": "This snapshot has expired",
  "createSnapshot": "Create Snapshot",
  "snapshotTitle": "Snapshot Title",
  "snapshotExpiry": "Expires After",
  "snapshotCreated": "Snapshot created",
  "viewSnapshot": "View Snapshot",
  "deleteSnapshot": "Delete Snapshot",
  "noSnapshots": "No snapshots yet"
},
"collaboration": {
  "collaborators": "Collaborators",
  "inviteCollaborator": "Invite Collaborator",
  "removeCollaborator": "Remove",
  "roleEditor": "Editor",
  "roleViewer": "Viewer",
  "changeRole": "Change Role",
  "collaboratorAdded": "Collaborator added",
  "collaboratorRemoved": "Collaborator removed",
  "searchUsers": "Search users by email or name"
},
"characterTemplates": {
  "title": "Character Templates",
  "useTemplate": "Use Template",
  "createFromTemplate": "Create from Template",
  "allCategories": "All Categories",
  "usageCount": "Used {count} times",
  "noTemplates": "No templates available"
}
```

And corresponding zh-CN translations.

2. Verify:
   - `npx tsc --noEmit` — 0 errors
   - `npx vitest run` — all tests passing
   - `npm run build` — clean build

3. Update `ROADMAP.md` with Iteration 30 entry.

**Commit:** `feat(i18n): add sharing, collaboration, template i18n keys; update roadmap`

---

## Verification

After all tasks:
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — all tests passing (no regressions)
- `npm run build` — production build succeeds
