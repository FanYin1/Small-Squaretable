# Iteration 19: Social Feature Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Enhance social features with an activity feed, user profile API, comment likes, and a proper social Pinia store.

**Architecture:** Add an `activities` table to record social events (follow, favorite, comment, character creation). A new `ActivityService` listens to EventBus events and records activities. A feed API returns activities from followed users. Comment likes use a new `comment_likes` table. A social Pinia store centralizes client-side social state. The UserProfile page gets follower/following tabs and uses the new profile endpoint.

**Tech Stack:** PostgreSQL + Drizzle ORM, Hono.js, Vue 3 + Pinia, Element Plus, Vitest

---

### Task 1: Add user profile API endpoint

**Files:**
- Modify: `src/server/routes/social.ts`
- Modify: `src/server/services/social.service.ts`

**What to do:**

1. In `social.service.ts`, add a `getUserProfile` method. It needs to fetch user info. Read `src/db/repositories/user.repository.ts` to find how to get a user by ID. The method should return `{ id, displayName, avatarUrl, bio }` (or whatever fields the user table has).

```ts
  async getUserProfile(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User');
    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
  }
```

You'll need to add `userRepo` to the constructor. Check the existing constructor pattern — it uses DI. Import `UserRepository` and add it. Also update the singleton at the bottom of the file.

2. In `social.ts` routes, add:

```ts
// GET /users/:userId/profile - Get user public profile
socialRoutes.get('/users/:userId/profile', authMiddleware(), async (c) => {
  const userId = c.req.param('userId');
  const profile = await socialService.getUserProfile(userId);

  return c.json<ApiResponse>({
    success: true,
    data: profile,
    meta: { timestamp: new Date().toISOString() },
  }, 200);
});
```

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'social\.(ts|service)' | head -10`

**Commit:** `feat(social): add user profile API endpoint`

---

### Task 2: Add activity feed schema + repository

**Files:**
- Create: `src/db/schema/activities.ts`
- Create: `src/db/repositories/activity.repository.ts`
- Modify: `src/db/schema/index.ts` — add export

**What to do:**

1. Create `src/db/schema/activities.ts`:

```ts
import { pgTable, uuid, varchar, text, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // 'follow', 'favorite', 'comment', 'character_created'
  targetType: varchar('target_type', { length: 50 }), // 'user', 'character', 'comment'
  targetId: uuid('target_id'),
  metadata: jsonb('metadata'), // extra context (character name, comment preview, etc.)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_activities_user').on(table.userId),
  createdAtIdx: index('idx_activities_created_at').on(table.createdAt),
  typeIdx: index('idx_activities_type').on(table.type),
}));

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
```

2. Create `src/db/repositories/activity.repository.ts`:

```ts
import { eq, desc, inArray, sql, and } from 'drizzle-orm';
import { db } from '../index';
import { activities } from '../schema/activities';
import { follows } from '../schema/social';
import type { Activity, NewActivity } from '../schema/activities';

class ActivityRepository {
  async create(data: NewActivity): Promise<Activity> {
    const [activity] = await db.insert(activities).values(data).returning();
    return activity;
  }

  /**
   * Get feed: activities from users that the given user follows,
   * ordered by most recent, with pagination.
   */
  async getFeed(userId: string, limit = 20, offset = 0): Promise<Activity[]> {
    return await db.execute(sql`
      SELECT a.*
      FROM activities a
      INNER JOIN follows f ON f.following_id = a.user_id
      WHERE f.follower_id = ${userId}::uuid
      ORDER BY a.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `) as unknown as Activity[];
  }

