# Iteration 41: User Profile System

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add public user profiles with bio, avatar, created characters, follower counts, and profile editing.

**Architecture:** 5 tasks. T1 adds `bio` column to users schema + extends the profile API endpoint. T2 creates the public UserProfile.vue page. T3 creates the Profile.vue editing page. T4 adds profile link integration across the app. T5 runs final verification. T1 is independent; T2 depends on T1; T3 depends on T1; T4 depends on T2+T3.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest

---

### Task 1: Extend user schema and profile API

**Files:**
- Modify: `src/db/schema/users.ts`
- Modify: `src/server/services/social.service.ts`
- Modify: `src/server/routes/social.ts`
- Modify: `src/server/routes/users.ts` (if profile update endpoint needed)
- Modify: `src/client/types/index.ts`
- Modify: `src/client/services/api.ts` or create `src/client/services/user.api.ts`

**What to do:**

1. Add `bio` column to users schema in `src/db/schema/users.ts`:
```ts
bio: varchar('bio', { length: 500 }),
```
Add it after `avatarUrl` (line 20).

2. Extend `getUserProfile` in `src/server/services/social.service.ts` to return more data:
```ts
async getUserProfile(userId: string) {
  const user = await this.userRepo.findById(userId);
  if (!user) throw new NotFoundError('User');

  // Get character count
  const characters = await db.select({ count: sql<number>`count(*)::int` })
    .from(charactersTable)
    .where(and(eq(charactersTable.creatorId, userId), eq(charactersTable.isPublic, true)));

  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio || '',
    followerCount: user.followerCount,
    followingCount: user.followingCount,
    characterCount: characters[0]?.count ?? 0,
    createdAt: user.createdAt,
  };
}
```

Check what the characters table is called — look in `src/db/schema/` for the characters schema. Import it and the necessary drizzle operators. The `isPublic` field may not exist — if not, just count all characters by `creatorId`.

3. Make the profile endpoint public (remove or make auth optional) in `src/server/routes/social.ts` line 427. Currently it requires auth — change to allow unauthenticated access:
```ts
socialRoutes.get('/users/:userId/profile', async (c) => {
```

4. Add `GET /users/:userId/characters` endpoint to social.ts to list a user's public characters:
```ts
socialRoutes.get('/users/:userId/characters', async (c) => {
  const userId = c.req.param('userId');
  const characters = await db.select()
    .from(charactersTable)
    .where(eq(charactersTable.creatorId, userId))
    .orderBy(desc(charactersTable.createdAt))
    .limit(20);
  return c.json<ApiResponse>({
    success: true,
    data: characters,
    meta: { timestamp: new Date().toISOString() },
  });
});
```

Check the actual characters schema for the correct table name and field names (it might be `characters` or have different column names for creator/public status).

5. Add profile update endpoint. Check if `src/server/routes/users.ts` already has a PATCH/PUT for profile. If not, add:
```ts
// PATCH /me/profile — Update own profile
userRoutes.patch('/me/profile', authMiddleware(), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const schema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    bio: z.string().max(500).optional(),
    avatarUrl: z.string().max(500).optional(),
  });
  const validated = schema.parse(body);

  const [updated] = await db.update(users)
    .set({ ...validated, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();

  return c.json<ApiResponse>({
    success: true,
    data: { id: updated.id, displayName: updated.displayName, bio: updated.bio, avatarUrl: updated.avatarUrl },
    meta: { timestamp: new Date().toISOString() },
  });
});
```

Check the existing users.ts routes file to see what's already there and follow the same patterns.

6. Extend client `User` type in `src/client/types/index.ts`:
```ts
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  tenantId: string;
  role?: 'user' | 'moderator' | 'admin';
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  createdAt: string;
}
```

7. Add API methods. Create or extend a user API service:
```ts
export const userApi = {
  getPublicProfile: (userId: string) =>
    api.get<UserProfile>(`/social/users/${userId}/profile`),
  getUserCharacters: (userId: string) =>
    api.get<Character[]>(`/social/users/${userId}/characters`),
  updateProfile: (data: { displayName?: string; bio?: string; avatarUrl?: string }) =>
    api.patch<User>('/users/me/profile', data),
};
```

**Tests:** ~4 tests in `src/server/routes/user-profile.spec.ts`
- Get public profile returns user data with bio and counts
- Get profile returns 404 for non-existent user
- Update profile changes displayName and bio
- Get user characters returns list

**Commit:** `feat(users): extend user schema with bio and enhance profile API`

---

### Task 2: Create public UserProfile page

