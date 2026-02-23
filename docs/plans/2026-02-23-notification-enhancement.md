# Iteration 31: Notification & Message Center Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix broken real-time notification push, expand notification types, add email preferences, notification grouping, @mention support, and collaborator change notifications.

**Architecture:** Fix WebSocket push pipeline first (sendToUser + broadcastFn wiring), then expand notification types and creation points, add preferences table, add grouping logic, add @mention parsing. 7 tasks in dependency order.

**Tech Stack:** TypeScript strict, Hono.js, Drizzle ORM, PostgreSQL, Vue 3, Element Plus, WebSocket

---

### Task 1: Fix WebSocket notification push pipeline

**Files:**
- Modify: `src/server/services/websocket.service.ts` (add `sendToUser` method)
- Modify: `src/server/services/notification.service.ts` (fix broadcastFn wiring)
- Modify: `src/server/routes/websocket.ts` (wire broadcastFn after initialization)
- Modify: `src/server/services/social.service.ts` (use notificationService.notify instead of direct repo call)
- Modify: `src/client/stores/chat.ts` or wherever WebSocket events are handled (wire notification handlers)

**What to do:**

1. **websocket.service.ts** — Add a `sendToUser(userId: string, message: object)` method. The service tracks connections — find all WebSocket connections for a given userId and send the message to each. Look at how `broadcastToChat` works and follow the same pattern but filtering by userId instead of chatId.

2. **notification.service.ts** — The `broadcastFn` is never set. Change the constructor or add a `setBroadcastFn` method. The broadcastFn should call `websocketHandler.sendToUser(userId, { type: 'SOCIAL_NOTIFICATION', data: notification })`.

3. **websocket.ts** — After `websocketHandler.initialize(serverInstance)`, wire the broadcastFn:
```ts
notificationService.setBroadcastFn((userId: string, notification: any) => {
  websocketHandler.sendToUser(userId, { type: 'SOCIAL_NOTIFICATION', data: notification });
  // Also send updated unread count
  const count = await notificationService.getUnreadCount(userId);
  websocketHandler.sendToUser(userId, { type: 'SOCIAL_UNREAD_COUNT', data: { count } });
});
```

4. **social.service.ts** — Change `followUser` to call `notificationService.notify()` instead of `notificationRepo.createNotification()` directly. This ensures the WebSocket push path is used.

5. **Frontend WebSocket wiring** — Find where WebSocket messages are handled (likely in chat store or a composable). Add handlers for `SOCIAL_NOTIFICATION` and `SOCIAL_UNREAD_COUNT` that call the notification store's `handleWsNotification` and `handleWsUnreadCount` methods.

Run: `npx tsc --noEmit 2>&1 | head -20` — should be clean.

**Commit:** `fix(notifications): wire WebSocket push pipeline, add sendToUser, fix broadcastFn`

---

### Task 2: DB schema — notification preferences + expanded types

**Files:**
- Create: `src/db/migrations/0023_notification_preferences.sql`
- Create: `src/db/schema/notification-preferences.ts`
- Modify: `src/types/social.ts` (expand NotificationType)

**What to do:**

1. **Migration `0023_notification_preferences.sql`:**
```sql
-- Notification preferences per user per type
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  in_app BOOLEAN NOT NULL DEFAULT true,
  email BOOLEAN NOT NULL DEFAULT false,
  email_frequency VARCHAR(20) NOT NULL DEFAULT 'immediate' CHECK (email_frequency IN ('immediate', 'daily', 'weekly', 'never')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, notification_type)
);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Add grouping support to notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS group_key VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
CREATE INDEX IF NOT EXISTS idx_notifications_group_key ON notifications(group_key) WHERE group_key IS NOT NULL;
```

