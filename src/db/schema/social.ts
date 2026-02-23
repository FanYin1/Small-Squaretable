/**
 * 社交功能表 Schema
 *
 * 存储关注、收藏、评论和通知数据
 */

import { pgTable, uuid, varchar, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import { characters } from './characters';

/**
 * 关注表 - 用户之间的关注关系
 */
export const follows = pgTable('follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  followerId: uuid('follower_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  followingId: uuid('following_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueFollowIdx: uniqueIndex('idx_follows_unique').on(table.followerId, table.followingId),
  followerIdx: index('idx_follows_follower').on(table.followerId),
  followingIdx: index('idx_follows_following').on(table.followingId),
}));

export type Follow = typeof follows.$inferSelect;
export type NewFollow = typeof follows.$inferInsert;

/**
 * 收藏表 - 用户收藏角色
 */
export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueFavoriteIdx: uniqueIndex('idx_favorites_unique').on(table.userId, table.characterId),
  userIdx: index('idx_favorites_user').on(table.userId),
  characterIdx: index('idx_favorites_character').on(table.characterId),
}));

export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;

/**
 * 评论表 - 角色评论（支持嵌套回复）
 */
export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  content: text('content').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  characterIdx: index('idx_comments_character').on(table.characterId),
  userIdx: index('idx_comments_user').on(table.userId),
  parentIdx: index('idx_comments_parent').on(table.parentId),
  createdAtIdx: index('idx_comments_created_at').on(table.createdAt),
}));

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

/**
 * 评论点赞表 - 用户对评论的点赞
 */
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

/**
 * 通知表 - 用户通知（关注、收藏、评论、回复）
 */
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  actorId: uuid('actor_id')
    .references(() => users.id, { onDelete: 'set null' }),
  targetType: varchar('target_type', { length: 50 }),
  targetId: uuid('target_id'),
  message: text('message').notNull(),
  groupKey: varchar('group_key', { length: 255 }),
  priority: varchar('priority', { length: 20 }).default('normal'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_notifications_user').on(table.userId),
  userReadIdx: index('idx_notifications_user_read').on(table.userId, table.isRead),
  createdAtIdx: index('idx_notifications_created_at').on(table.createdAt),
}));

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
