/**
 * Follow Repository
 *
 * Handles data access for user-to-user follow relationships
 */

import { eq, and, sql, desc } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { follows, type Follow } from '../schema/social';
import { users } from '../schema/users';

export class FollowRepository extends BaseRepository {
  /**
   * Follow a user. Uses a transaction to atomically:
   * 1. Insert into follows (ON CONFLICT DO NOTHING for idempotency)
   * 2. Increment followerCount on the followed user
   * 3. Increment followingCount on the follower
   * Returns the follow record (or existing if duplicate).
   */
  async follow(followerId: string, followingId: string): Promise<Follow> {
    return await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(follows)
        .values({ followerId, followingId })
        .onConflictDoNothing({
          target: [follows.followerId, follows.followingId],
        })
        .returning();

      // If row is undefined the record already existed (conflict) — return existing
      if (!row) {
        const [existing] = await tx
          .select()
          .from(follows)
          .where(
            and(
              eq(follows.followerId, followerId),
              eq(follows.followingId, followingId),
            ),
          );
        return existing;
      }

      // Increment followerCount on the followed user
      await tx
        .update(users)
        .set({
          followerCount: sql`${users.followerCount} + 1`,
        })
        .where(eq(users.id, followingId));

      // Increment followingCount on the follower
      await tx
        .update(users)
        .set({
          followingCount: sql`${users.followingCount} + 1`,
        })
        .where(eq(users.id, followerId));

      return row;
    });
  }

  /**
   * Unfollow a user. Uses a transaction to atomically:
   * 1. Delete from follows where followerId AND followingId match
   * 2. If deleted, decrement followerCount on followed user
   * 3. If deleted, decrement followingCount on follower
   * Returns true if deleted, false if not found.
   */
  async unfollow(followerId: string, followingId: string): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(follows)
        .where(
          and(
            eq(follows.followerId, followerId),
            eq(follows.followingId, followingId),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        return false;
      }

      // Decrement followerCount on the followed user, floored at 0
      await tx
        .update(users)
        .set({
          followerCount: sql`GREATEST(${users.followerCount} - 1, 0)`,
        })
        .where(eq(users.id, followingId));

      // Decrement followingCount on the follower, floored at 0
      await tx
        .update(users)
        .set({
          followingCount: sql`GREATEST(${users.followingCount} - 1, 0)`,
        })
        .where(eq(users.id, followerId));

      return true;
    });
  }

  /**
   * Check if followerId follows followingId.
   */
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: follows.id })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId),
        ),
      );
    return rows.length > 0;
  }

  /**
   * Get paginated list of followers for a user (join with users table
   * for displayName, avatarUrl).
   */
  async getFollowers(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<
    Array<{
      id: string;
      displayName: string | null;
      avatarUrl: string | null;
      followedAt: Date;
    }>
  > {
    const rows = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .where(eq(follows.followingId, userId))
      .orderBy(desc(follows.createdAt))
      .limit(limit)
      .offset(offset);

    return rows;
  }

  /**
   * Get paginated list of users that userId follows (join with users table).
   */
  async getFollowing(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<
    Array<{
      id: string;
      displayName: string | null;
      avatarUrl: string | null;
      followedAt: Date;
    }>
  > {
    const rows = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followingId, users.id))
      .where(eq(follows.followerId, userId))
      .orderBy(desc(follows.createdAt))
      .limit(limit)
      .offset(offset);

    return rows;
  }

  /**
   * Get followerCount and followingCount from users table.
   */
  async getFollowCounts(
    userId: string,
  ): Promise<{ followerCount: number; followingCount: number }> {
    const [row] = await this.db
      .select({
        followerCount: users.followerCount,
        followingCount: users.followingCount,
      })
      .from(users)
      .where(eq(users.id, userId));
    return {
      followerCount: row?.followerCount ?? 0,
      followingCount: row?.followingCount ?? 0,
    };
  }
}

export const followRepository = new FollowRepository(db);
