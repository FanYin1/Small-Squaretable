# Iteration 48: Admin Panel Enhancement (管理后台增强)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add admin announcement broadcast system, user detail drawer, GDPR management page, and admin action notifications to affected users.

**Architecture:** 5 tasks. T1 adds announcement broadcast. T2 adds user detail drawer. T3 adds GDPR management page. T4 adds admin action notifications. T5 runs final verification.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Add admin announcement broadcast system

**Files:**
- Modify: `src/server/routes/admin/system.ts`
- Modify: `src/client/pages/admin/SystemDashboard.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Read `src/server/routes/admin/system.ts` first. Add a POST `/announcements` endpoint that creates a notification for all users:

```ts
// POST /announcements — Broadcast announcement to all users
adminSystemRouter.post('/announcements', requireRole('admin'), async (c) => {
  const { title, message, type } = await c.req.json();
  // Validate
  if (!message || typeof message !== 'string') {
    return c.json<ApiResponse>({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Message is required' }, meta: { timestamp: new Date().toISOString() } }, 400);
  }

  // Get all active user IDs
  const allUsers = await db.select({ id: users.id }).from(users);

  // Create notification for each user (batch insert)
  const notifValues = allUsers.map(u => ({
    userId: u.id,
    type: 'announcement' as const,
    message: message.substring(0, 500),
    isRead: false,
  }));

  if (notifValues.length > 0) {
    await db.insert(notifications).values(notifValues);
  }

  // Log audit
  auditService.log({ actorId: user.id, action: 'admin.announcement', targetType: 'system', details: { message: message.substring(0, 100) } });

  return c.json<ApiResponse>({
    success: true,
    data: { recipientCount: allUsers.length },
    meta: { timestamp: new Date().toISOString() },
  });
});
```

Check how `db`, `users`, `notifications` are imported in the file. Follow existing patterns.

2. In `SystemDashboard.vue`, add an "Announcements" section with a textarea + send button. Read the file first.

3. Add i18n keys under `admin.system`:
- en-US: `"announcements": "Announcements"`, `"sendAnnouncement": "Send Announcement"`, `"announcementMessage": "Announcement message"`, `"announcementSent": "Announcement sent to {count} users"`
- zh-CN: `"announcements": "公告"`, `"sendAnnouncement": "发送公告"`, `"announcementMessage": "公告内容"`, `"announcementSent": "公告已发送给 {count} 位用户"`

**Tests:** ~2 tests in `src/server/routes/admin/admin-announcements.spec.ts`
- POST /announcements creates notifications for all users
- POST /announcements returns 400 for empty message

**Commit:** `feat(admin): add announcement broadcast system`

---

### Task 2: Add user detail drawer in UserManagement

**Files:**
- Modify: `src/client/pages/admin/UserManagement.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Read `src/client/pages/admin/UserManagement.vue` first. The backend already has `GET /admin/users/:id` returning full user details.

2. Add an `el-drawer` that opens when clicking a user row. The drawer shows:
   - User avatar + display name + email
   - Account status (active/suspended)
   - Role
   - Subscription plan + status
   - OAuth accounts linked
   - Created at / Last login
   - Quick action buttons (suspend/unsuspend, role change)

3. Add a `selectedUser` ref and `fetchUserDetail` function that calls `GET /admin/users/${id}`.

4. Add i18n keys under `admin.users`:
- en-US: `"userDetail": "User Detail"`, `"accountStatus": "Account Status"`, `"subscriptionPlan": "Subscription Plan"`, `"oauthAccounts": "Linked Accounts"`, `"lastLogin": "Last Login"`, `"createdAt": "Created At"`
- zh-CN: `"userDetail": "用户详情"`, `"accountStatus": "账户状态"`, `"subscriptionPlan": "订阅计划"`, `"oauthAccounts": "关联账户"`, `"lastLogin": "最后登录"`, `"createdAt": "创建时间"`

**Tests:** ~2 tests in `src/client/pages/admin/UserManagement.spec.ts`
- Renders user table
- Opens drawer on row click (check drawer visibility)

Follow existing component test patterns with Pinia + i18n + Element Plus stubs.

**Commit:** `feat(admin): add user detail drawer`

---

### Task 3: Add GDPR management page

**Files:**
- Create: `src/client/pages/admin/GdprManagement.vue`
- Modify: `src/client/router/index.ts`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Read `src/server/routes/admin/gdpr.ts` to understand the API. It has:
   - GET `/gdpr/requests` — paginated list of deletion requests
   - POST `/gdpr/requests/:id/process` — force-process a deletion request

2. Read `src/client/pages/admin/AdminLayout.vue` to see how the GDPR nav item is configured and what route name it expects.

3. Create `GdprManagement.vue` with:
   - Table showing deletion requests (userId, status, requestedAt, scheduledAt)
   - Status filter (pending/processing/completed)
   - "Process Now" button for pending requests
   - Confirmation dialog before processing

4. Register the route in `src/client/router/index.ts`. Read the file first to find the admin route group and add the GDPR route following the existing pattern.

5. Add i18n keys under `admin.gdpr`:
- en-US: `"title": "GDPR Requests"`, `"requestId": "Request ID"`, `"requestedAt": "Requested At"`, `"scheduledAt": "Scheduled At"`, `"processNow": "Process Now"`, `"confirmProcess": "Are you sure you want to process this deletion request immediately?"`, `"processed": "Request processed successfully"`, `"noRequests": "No GDPR requests"`
- zh-CN: `"title": "GDPR 请求"`, `"requestId": "请求 ID"`, `"requestedAt": "请求时间"`, `"scheduledAt": "计划时间"`, `"processNow": "立即处理"`, `"confirmProcess": "确定要立即处理此删除请求吗？"`, `"processed": "请求处理成功"`, `"noRequests": "暂无 GDPR 请求"`

**Tests:** ~2 tests in `src/client/pages/admin/GdprManagement.spec.ts`
- Renders GDPR table
- Shows empty state when no requests

**Commit:** `feat(admin): add GDPR management page`

---

### Task 4: Add admin action notifications to affected users

**Files:**
- Modify: `src/server/routes/admin/users.ts`
- Modify: `src/server/routes/admin/content.ts`

**What to do:**

1. Read `src/server/routes/admin/users.ts`. When an admin suspends a user, send a notification to that user. After the suspend logic, add:
```ts
await notificationService.notify({
  userId: targetUserId,
  type: 'system',
  message: 'Your account has been suspended. Please contact support for more information.',
});
```

Similarly for unsuspend:
```ts
await notificationService.notify({
  userId: targetUserId,
  type: 'system',
  message: 'Your account has been reactivated.',
});
```

And for role change:
```ts
await notificationService.notify({
  userId: targetUserId,
  type: 'system',
  message: `Your account role has been updated to ${newRole}.`,
});
```

2. Read `src/server/routes/admin/content.ts`. When a report is resolved, notify the reporter:
```ts
await notificationService.notify({
  userId: report.reporterId,
  type: 'system',
  message: 'Your report has been reviewed and resolved. Thank you for helping keep our community safe.',
});
```

Check how `notificationService` is imported — look at existing usage in the codebase. It's likely `import { notificationService } from '../../services/notification.service'`.

**Tests:** ~2 tests in `src/server/routes/admin/admin-notifications.spec.ts`
- Suspend user sends notification to suspended user
- Resolve report sends notification to reporter

**Commit:** `feat(admin): add notifications for admin actions`

---

### Task 5: Final verification

1. Run `npx vitest run` — expect 2000+ tests passing
2. Run `npx tsc --noEmit` — expect 0 errors

**Commit:** None (verification only).