2. **notification-preferences.ts** — New Drizzle schema:
```ts
export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  notificationType: varchar('notification_type', { length: 50 }).notNull(),
  inApp: boolean('in_app').notNull().default(true),
  email: boolean('email').notNull().default(false),
  emailFrequency: varchar('email_frequency', { length: 20 }).notNull().default('immediate'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePref: unique().on(table.userId, table.notificationType),
}));
```

3. **social.ts** — Expand NotificationType:
```ts
export type NotificationType =
  | 'follow'
  | 'favorite'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'collaborator_invite'
  | 'collaborator_role_change'
  | 'collaborator_removed'
  | 'character_forked'
  | 'system';
```

4. Also add `groupKey` and `priority` to the notifications schema in `src/db/schema/social.ts`.

Run: `npx tsc --noEmit` — should be clean.

**Commit:** `feat(db): add notification preferences table, expand notification types, add grouping columns`

---

### Task 3: Notification preferences API + service

**Files:**
- Modify: `src/server/services/notification.service.ts` (add preference checking, grouping logic)
- Create: `src/server/routes/notification-preferences.ts`
- Modify: `src/server/index.ts` (register preferences route)

**What to do:**

1. **notification.service.ts** — Enhance `notify()`:
   - Before creating notification, check user's preferences for this type
   - If `inApp` is false, skip creating the in-app notification
   - If `email` is true and `emailFrequency` is 'immediate', queue an email (call emailService)
   - Add `groupKey` parameter to `notify()` — if provided, check if a recent unread notification with the same groupKey exists; if so, update its message instead of creating a new one (e.g., "Alice and 2 others favorited your character")
   - Add `getPreferences(userId)` and `updatePreference(userId, type, settings)` methods

2. **notification-preferences.ts** — New route with 3 endpoints:
   - `GET /` — Get all preferences for the authenticated user. Return defaults for types that don't have explicit preferences.
   - `PUT /:type` — Update preference for a specific notification type. Body: `{ inApp?: boolean, email?: boolean, emailFrequency?: string }`
   - `PUT /` — Bulk update preferences. Body: array of `{ type, inApp, email, emailFrequency }`

3. **index.ts** — Register the route with tenant middleware + CSRF.

Run: `npx tsc --noEmit` — should be clean.

**Commit:** `feat(server): add notification preferences API and preference-aware notify`

---

### Task 4: Wire up missing notification creation points

**Files:**
- Modify: `src/server/services/social.service.ts` (add favorite, comment, reply notifications)
- Modify: `src/server/routes/character-collaborators.ts` (add collaborator notifications)
- Modify: `src/server/routes/characters.ts` (add fork notification)

**What to do:**

1. **social.service.ts** — Add notification creation for:
   - `favoriteCharacter()` → notify character creator with type `'favorite'`, groupKey `'favorite:${characterId}'`
   - `createComment()` → notify character creator with type `'comment'`, groupKey `'comment:${characterId}'`
   - `createComment()` with parentId → notify parent comment author with type `'reply'`

2. **character-collaborators.ts** — Add notifications:
   - POST (invite) → notify invited user with type `'collaborator_invite'`
   - PATCH (role change) → notify affected user with type `'collaborator_role_change'`
   - DELETE (remove) → notify removed user with type `'collaborator_removed'`

3. **characters.ts** — In the fork endpoint:
   - Notify the original character creator with type `'character_forked'`, groupKey `'forked:${characterId}'`

Import `notificationService` in each file and call `notificationService.notify()`.

Run: `npx tsc --noEmit` — should be clean.

**Commit:** `feat(server): wire notification creation for favorites, comments, collaborators, forks`

---

### Task 5: @Mention parsing and notifications

**Files:**
- Create: `src/server/utils/mention-parser.ts`
- Modify: `src/server/routes/social.ts` (parse mentions in comments)
- Modify: `src/server/routes/chats.ts` (parse mentions in chat messages — optional, lower priority)

**What to do:**

1. **mention-parser.ts** — Utility to extract @mentions from text:
```ts
export function parseMentions(text: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return [...new Set(mentions)]; // deduplicate
}
```

