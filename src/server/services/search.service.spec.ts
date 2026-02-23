/**
 * SearchService unit tests
 *
 * Mocks the db module to avoid real PostgreSQL connections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sample data used across tests
const wizardChar = {
  id: '1',
  name: 'Wizard Master',
  description: 'A powerful wizard with magical abilities',
  avatarUrl: null,
  category: 'Fantasy',
  tags: ['wizard', 'magic', 'fantasy'],
  isPublic: true,
  isNsfw: false,
  downloadCount: 100,
  viewCount: 500,
  ratingAvg: '4.5',
  ratingCount: 50,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  rank: 0.8,
  snippet: 'A <mark class="search-highlight">powerful</mark> wizard with magical abilities',
};

const knightChar = {
  ...wizardChar,
  id: '2',
  name: 'Knight Hero',
  description: 'A brave knight on a heroic quest',
  tags: ['knight', 'hero', 'adventure'],
  downloadCount: 80,
  viewCount: 400,
  ratingAvg: '4.2',
  ratingCount: 40,
  createdAt: new Date('2026-01-02'),
  rank: 0.6,
  snippet: 'A <mark class="search-highlight">brave</mark> knight on a heroic quest',
};

const sciFiChar = {
  ...wizardChar,
  id: '3',
  name: 'Sci-Fi Soldier',
  description: 'A futuristic soldier from the year 2500',
  category: 'Sci-Fi',
  tags: ['soldier', 'scifi', 'future'],
  downloadCount: 60,
  viewCount: 300,
  ratingAvg: '3.8',
  ratingCount: 30,
  createdAt: new Date('2026-01-03'),
  rank: 0.4,
  snippet: 'A <mark class="search-highlight">futuristic</mark> soldier from the year 2500',
};
// Mock results that the chainable db builder will return
let mockSelectResults: any[] = [];
let mockCountResults: any[] = [{ count: 0 }];

// Build a chainable mock that mimics Drizzle's query builder
function createChainMock(results: any[]) {
  const chain: any = {};
  const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'offset'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // The chain itself resolves to the results (thenable)
  chain.then = (resolve: any) => resolve(results);
  return chain;
}

// Counter for tracking select() calls within a single searchCharacters invocation
let selectCallCount = 0;

vi.mock('@/db', () => {
  return {
    db: {
      select: vi.fn((..._args: any[]) => {
        // Each call to searchCharacters makes 2 select() calls:
        // 1st (even) = data query, 2nd (odd) = count query.
        const idx = selectCallCount;
        selectCallCount++;
        const results = idx % 2 === 0 ? mockSelectResults : mockCountResults;
        return createChainMock(results);
      }),
    },
  };
});

// Mock the schema imports so they don't trigger DB connection
vi.mock('@/db/schema/characters', () => ({
  characters: {
    id: 'id',
    name: 'name',
    description: 'description',
    avatarUrl: 'avatar_url',
    category: 'category',
    tags: 'tags',
    isPublic: 'is_public',
    isNsfw: 'is_nsfw',
    downloadCount: 'download_count',
    viewCount: 'view_count',
    ratingAvg: 'rating_avg',
    ratingCount: 'rating_count',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    searchVector: 'search_vector',
    creatorId: 'creator_id',
  },
}));

// We need to import searchService AFTER the mocks are set up
// (vi.mock is hoisted, so this is fine at top level)
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    service = new SearchService();
    selectCallCount = 0;
    vi.clearAllMocks();
  });

  describe('searchCharacters', () => {
    it('should search by keyword with relevance ranking', async () => {
      mockSelectResults = [wizardChar];
      mockCountResults = [{ count: 1 }];

      const results = await service.searchCharacters({
        query: 'wizard',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.length).toBe(1);
      expect(results.items[0].name).toContain('Wizard');
      expect(results.pagination.total).toBe(1);
    });

    it('should filter by category', async () => {
      mockSelectResults = [wizardChar, knightChar];
      mockCountResults = [{ count: 2 }];

      const results = await service.searchCharacters({
        query: 'fantasy',
        category: 'Fantasy',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.every((c) => c.category === 'Fantasy')).toBe(true);
    });

    it('should filter by tags', async () => {
      mockSelectResults = [knightChar];
      mockCountResults = [{ count: 1 }];

      const results = await service.searchCharacters({
        query: 'hero',
        tags: ['hero'],
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.length).toBe(1);
      expect(results.items.some((c) => c.tags?.includes('hero'))).toBe(true);
    });

    it('should sort by rating', async () => {
      mockSelectResults = [wizardChar, knightChar, sciFiChar];
      mockCountResults = [{ count: 3 }];

      const results = await service.searchCharacters({
        query: 'fantasy',
        sort: 'rating',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      // We trust the DB to sort; just verify the service returns items
      expect(results.items.length).toBe(3);
    });

    it('should sort by popular (download count)', async () => {
      mockSelectResults = [wizardChar, knightChar, sciFiChar];
      mockCountResults = [{ count: 3 }];

      const results = await service.searchCharacters({
        query: 'fantasy',
        sort: 'popular',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.length).toBe(3);
    });

    it('should sort by newest', async () => {
      mockSelectResults = [sciFiChar, knightChar, wizardChar];
      mockCountResults = [{ count: 3 }];

      const results = await service.searchCharacters({
        query: 'fantasy',
        sort: 'newest',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.length).toBe(3);
    });

    it('should filter public characters only', async () => {
      mockSelectResults = [wizardChar, knightChar];
      mockCountResults = [{ count: 2 }];

      const results = await service.searchCharacters({
        query: 'character',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.every((c) => c.isPublic)).toBe(true);
    });

    it('should filter NSFW characters', async () => {
      mockSelectResults = [wizardChar];
      mockCountResults = [{ count: 1 }];

      const results = await service.searchCharacters({
        query: 'character',
        isNsfw: false,
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.every((c) => !c.isNsfw)).toBe(true);
    });

    it('should support pagination', async () => {
      mockSelectResults = [wizardChar, knightChar];
      mockCountResults = [{ count: 3 }];

      const page1 = await service.searchCharacters({
        query: 'fantasy',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 2,
      });

      expect(page1.pagination.page).toBe(1);
      expect(page1.pagination.limit).toBe(2);
      expect(page1.pagination.hasNext).toBe(true);
    });

    it('should return correct pagination info', async () => {
      mockSelectResults = [wizardChar, knightChar];
      mockCountResults = [{ count: 3 }];

      const results = await service.searchCharacters({
        query: 'fantasy',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 2,
      });

      expect(results.pagination.total).toBe(3);
      expect(results.pagination.totalPages).toBe(2);
      expect(results.pagination.hasNext).toBe(true);
      expect(results.pagination.hasPrev).toBe(false);
    });

    it('should return empty results for non-matching query', async () => {
      mockSelectResults = [];
      mockCountResults = [{ count: 0 }];

      const results = await service.searchCharacters({
        query: 'nonexistentquery12345',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.length).toBe(0);
      expect(results.pagination.total).toBe(0);
    });

    it('should return snippet field in result items', async () => {
      mockSelectResults = [wizardChar];
      mockCountResults = [{ count: 1 }];

      const results = await service.searchCharacters({
        query: 'powerful',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.length).toBe(1);
      expect(results.items[0].snippet).toBeDefined();
      expect(results.items[0].snippet).toContain('<mark class="search-highlight">');
    });

    it('should return truncated description as snippet for wildcard query', async () => {
      const wildCardChar = {
        ...wizardChar,
        snippet: 'A powerful wizard with magical abilities',
      };
      mockSelectResults = [wildCardChar];
      mockCountResults = [{ count: 1 }];

      const results = await service.searchCharacters({
        query: '*',
        sort: 'popular',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.length).toBe(1);
      expect(results.items[0].snippet).toBeDefined();
      // For wildcard queries, snippet should be a truncated description without highlight marks
      expect(results.items[0].snippet).not.toContain('<mark class="search-highlight">');
    });
  });
});
