/**
 * Analytics Store Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAnalyticsStore } from './analytics';
import { analyticsApi } from '@client/services/analytics.api';

vi.mock('@client/services/analytics.api', () => ({
  analyticsApi: {
    getOverview: vi.fn(),
    getRetention: vi.fn(),
    getFunnel: vi.fn(),
    getRealtime: vi.fn(),
    getTopCharacters: vi.fn(),
    getSegments: vi.fn(),
  },
}));

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

// ── Test fixtures ──

const mockMetrics = [
  { week: '2026-02-16', tenant_id: 't1', weekly_active_users: 500, weekly_messages: 12000 },
  { week: '2026-02-09', tenant_id: 't1', weekly_active_users: 450, weekly_messages: 10000 },
];

const mockRetention = [
  { cohort_week: '2026-02-02', week_offset: 0, users: 100 },
  { cohort_week: '2026-02-02', week_offset: 1, users: 60 },
];

const mockFunnel = [
  { step: 'visit', users: 1000 },
  { step: 'signup', users: 300 },
  { step: 'first_chat', users: 150 },
  { step: 'subscription', users: 40 },
];
const mockRealtime = { activeUsers: 42, eventsPerMin: 120, messagesPerMin: 35 };

const mockTopCharacters = [
  { character_id: 'c1', total_messages: 5000, total_chat_starts: 200, avg_rating: 4.8 },
  { character_id: 'c2', total_messages: 3000, total_chat_starts: 150, avg_rating: 4.5 },
];

const mockSegments = [
  { segment: 'power', user_count: 50 },
  { segment: 'active', user_count: 200 },
  { segment: 'casual', user_count: 500 },
  { segment: 'dormant', user_count: 250 },
];

describe('Analytics Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // ── 1. Initial state ──

  describe('Initial State', () => {
    it('should have empty arrays, null realtime, all loading false, and null error', () => {
      const store = useAnalyticsStore();

      expect(store.overview).toEqual([]);
      expect(store.retention).toEqual([]);
      expect(store.funnel).toEqual([]);
      expect(store.realtime).toBeNull();
      expect(store.topCharacters).toEqual([]);
      expect(store.segments).toEqual([]);
      expect(store.error).toBeNull();
      expect(store.loadingOverview).toBe(false);
      expect(store.loadingRetention).toBe(false);
      expect(store.loadingFunnel).toBe(false);
      expect(store.loadingRealtime).toBe(false);
      expect(store.loadingTopCharacters).toBe(false);
      expect(store.loadingSegments).toBe(false);
    });
  });

  // ── 2-5. Computed getters ──

  describe('Computed Getters', () => {
    it('isLoading returns true when any loading flag is true', () => {
      const store = useAnalyticsStore();
      expect(store.isLoading).toBe(false);

      store.loadingFunnel = true;
      expect(store.isLoading).toBe(true);
    });

    it('hasData returns false when overview is empty, true when populated', () => {
      const store = useAnalyticsStore();
      expect(store.hasData).toBe(false);

      store.overview = mockMetrics;
      expect(store.hasData).toBe(true);
    });

    it('latestMetrics returns null when empty, first item when populated', () => {
      const store = useAnalyticsStore();
      expect(store.latestMetrics).toBeNull();

      store.overview = mockMetrics;
      expect(store.latestMetrics).toEqual(mockMetrics[0]);
    });

    it('totalSegmentedUsers sums user_count across all segments', () => {
      const store = useAnalyticsStore();
      expect(store.totalSegmentedUsers).toBe(0);

      store.segments = mockSegments;
      expect(store.totalSegmentedUsers).toBe(1000);
    });
  });

  // ── 6-8. fetchOverview ──

  describe('fetchOverview', () => {
    it('should set overview on success', async () => {
      vi.mocked(analyticsApi.getOverview).mockResolvedValue({ metrics: mockMetrics });

      const store = useAnalyticsStore();
      await store.fetchOverview(4);

      expect(analyticsApi.getOverview).toHaveBeenCalledWith(4);
      expect(store.overview).toEqual(mockMetrics);
      expect(store.loadingOverview).toBe(false);
    });

    it('should set error message on failure', async () => {
      vi.mocked(analyticsApi.getOverview).mockRejectedValue(new Error('Network error'));

      const store = useAnalyticsStore();
      await store.fetchOverview();

      expect(store.error).toBe('Failed to load overview metrics');
      expect(store.loadingOverview).toBe(false);
    });

    it('should skip if already loading', async () => {
      const store = useAnalyticsStore();
      store.loadingOverview = true;

      await store.fetchOverview();

      expect(analyticsApi.getOverview).not.toHaveBeenCalled();
    });
  });

  // ── 9-10. fetchRetention ──

  describe('fetchRetention', () => {
    it('should set retention on success', async () => {
      vi.mocked(analyticsApi.getRetention).mockResolvedValue({ matrix: mockRetention });

      const store = useAnalyticsStore();
      await store.fetchRetention(8);

      expect(analyticsApi.getRetention).toHaveBeenCalledWith(8);
      expect(store.retention).toEqual(mockRetention);
      expect(store.loadingRetention).toBe(false);
    });

    it('should set error message on failure', async () => {
      vi.mocked(analyticsApi.getRetention).mockRejectedValue(new Error('fail'));

      const store = useAnalyticsStore();
      await store.fetchRetention();

      expect(store.error).toBe('Failed to load retention data');
      expect(store.loadingRetention).toBe(false);
    });
  });

  // ── 11-12. fetchFunnel ──

  describe('fetchFunnel', () => {
    it('should set funnel on success', async () => {
      vi.mocked(analyticsApi.getFunnel).mockResolvedValue({ steps: mockFunnel });

      const store = useAnalyticsStore();
      await store.fetchFunnel(30);

      expect(analyticsApi.getFunnel).toHaveBeenCalledWith(30);
      expect(store.funnel).toEqual(mockFunnel);
      expect(store.loadingFunnel).toBe(false);
    });

    it('should set error message on failure', async () => {
      vi.mocked(analyticsApi.getFunnel).mockRejectedValue(new Error('fail'));

      const store = useAnalyticsStore();
      await store.fetchFunnel();

      expect(store.error).toBe('Failed to load funnel data');
      expect(store.loadingFunnel).toBe(false);
    });
  });

  // ── 13-14. fetchRealtime ──

  describe('fetchRealtime', () => {
    it('should set realtime on success', async () => {
      vi.mocked(analyticsApi.getRealtime).mockResolvedValue(mockRealtime);

      const store = useAnalyticsStore();
      await store.fetchRealtime();

      expect(analyticsApi.getRealtime).toHaveBeenCalled();
      expect(store.realtime).toEqual(mockRealtime);
      expect(store.loadingRealtime).toBe(false);
    });

    it('should set error message on failure', async () => {
      vi.mocked(analyticsApi.getRealtime).mockRejectedValue(new Error('fail'));

      const store = useAnalyticsStore();
      await store.fetchRealtime();

      expect(store.error).toBe('Failed to load realtime metrics');
      expect(store.loadingRealtime).toBe(false);
    });
  });

  // ── 15-16. fetchTopCharacters ──

  describe('fetchTopCharacters', () => {
    it('should set topCharacters on success', async () => {
      vi.mocked(analyticsApi.getTopCharacters).mockResolvedValue({ characters: mockTopCharacters });

      const store = useAnalyticsStore();
      await store.fetchTopCharacters(10);

      expect(analyticsApi.getTopCharacters).toHaveBeenCalledWith(10);
      expect(store.topCharacters).toEqual(mockTopCharacters);
      expect(store.loadingTopCharacters).toBe(false);
    });

    it('should set error message on failure', async () => {
      vi.mocked(analyticsApi.getTopCharacters).mockRejectedValue(new Error('fail'));

      const store = useAnalyticsStore();
      await store.fetchTopCharacters();

      expect(store.error).toBe('Failed to load top characters');
      expect(store.loadingTopCharacters).toBe(false);
    });
  });

  // ── 17-18. fetchSegments ──

  describe('fetchSegments', () => {
    it('should set segments on success', async () => {
      vi.mocked(analyticsApi.getSegments).mockResolvedValue({ segments: mockSegments });

      const store = useAnalyticsStore();
      await store.fetchSegments();

      expect(analyticsApi.getSegments).toHaveBeenCalled();
      expect(store.segments).toEqual(mockSegments);
      expect(store.loadingSegments).toBe(false);
    });

    it('should set error message on failure', async () => {
      vi.mocked(analyticsApi.getSegments).mockRejectedValue(new Error('fail'));

      const store = useAnalyticsStore();
      await store.fetchSegments();

      expect(store.error).toBe('Failed to load user segments');
      expect(store.loadingSegments).toBe(false);
    });
  });

  // ── 19. fetchAll ──

  describe('fetchAll', () => {
    it('should call all fetch methods in parallel', async () => {
      vi.mocked(analyticsApi.getOverview).mockResolvedValue({ metrics: mockMetrics });
      vi.mocked(analyticsApi.getRetention).mockResolvedValue({ matrix: mockRetention });
      vi.mocked(analyticsApi.getFunnel).mockResolvedValue({ steps: mockFunnel });
      vi.mocked(analyticsApi.getRealtime).mockResolvedValue(mockRealtime);
      vi.mocked(analyticsApi.getTopCharacters).mockResolvedValue({ characters: mockTopCharacters });
      vi.mocked(analyticsApi.getSegments).mockResolvedValue({ segments: mockSegments });

      const store = useAnalyticsStore();
      await store.fetchAll();

      expect(analyticsApi.getOverview).toHaveBeenCalled();
      expect(analyticsApi.getRetention).toHaveBeenCalled();
      expect(analyticsApi.getFunnel).toHaveBeenCalled();
      expect(analyticsApi.getRealtime).toHaveBeenCalled();
      expect(analyticsApi.getTopCharacters).toHaveBeenCalled();
      expect(analyticsApi.getSegments).toHaveBeenCalled();

      expect(store.overview).toEqual(mockMetrics);
      expect(store.retention).toEqual(mockRetention);
      expect(store.funnel).toEqual(mockFunnel);
      expect(store.realtime).toEqual(mockRealtime);
      expect(store.topCharacters).toEqual(mockTopCharacters);
      expect(store.segments).toEqual(mockSegments);
      expect(store.error).toBeNull();
    });
  });

  // ── 20. $reset ──

  describe('$reset', () => {
    it('should clear all state back to initial values', async () => {
      vi.mocked(analyticsApi.getOverview).mockResolvedValue({ metrics: mockMetrics });
      vi.mocked(analyticsApi.getRetention).mockResolvedValue({ matrix: mockRetention });
      vi.mocked(analyticsApi.getFunnel).mockResolvedValue({ steps: mockFunnel });
      vi.mocked(analyticsApi.getRealtime).mockResolvedValue(mockRealtime);
      vi.mocked(analyticsApi.getTopCharacters).mockResolvedValue({ characters: mockTopCharacters });
      vi.mocked(analyticsApi.getSegments).mockResolvedValue({ segments: mockSegments });

      const store = useAnalyticsStore();
      await store.fetchAll();

      // Verify data was loaded
      expect(store.overview.length).toBeGreaterThan(0);

      store.$reset();

      expect(store.overview).toEqual([]);
      expect(store.retention).toEqual([]);
      expect(store.funnel).toEqual([]);
      expect(store.realtime).toBeNull();
      expect(store.topCharacters).toEqual([]);
      expect(store.segments).toEqual([]);
      expect(store.error).toBeNull();
    });
  });
});
