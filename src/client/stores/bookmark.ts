/**
 * Bookmark Store
 *
 * Manages message bookmarks — toggle, fetch, and lookup
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { chatApi } from '@client/services/chat.api';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('BookmarkStore');

export interface BookmarkItem {
  id: string;
  userId: string;
  messageId: number;
  chatId: string;
  note: string | null;
  createdAt: string;
}

export const useBookmarkStore = defineStore('bookmark', () => {
  const bookmarks = ref<BookmarkItem[]>([]);
  const bookmarkedMessageIds = ref<Set<string>>(new Set());
  const loading = ref(false);

  async function fetchBookmarks() {
    loading.value = true;
    try {
      const result = await chatApi.getBookmarks();
      bookmarks.value = Array.isArray(result) ? result : [];
      bookmarkedMessageIds.value = new Set(
        bookmarks.value.map(b => String(b.messageId))
      );
    } catch (err) {
      logger.error('Failed to fetch bookmarks', err);
    } finally {
      loading.value = false;
    }
  }

  async function toggleBookmark(chatId: string, messageId: string) {
    try {
      if (bookmarkedMessageIds.value.has(messageId)) {
        await chatApi.unbookmarkMessage(chatId, messageId);
        bookmarkedMessageIds.value.delete(messageId);
        bookmarks.value = bookmarks.value.filter(b => String(b.messageId) !== messageId);
      } else {
        await chatApi.bookmarkMessage(chatId, messageId);
        bookmarkedMessageIds.value.add(messageId);
        // Refresh to get the full bookmark object
        await fetchBookmarks();
      }
    } catch (err) {
      logger.error('Failed to toggle bookmark', err);
    }
  }

  function isBookmarked(messageId: string): boolean {
    return bookmarkedMessageIds.value.has(messageId);
  }

  return { bookmarks, bookmarkedMessageIds, loading, fetchBookmarks, toggleBookmark, isBookmarked };
});
