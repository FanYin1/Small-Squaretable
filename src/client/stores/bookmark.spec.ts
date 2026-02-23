import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useBookmarkStore } from './bookmark';
import { chatApi } from '@client/services/chat.api';

vi.mock('@client/services/chat.api', () => ({
  chatApi: {
    getBookmarks: vi.fn(),
    bookmarkMessage: vi.fn(),
    unbookmarkMessage: vi.fn(),
  },
}));

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

const makeBookmark = (messageId: number, id = 'bk-1') => ({
  id,
  userId: 'user-1',
  messageId,
  note: null,
  createdAt: '2026-02-01T00:00:00Z',
});

describe('Bookmark Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // 1. fetchBookmarks populates bookmarks array and bookmarkedMessageIds set
  it('should populate bookmarks and bookmarkedMessageIds on fetch', async () => {
    const data = [makeBookmark(10, 'bk-1'), makeBookmark(20, 'bk-2')];
    vi.mocked(chatApi.getBookmarks).mockResolvedValue(data);

    const store = useBookmarkStore();
    await store.fetchBookmarks();

    expect(store.bookmarks).toHaveLength(2);
    expect(store.bookmarkedMessageIds.has('10')).toBe(true);
    expect(store.bookmarkedMessageIds.has('20')).toBe(true);
    expect(store.loading).toBe(false);
  });

  // 2. toggleBookmark removes bookmark when already bookmarked
  it('should remove bookmark when message is already bookmarked', async () => {
    vi.mocked(chatApi.unbookmarkMessage).mockResolvedValue(undefined as never);

    const store = useBookmarkStore();
    store.bookmarks = [makeBookmark(10, 'bk-1')];
    store.bookmarkedMessageIds = new Set(['10']);

    await store.toggleBookmark('chat-1', '10');

    expect(chatApi.unbookmarkMessage).toHaveBeenCalledWith('chat-1', '10');
    expect(store.bookmarkedMessageIds.has('10')).toBe(false);
    expect(store.bookmarks).toHaveLength(0);
  });

  // 3. toggleBookmark adds bookmark when not bookmarked
  it('should add bookmark when message is not bookmarked', async () => {
    vi.mocked(chatApi.bookmarkMessage).mockResolvedValue(undefined as never);
    vi.mocked(chatApi.getBookmarks).mockResolvedValue([makeBookmark(10, 'bk-1')]);

    const store = useBookmarkStore();

    await store.toggleBookmark('chat-1', '10');

    expect(chatApi.bookmarkMessage).toHaveBeenCalledWith('chat-1', '10');
    expect(store.bookmarkedMessageIds.has('10')).toBe(true);
    // fetchBookmarks is called after adding, so bookmarks should be populated
    expect(store.bookmarks).toHaveLength(1);
  });

  // 4. isBookmarked returns true for bookmarked message IDs
  it('should return true for bookmarked message IDs', () => {
    const store = useBookmarkStore();
    store.bookmarkedMessageIds = new Set(['10', '20']);

    expect(store.isBookmarked('10')).toBe(true);
    expect(store.isBookmarked('20')).toBe(true);
    expect(store.isBookmarked('30')).toBe(false);
  });

  // 5. Handles API errors gracefully
  it('should handle API errors gracefully without throwing', async () => {
    vi.mocked(chatApi.getBookmarks).mockRejectedValue(new Error('Network error'));

    const store = useBookmarkStore();
    await store.fetchBookmarks();

    expect(store.bookmarks).toEqual([]);
    expect(store.loading).toBe(false);
  });
});
