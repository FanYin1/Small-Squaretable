import { z } from 'zod';

// --- Follow ---
export const followUserSchema = z.object({
  followingId: z.string().uuid(),
});
export type FollowUserInput = z.infer<typeof followUserSchema>;

// --- Favorite ---
export const favoriteCharacterSchema = z.object({
  characterId: z.string().uuid(),
});
export type FavoriteCharacterInput = z.infer<typeof favoriteCharacterSchema>;

// --- Comment ---
export const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().uuid().optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const listCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

// --- Notification ---
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

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z.coerce.boolean().default(false),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

// --- API Response types ---
export interface FollowInfo {
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
}

export interface FavoriteInfo {
  isFavorited: boolean;
  favoriteCount: number;
}

export interface CommentWithAuthor {
  id: string;
  content: string;
  parentId: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  replyCount?: number;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
  actor?: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  targetType?: string;
  targetId?: string;
}