**Files:**
- Create: `src/client/pages/UserProfile.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Create `UserProfile.vue` — a public profile page at `/user/:userId`. Use `DashboardLayout`.

2. On mount, fetch the user profile and their characters:
```ts
const route = useRoute();
const userId = computed(() => route.params.userId as string);
const profile = ref<UserProfile | null>(null);
const characters = ref<Character[]>([]);
const loading = ref(true);
const isFollowing = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    profile.value = await userApi.getPublicProfile(userId.value);
    characters.value = await userApi.getUserCharacters(userId.value);
    // Check follow status if authenticated
    // Use socialStore if available
  } catch {
    // Handle error
  } finally {
    loading.value = false;
  }
});
```

3. Template layout:
- Profile header: avatar (large, 96px), displayName, bio, join date
- Stats row: follower count, following count, character count
- Follow/Unfollow button (if authenticated and not own profile)
- Character grid: show user's public characters as cards (reuse the card pattern from MyCharacters or Market)

4. Follow/unfollow: use the existing `socialStore` or call the social API directly:
```ts
async function toggleFollow() {
  if (isFollowing.value) {
    await socialApi.unfollow(userId.value);
  } else {
    await socialApi.follow(userId.value);
  }
  isFollowing.value = !isFollowing.value;
}
```

Check `src/client/stores/social.ts` for existing follow methods.

5. Add i18n keys under `userProfile` section:
- en-US: `"title": "User Profile"`, `"followers": "Followers"`, `"following": "Following"`, `"characters": "Characters"`, `"joinedAt": "Joined {date}"`, `"follow": "Follow"`, `"unfollow": "Unfollow"`, `"noCharacters": "No public characters yet"`, `"notFound": "User not found"`
- zh-CN: `"title": "用户资料"`, `"followers": "粉丝"`, `"following": "关注"`, `"characters": "角色"`, `"joinedAt": "加入于 {date}"`, `"follow": "关注"`, `"unfollow": "取消关注"`, `"noCharacters": "暂无公开角色"`, `"notFound": "用户不存在"`

**Tests:** ~2 tests in `src/client/pages/UserProfile.spec.ts`
- Renders profile with displayName and bio
- Shows character list

**Commit:** `feat(ui): create public UserProfile page`

---

### Task 3: Create Profile editing page

**Files:**
- Create: `src/client/pages/Profile.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Create `Profile.vue` — the authenticated user's own profile editing page at `/profile`. Use `DashboardLayout`.

2. Load current user data from the user store:
```ts
const userStore = useUserStore();
const form = reactive({
  displayName: '',
  bio: '',
  avatarUrl: '',
});
const saving = ref(false);

onMounted(() => {
  if (userStore.user) {
    form.displayName = userStore.user.name || '';
    form.bio = userStore.user.bio || '';
    form.avatarUrl = userStore.user.avatar || '';
  }
});
```

3. Form with:
- Avatar upload (reuse the same data URL pattern from CharacterEditor)
- Display name input (max 100 chars)
- Bio textarea (max 500 chars, show character count)
- Save button

4. Save handler:
```ts
async function handleSave() {
  saving.value = true;
  try {
    await userApi.updateProfile({
      displayName: form.displayName,
      bio: form.bio,
      avatarUrl: form.avatarUrl,
    });
    // Refresh user store
    await userStore.fetchProfile();
    ElMessage.success(t('profile.updateSuccess'));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : t('common.retry');
    ElMessage.error(msg);
  } finally {
    saving.value = false;
  }
}
```

5. Add a "View Public Profile" link that navigates to `/user/${userStore.user.id}`.

6. Add i18n keys under `profile` section:
- en-US: `"title": "Edit Profile"`, `"displayName": "Display Name"`, `"bio": "Bio"`, `"bioPlaceholder": "Tell others about yourself..."`, `"avatar": "Avatar"`, `"uploadAvatar": "Upload Avatar"`, `"updateSuccess": "Profile updated"`, `"viewPublicProfile": "View Public Profile"`
- zh-CN: `"title": "编辑资料"`, `"displayName": "显示名称"`, `"bio": "个人简介"`, `"bioPlaceholder": "介绍一下自己..."`, `"avatar": "头像"`, `"uploadAvatar": "上传头像"`, `"updateSuccess": "资料已更新"`, `"viewPublicProfile": "查看公开资料"`

**Tests:** ~2 tests in `src/client/pages/Profile.spec.ts`
- Renders form with user data
- Save calls updateProfile API

**Commit:** `feat(ui): create Profile editing page`

---

### Task 4: Add profile links across the app

**Files:**
- Modify: `src/client/components/layout/LeftSidebar.vue` or navigation component
- Modify: `src/client/components/chat/MessageBubble.vue` (optional — link assistant name to character creator)

**What to do:**

1. Add "Profile" link to the sidebar/navigation. Check `src/client/components/layout/` for the sidebar or header component that has navigation links. Add a link to `/profile` for authenticated users.

2. In the user menu (likely in AppHeader or UserMenu component), add a "My Profile" option that navigates to `/profile`.

3. Add i18n keys:
- en-US under `nav`: `"profile": "My Profile"`
- zh-CN: `"profile": "我的资料"`

**Tests:** ~1 test
- Profile link visible in navigation for authenticated users

**Commit:** `feat(ui): add profile navigation links`

---

### Task 5: Final verification

**What to do:**

1. Run `npx vitest run` — expect 1910+ tests passing
2. Run `npx tsc --noEmit` — expect 0 errors
3. Verify:
   - Public profile page renders at `/user/:userId`
   - Profile editing page renders at `/profile`
   - Bio field saved and displayed
   - Follow/unfollow works on public profile
   - User's characters shown on profile
   - Navigation links work

**Commit:** None (verification only).

---

## Verification

After all tasks:
- `npx vitest run` — 1910+ tests passing
- `npx tsc --noEmit` — 0 errors
- Public user profiles with bio, avatar, stats
- Profile editing with bio, displayName, avatar
- Navigation links to profile pages