2. **social.ts** — In the comment creation endpoint:
   - After creating the comment, parse mentions from the comment content
   - For each mentioned username, look up the user by displayName
   - Create a `'mention'` notification for each found user
   - Skip self-mentions

3. **chats.ts** — In the message creation endpoint (if it exists in the route):
   - Parse mentions from message content
   - Notify mentioned users (only if they're participants in the chat or collaborators on the character)

Run: `npx tsc --noEmit` — should be clean.

**Commit:** `feat(server): add @mention parsing and mention notifications`

---

### Task 6: Frontend — notification preferences UI + enhanced notification page

**Files:**
- Create: `src/client/services/notification-preferences.api.ts`
- Create: `src/client/components/notification/NotificationPreferences.vue`
- Modify: `src/client/pages/Notifications.vue` (add preferences button, grouped display)
- Modify: `src/client/stores/notification.ts` (add preferences state)
- Modify: `src/client/components/layout/NotificationBell.vue` (add toast for real-time notifications)

**What to do:**

1. **notification-preferences.api.ts** — API service:
   - `getPreferences()` → GET /notification-preferences
   - `updatePreference(type, settings)` → PUT /notification-preferences/:type
   - `bulkUpdatePreferences(prefs)` → PUT /notification-preferences

2. **NotificationPreferences.vue** — Settings panel (el-dialog or el-drawer):
   - Table/list of notification types with toggles for in-app and email
   - Email frequency select per type (immediate/daily/weekly/never)
   - Save button

3. **Notifications.vue** — Enhancements:
   - Add a settings/gear icon button that opens NotificationPreferences
   - Group notifications with the same groupKey — show "Alice and 2 others..." style
   - Add notification type icons for new types (collaborator, mention, fork, system)

4. **notification.ts store** — Add:
   - `preferences` state
   - `fetchPreferences()` and `updatePreference()` actions

5. **NotificationBell.vue** — Add a toast/notification popup when a real-time notification arrives via WebSocket (use ElNotification from Element Plus).

Run: `npx tsc --noEmit` — should be clean.

**Commit:** `feat(client): add notification preferences UI, grouped display, real-time toasts`

---

### Task 7: i18n + final verification

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`
- Modify: `ROADMAP.md`

**What to do:**

1. Add i18n keys for new notification features:
```json
"notificationPrefs": {
  "title": "Notification Preferences",
  "inApp": "In-App",
  "email": "Email",
  "emailFrequency": "Email Frequency",
  "immediate": "Immediate",
  "daily": "Daily Digest",
  "weekly": "Weekly Digest",
  "never": "Never",
  "saved": "Preferences saved",
  "follow": "New Followers",
  "favorite": "Character Favorites",
  "comment": "Comments",
  "reply": "Replies",
  "mention": "Mentions",
  "collaboratorInvite": "Collaborator Invitations",
  "collaboratorRoleChange": "Role Changes",
  "collaboratorRemoved": "Removed from Collaboration",
  "characterForked": "Character Forks",
  "system": "System Notifications"
},
"notifications": {
  "mentioned": "{actor} mentioned you in a comment",
  "collaboratorInvited": "{actor} invited you to collaborate on {target}",
  "collaboratorRoleChanged": "Your role on {target} was changed to {role}",
  "collaboratorRemoved": "You were removed from {target}",
  "characterForked": "{actor} forked your character {target}",
  "andOthers": "and {count} others",
  "preferences": "Preferences"
}
```

And corresponding zh-CN translations.

2. Verify:
   - `npx tsc --noEmit` — 0 errors
   - `npx vitest run` — all tests passing
   - `npm run build` — clean build

3. Update `ROADMAP.md` with Iteration 31 entry.

**Commit:** `feat(i18n): add notification enhancement i18n keys; update roadmap`

---

## Verification

After all tasks:
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — all tests passing (no regressions)
- `npm run build` — production build succeeds
