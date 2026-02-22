/**
 * Social API
 *
 * Handles follows, favorites, and comments API requests
 */

import { api } from './api';
import type { FollowInfo, FavoriteInfo, CommentWithAuthor, ListCommentsQuery } from '@/types/social';

export interface ActivityItem {
  id: string;
  userId: string;
  type: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const socialApi = {
  // Follows
  follow: (userId: string) => api.post('/social/follows', { followingId: userId }),
  unfollow: (userId: string) => api.delete(`/social/follows/${userId}`),
  getFollowStatus: (userId: string) => api.get<FollowInfo>(`/social/follows/${userId}/status`),
  getFollowers: (userId: string, limit = 20, offset = 0) =>
    api.get(`/social/users/${userId}/followers?limit=${limit}&offset=${offset}`),
  getFollowing: (userId: string, limit = 20, offset = 0) =>
    api.get(`/social/users/${userId}/following?limit=${limit}&offset=${offset}`),

  // Favorites
  favorite: (characterId: string) => api.post('/social/favorites', { characterId }),
  unfavorite: (characterId: string) => api.delete(`/social/favorites/${characterId}`),
  getFavoriteStatus: (characterId: string) => api.get<FavoriteInfo>(`/social/favorites/${characterId}/status`),
  getUserFavorites: (limit = 20, offset = 0) =>
    api.get(`/social/favorites?limit=${limit}&offset=${offset}`),

  // Comments
  createComment: (characterId: string, content: string, parentId?: string) =>
    api.post<CommentWithAuthor>(`/social/characters/${characterId}/comments`, { content, parentId }),
  updateComment: (commentId: string, content: string) =>
    api.patch<CommentWithAuthor>(`/social/comments/${commentId}`, { content }),
  deleteComment: (commentId: string) => api.delete(`/social/comments/${commentId}`),
  getComments: (characterId: string, query?: Partial<ListCommentsQuery>) => {
    const params = new URLSearchParams();
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.offset) params.set('offset', String(query.offset));
    if (query?.sort) params.set('sort', query.sort);
    return api.get<CommentWithAuthor[]>(`/social/characters/${characterId}/comments?${params}`);
  },
  getReplies: (commentId: string, limit = 20, offset = 0) =>
    api.get<CommentWithAuthor[]>(`/social/comments/${commentId}/replies?limit=${limit}&offset=${offset}`),

  // Activity Feed
  getFeed: (limit = 20, offset = 0) =>
    api.get<ActivityItem[]>(`/social/feed?limit=${limit}&offset=${offset}`),
  getUserActivities: (userId: string, limit = 20, offset = 0) =>
    api.get<ActivityItem[]>(`/social/users/${userId}/activities?limit=${limit}&offset=${offset}`),

  // Comment Likes
  likeComment: (commentId: string) => api.post(`/social/comments/${commentId}/like`),
  unlikeComment: (commentId: string) => api.delete(`/social/comments/${commentId}/like`),
};
