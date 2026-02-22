/**
 * Social Store
 *
 * Manages activity feed, follows, favorites, comments, and comment likes
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { createLogger } from '@client/utils/logger';
import { socialApi } from '@client/services/social.api';
import type { ActivityItem } from '@client/services/social.api';

export type { ActivityItem };

const logger = createLogger('SocialStore');

export const useSocialStore = defineStore('social', () => {
  // Activity feed state
  const activities = ref<ActivityItem[]>([]);
  const feedLoading = ref(false);
  const hasMore = ref(true);
  const error = ref<string | null>(null);

  // Actions
  async function fetchFeed(limit = 20) {
    feedLoading.value = true;
    error.value = null;
    try {
      const result = await socialApi.getFeed(limit, 0);
      activities.value = result;
      hasMore.value = result.length === limit;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch feed';
      logger.error('Failed to fetch feed', e);
    } finally {
      feedLoading.value = false;
    }
  }

  async function fetchMoreFeed(limit = 20) {
    if (feedLoading.value || !hasMore.value) return;
    feedLoading.value = true;
    error.value = null;
    try {
      const offset = activities.value.length;
      const result = await socialApi.getFeed(limit, offset);
      activities.value.push(...result);
      hasMore.value = result.length === limit;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch more feed';
      logger.error('Failed to fetch more feed', e);
    } finally {
      feedLoading.value = false;
    }
  }

  async function fetchUserActivities(userId: string, limit = 20, offset = 0) {
    feedLoading.value = true;
    error.value = null;
    try {
      const result = await socialApi.getUserActivities(userId, limit, offset);
      activities.value = result;
      hasMore.value = result.length === limit;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch user activities';
      logger.error('Failed to fetch user activities', e);
    } finally {
      feedLoading.value = false;
    }
  }

  async function likeComment(commentId: string) {
    error.value = null;
    try {
      await socialApi.likeComment(commentId);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to like comment';
      logger.error('Failed to like comment', e);
      throw e;
    }
  }

  async function unlikeComment(commentId: string) {
    error.value = null;
    try {
      await socialApi.unlikeComment(commentId);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to unlike comment';
      logger.error('Failed to unlike comment', e);
      throw e;
    }
  }

  return {
    activities,
    feedLoading,
    hasMore,
    error,
    fetchFeed,
    fetchMoreFeed,
    fetchUserActivities,
    likeComment,
    unlikeComment,
  };
});