  /**
   * Get activities for a specific user (their profile activity).
   */
  async getByUser(userId: string, limit = 20, offset = 0): Promise<Activity[]> {
    return await db
      .select()
      .from(activities)
      .where(eq(activities.userId, userId))
      .orderBy(desc(activities.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async deleteByUser(userId: string): Promise<void> {
    await db.delete(activities).where(eq(activities.userId, userId));
  }
}

export const activityRepository = new ActivityRepository();
```

3. In `src/db/schema/index.ts`, add: `export * from './activities';`

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'activit' | head -10`

**Commit:** `feat(social): add activity feed schema and repository`

---

### Task 3: Add activity feed service

**Files:**
- Create: `src/server/services/activity.service.ts`
- Create: `src/server/services/activity.service.spec.ts`

**What to do:**

1. Create `src/server/services/activity.service.ts`:

```ts
import { activityRepository } from '../../db/repositories/activity.repository';
import { eventBus } from './event-bus.service';
import { logger } from './logger.service';

const activityLogger = logger.child({ module: 'activity' });

export class ActivityService {
  /**
   * Record an activity event.
   */
  async record(
    userId: string,
    type: string,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, unknown>
  ) {
    try {
      await activityRepository.create({
        userId,
        type,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        metadata: metadata ?? null,
      });
    } catch (error) {
      activityLogger.error('Failed to record activity', error as Error);
    }
  }

  /**
   * Get feed for a user (activities from followed users).
   */
  async getFeed(userId: string, limit = 20, offset = 0) {
    return activityRepository.getFeed(userId, limit, offset);
  }

  /**
   * Get activities for a specific user's profile.
   */
  async getUserActivities(userId: string, limit = 20, offset = 0) {
    return activityRepository.getByUser(userId, limit, offset);
  }

  /**
   * Register EventBus listeners to auto-record activities.
   */
  registerListeners() {
    eventBus.on('social.follow', async (payload) => {
      const { followerId, followingId } = payload as { followerId: string; followingId: string };
      await this.record(followerId, 'follow', 'user', followingId);
    });

    eventBus.on('social.favorite', async (payload) => {
      const { userId, characterId } = payload as { userId: string; characterId: string };
      await this.record(userId, 'favorite', 'character', characterId);
    });

    eventBus.on('social.comment', async (payload) => {
      const { userId, characterId, commentId } = payload as {
        userId: string; characterId: string; commentId: string;
      };
      await this.record(userId, 'comment', 'character', characterId, { commentId });
    });

    eventBus.on('character.created', async (payload) => {
      const { userId, characterId, name } = payload as {
        userId: string; characterId: string; name: string;
      };
      await this.record(userId, 'character_created', 'character', characterId, { name });
    });
  }
}

export const activityService = new ActivityService();
```

2. Create `src/server/services/activity.service.spec.ts` with tests:
- "should record an activity" — verify activityRepository.create is called with correct params
- "should handle record failure gracefully" — create throws, no error propagated
- "should get feed for user" — verify activityRepository.getFeed called
- "should get user activities" — verify activityRepository.getByUser called
- "should register EventBus listeners for social events" — verify eventBus.on called 4 times

Mock `activityRepository` and `eventBus`.

**Verification:**
Run: `npx vitest run src/server/services/activity.service.spec.ts`

**Commit:** `feat(social): add activity feed service with EventBus listeners`

---

### Task 4: Add activity feed API routes

**Files:**
- Create: `src/server/routes/activity.ts`
- Modify: `src/server/index.ts` — register routes

**What to do:**

1. Create `src/server/routes/activity.ts`:

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { activityService } from '../services/activity.service';
import type { ApiResponse } from '../../types/api';

export const activityRoutes = new Hono();

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /feed - Get activity feed (from followed users)
activityRoutes.get(
  '/feed',
  authMiddleware(),
  zValidator('query', feedQuerySchema),
  async (c) => {
    const user = c.get('user');
    const { limit, offset } = c.req.valid('query');
    const activities = await activityService.getFeed(user.id, limit, offset);

    return c.json<ApiResponse>({
      success: true,
      data: activities,
      meta: { timestamp: new Date().toISOString() },
    }, 200);
  }
);

// GET /users/:userId/activities - Get user's activity history
activityRoutes.get(
  '/users/:userId/activities',
  authMiddleware(),
  zValidator('query', feedQuerySchema),
  async (c) => {
    const userId = c.req.param('userId');
    const { limit, offset } = c.req.valid('query');
    const activities = await activityService.getUserActivities(userId, limit, offset);

    return c.json<ApiResponse>({
      success: true,
      data: activities,
      meta: { timestamp: new Date().toISOString() },
    }, 200);
  }
);
```

2. In `src/server/index.ts`, find where routes are registered (look for `socialRoutes`) and add:
```ts
import { activityRoutes } from './routes/activity';
// ... in the route registration section:
app.route('/api/v1/social', activityRoutes);
```

Also, find where the server starts (or where services are initialized) and add:
```ts
import { activityService } from './services/activity.service';
activityService.registerListeners();
```

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'activity|index\.ts' | head -10`

**Commit:** `feat(social): add activity feed API routes`

---

### Task 5: Add comment likes

**Files:**
- Modify: `src/db/schema/social.ts` — add commentLikes table
- Modify: `src/db/repositories/comment.repository.ts` — add like/unlike/getLikeCount
- Modify: `src/server/services/social.service.ts` — add likeComment/unlikeComment
- Modify: `src/server/routes/social.ts` — add like/unlike endpoints
- Modify: `src/types/social.ts` — add CommentLike types

**What to do:**

1. In `src/db/schema/social.ts`, add a `commentLikes` table after the `comments` table:

```ts
export const commentLikes = pgTable('comment_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  commentId: uuid('comment_id')
    .notNull()
    .references(() => comments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueLikeIdx: uniqueIndex('idx_comment_likes_unique').on(table.userId, table.commentId),
  commentIdx: index('idx_comment_likes_comment').on(table.commentId),
}));

export type CommentLike = typeof commentLikes.$inferSelect;
export type NewCommentLike = typeof commentLikes.$inferInsert;
```

2. Read `src/db/repositories/comment.repository.ts` to understand the existing pattern. Add methods:
- `likeComment(userId, commentId)` — insert into commentLikes (ON CONFLICT DO NOTHING)
- `unlikeComment(userId, commentId)` — delete from commentLikes
- `getLikeCount(commentId)` — count likes
- `isLiked(userId, commentId)` — check if user liked

3. In `social.service.ts`, add:
- `likeComment(userId, commentId)` — calls commentRepo.likeComment + emits event
- `unlikeComment(userId, commentId)` — calls commentRepo.unlikeComment

4. In `social.ts` routes, add:
- `POST /comments/:commentId/like` — like a comment
- `DELETE /comments/:commentId/like` — unlike a comment

5. In `src/types/social.ts`, extend `CommentWithAuthor` to include `likeCount?: number` and `isLiked?: boolean`.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'social|comment' | head -10`
Run: `npx vitest run src/server/services/social.service.spec.ts`

**Commit:** `feat(social): add comment likes`

---

### Task 6: Create social Pinia store

**Files:**
- Create: `src/client/stores/social.ts`
- Create: `src/client/stores/social.spec.ts`

**What to do:**

1. Create `src/client/stores/social.ts` — a Pinia composition store that manages:
- Follow state (isFollowing, followerCount, followingCount)
- Favorite state (isFavorited, favoriteCount)
- Activity feed (activities list, loading, pagination)
- Actions: follow, unfollow, favorite, unfavorite, fetchFeed, fetchUserActivities, likeComment, unlikeComment

Follow the pattern from existing stores (e.g., `characterIntelligence.ts`). Use `socialApi` for API calls.

Add feed-related API methods to `src/client/services/social.api.ts`:
```ts
  // Activity Feed
  getFeed: (limit = 20, offset = 0) =>
    api.get(`/social/feed?limit=${limit}&offset=${offset}`),
  getUserActivities: (userId: string, limit = 20, offset = 0) =>
    api.get(`/social/users/${userId}/activities?limit=${limit}&offset=${offset}`),

  // Comment Likes
  likeComment: (commentId: string) => api.post(`/social/comments/${commentId}/like`),
  unlikeComment: (commentId: string) => api.delete(`/social/comments/${commentId}/like`),
```

2. Create `src/client/stores/social.spec.ts` with tests:
- "should fetch activity feed"
- "should fetch user activities"
- "should follow/unfollow user"
- "should favorite/unfavorite character"
- "should like/unlike comment"
- "should handle errors"

**Verification:**
Run: `npx vitest run src/client/stores/social.spec.ts`

**Commit:** `feat(client): add social Pinia store with activity feed`

---

### Task 7: Add activity feed frontend page

**Files:**
- Create: `src/client/pages/ActivityFeed.vue`
- Create: `src/client/components/social/ActivityItem.vue`
- Modify: `src/client/router/index.ts` — add route

**What to do:**

1. Create `src/client/components/social/ActivityItem.vue` — a component that renders a single activity:
- Shows user avatar + display name
- Shows activity type icon + description (e.g., "followed UserX", "favorited CharacterY", "commented on CharacterZ")
- Shows relative timestamp
- Clickable to navigate to the target

2. Create `src/client/pages/ActivityFeed.vue`:
- Uses DashboardLayout
- Fetches feed from social store on mount
- Renders ActivityItem list
- Load more button for pagination
- Empty state when no activities

3. In `src/client/router/index.ts`, add route:
```ts
{
  path: '/feed',
  name: 'ActivityFeed',
  component: () => import('@client/pages/ActivityFeed.vue'),
  meta: { requiresAuth: true },
}
```

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep -E 'ActivityFeed|ActivityItem' | head -10`

**Commit:** `feat(client): add activity feed page and activity item component`

---

### Task 8: Enhance UserProfile with follower/following tabs + activity tab

**Files:**
- Modify: `src/client/pages/UserProfile.vue`

**What to do:**

Add two new tabs to the UserProfile page:
1. "Followers" tab — shows list of followers with FollowButton
2. "Following" tab — shows list of users being followed
3. "Activity" tab — shows user's recent activities using ActivityItem

Use `socialApi.getFollowers`, `socialApi.getFollowing`, and `socialApi.getUserActivities`.

The existing tabs are "characters" and "favorites". Add "followers", "following", and "activity" tabs.

**Verification:**
Run: `npx tsc --noEmit 2>&1 | grep 'UserProfile' | head -10`

**Commit:** `feat(client): add follower/following/activity tabs to user profile`

---

### Task 9: Add i18n keys for social enhancements

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

Add/extend `social` and `activity` sections:

en-US.json:
```json
{
  "activity": {
    "feed": "Activity Feed",
    "feedEmpty": "No activity yet. Follow some users to see their activity here.",
    "loadMore": "Load more",
    "followed": "followed",
    "favorited": "favorited",
    "commented": "commented on",
    "createdCharacter": "created character",
    "justNow": "just now",
    "minutesAgo": "{count} min ago",
    "hoursAgo": "{count}h ago",
    "daysAgo": "{count}d ago"
  },
  "social": {
    "like": "Like",
    "unlike": "Unlike",
    "likes": "{count} likes",
    "followersTab": "Followers",
    "followingTab": "Following",
    "activityTab": "Activity",
    "noActivity": "No activity yet"
  }
}
```

zh-CN.json:
```json
{
  "activity": {
    "feed": "动态",
    "feedEmpty": "暂无动态。关注一些用户来查看他们的动态。",
    "loadMore": "加载更多",
    "followed": "关注了",
    "favorited": "收藏了",
    "commented": "评论了",
    "createdCharacter": "创建了角色",
    "justNow": "刚刚",
    "minutesAgo": "{count} 分钟前",
    "hoursAgo": "{count} 小时前",
    "daysAgo": "{count} 天前"
  },
  "social": {
    "like": "点赞",
    "unlike": "取消点赞",
    "likes": "{count} 个赞",
    "followersTab": "粉丝",
    "followingTab": "关注",
    "activityTab": "动态",
    "noActivity": "暂无动态"
  }
}
```

**Verification:**
Run: `npx vitest run 2>&1 | tail -5`

**Commit:** `feat(i18n): add social enhancement translations (en-US + zh-CN)`

---

### Task 10: Final verification and docs update

**What to do:**

1. Run `npx tsc --noEmit` — expect 0 errors
2. Run `npx vitest run` — expect all tests passing
3. Run `npm run build` — expect clean production build
4. Update `ROADMAP.md` — add Iteration 19 entry:
```markdown
### 迭代 19: 社交功能增强 ✅ (2026-02-22)
- ✅ **用户资料 API** — GET /social/users/:userId/profile 端点
- ✅ **动态流** — activities 表 + ActivityService (EventBus 自动记录) + feed API
- ✅ **评论点赞** — comment_likes 表, 点赞/取消点赞 API
- ✅ **社交 Store** — Pinia composition store (关注/收藏/动态/点赞)
- ✅ **动态页面** — ActivityFeed 页面 + ActivityItem 组件
- ✅ **用户资料增强** — 粉丝/关注/动态标签页
- ✅ **i18n** — activity.* + social.* 键 (en-US + zh-CN)
```

**Commit:** `docs: update ROADMAP.md for Iteration 19 (social feature enhancement)`

---

## Verification

After all tasks:
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — all tests passing
- `npm run build` — production build succeeds
- User profile endpoint returns user info
- Activity feed shows actions from followed users
- Comments can be liked/unliked
- Social Pinia store manages all social state
- UserProfile has follower/following/activity tabs
